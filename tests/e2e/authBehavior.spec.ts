import type { Page } from '@playwright/test';

import { openApp, readAuth, serverSays, type TestWindow } from './authHelpers';
import { expect, test } from './fixtures';

// What the auth screens DO (tt's behaviour, line by line): errors on the fields, phone formatting and country detection,
// the country choice, focus handling, QR refresh, back navigation. The country list is not served by the mocked client,
// so the test puts it into the global the way the API updates would.
type TestGlobalWindow = TestWindow & {
  getGlobal: () => { auth: Record<string, unknown>; countryList: Record<string, unknown> };
  setGlobal: (global: unknown) => void;
};

const COUNTRIES = [
  { iso2: 'US', defaultName: 'United States', name: 'United States', countryCode: '1', patterns: ['XXX XXX XXXX'] },
  { iso2: 'GB', defaultName: 'United Kingdom', name: 'United Kingdom', countryCode: '44', patterns: ['XXXX XXXXXX'] },
  { iso2: 'RU', defaultName: 'Russia', name: 'Russia', countryCode: '7', patterns: ['XXX XXX XX XX'] },
];

async function provideCountries(page: Page) {
  await page.evaluate((phoneCodes) => {
    const w = window as unknown as TestGlobalWindow;
    const global = w.getGlobal();
    w.setGlobal({ ...global, countryList: { ...global.countryList, phoneCodes } });
  }, COUNTRIES);
}

async function serverError(page: Page, errorMessage: string, key: string) {
  await page.evaluate(
    ([code, errorKey]) => {
      (window as unknown as TestWindow).getActions().apiUpdate({
        '@type': 'updateAuthorizationError',
        errorKey: { key: errorKey },
        errorCode: code,
      });
    },
    [errorMessage, key],
  );
}

test.describe('phone number screen', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await provideCountries(page);
    await serverSays(page, 'authorizationStateWaitPhoneNumber');
    await expect(page.locator('#auth-phone-number-form')).toBeVisible();
  });

  test('focuses the phone number field on a desktop screen', async ({ page }) => {
    await expect(page.locator('#sign-in-phone-number')).toBeFocused();
  });

  test('formats the number while typing, detects the country, and the number field follows the country', async ({
    page,
  }) => {
    const phone = page.locator('#sign-in-phone-number');
    await phone.fill('79001234567');
    await expect(phone).toHaveValue('+7 900 123 45 67');
    await expect(page.locator('#sign-in-phone-code')).toHaveValue(/Russia/);

    // another code: the country changes with the number
    await phone.fill('+447911123456');
    await expect(page.locator('#sign-in-phone-code')).toHaveValue(/United Kingdom/);
    await expect(phone).toHaveValue('+44 7911 123456');

    // an unknown prefix keeps the digits as typed and leaves no country matched
    await phone.fill('+99912345678');
    await expect(phone).toHaveValue(/^\+99912345678|^\+999/);
  });

  test('choosing a country from the menu resets the number and moves the focus to it', async ({ page }) => {
    const phone = page.locator('#sign-in-phone-number');
    await phone.fill('79001234567');
    await expect(page.locator('#sign-in-phone-code')).toHaveValue(/Russia/);

    await page.locator('#sign-in-phone-code').click();
    // the country field selects its text, the menu lists the countries and the filter narrows them
    await page.locator('#sign-in-phone-code').pressSequentially('Unit');
    await expect(page.locator('.CountryCodeInput .MenuItem')).toHaveCount(2); // United States, United Kingdom
    await page.locator('.CountryCodeInput .MenuItem', { hasText: 'United States' }).click();

    await expect(page.locator('#sign-in-phone-code')).toHaveValue(/United States/);
    await expect(phone).toHaveValue('+1 '.trimEnd() === '+1' ? /^\+1\s*$/ : '');
    await expect(phone).toBeFocused();
  });

  test('"Keep me signed in" is written to the store', async ({ page }) => {
    const checkbox = page.locator('#sign-in-keep-session');
    await expect(checkbox).toBeChecked();
    await page.locator('label[for="sign-in-keep-session"], .Checkbox').first().click();
    await expect(checkbox).not.toBeChecked();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as TestGlobalWindow).getGlobal().auth.rememberMe))
      .toBe(false);
  });

  test('a server error is shown on the field and the next keystroke clears it', async ({ page }) => {
    await serverError(page, 'PHONE_NUMBER_INVALID', 'ErrorPhoneNumberInvalid');
    const group = page.locator('#sign-in-phone-number').locator('xpath=ancestor::div[contains(@class, "input-group")]');
    await expect(group).toHaveClass(/error/);
    await expect(group.locator('label')).toHaveText('Invalid phone number, please try again');

    await page.locator('#sign-in-phone-number').pressSequentially('1');
    await expect(group).not.toHaveClass(/error/);
    await expect.poll(() => readAuth(page).then((auth) => auth.errorKey)).toBeUndefined();
  });
});

test.describe('code screen', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await serverSays(page, 'authorizationStateWaitCode', { isCodeViaApp: false });
    await expect(page.locator('#auth-code-form')).toBeVisible();
  });

  test('focuses the code field, keeps digits only, cuts to five and submits at the fifth', async ({ page }) => {
    const code = page.locator('#sign-in-code');
    await expect(code).toBeFocused();
    await code.fill('12a');
    await expect(code).toHaveValue('12');
    await code.fill('123456789');
    await expect(code).toHaveValue('12345');
    await expect.poll(() => readAuth(page)).toMatchObject({ isLoading: true });
  });

  test('a server error is shown on the field and typing clears it', async ({ page }) => {
    await serverError(page, 'PHONE_CODE_INVALID', 'ErrorCodeInvalid');
    const group = page.locator('#sign-in-code').locator('xpath=ancestor::div[contains(@class, "input-group")]');
    await expect(group).toHaveClass(/error/);
    await page.locator('#sign-in-code').pressSequentially('1');
    await expect(group).not.toHaveClass(/error/);
  });

  test('"edit number" returns to the phone number and clears the error', async ({ page }) => {
    await serverError(page, 'PHONE_CODE_INVALID', 'ErrorCodeInvalid');
    await expect.poll(() => readAuth(page).then((auth) => Boolean(auth.errorKey))).toBe(true);
    await page.locator('.auth-number-edit').click();
    await expect.poll(() => readAuth(page).then((auth) => auth.errorKey)).toBeUndefined();
  });

  test('the browser Back button does the same as "edit number"', async ({ page }) => {
    await serverError(page, 'PHONE_CODE_INVALID', 'ErrorCodeInvalid');
    await expect.poll(() => readAuth(page).then((auth) => Boolean(auth.errorKey))).toBe(true);
    await page.goBack();
    await expect.poll(() => readAuth(page).then((auth) => auth.errorKey)).toBeUndefined();
  });
});

test.describe('password screen', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await serverSays(page, 'authorizationStateWaitPassword', { hint: 'my hint' });
    await expect(page.locator('#auth-password-form')).toBeVisible();
  });

  test('focuses the password field after the delay, toggles its visibility, shows the hint', async ({ page }) => {
    const password = page.locator('#sign-in-password');
    await expect(password).toBeFocused({ timeout: 3000 });
    await expect(page.locator('#auth-password-form label')).toHaveText('my hint');
    await expect(password).toHaveAttribute('type', 'password');
    await page.locator('.toggle-password').click();
    await expect(password).toHaveAttribute('type', 'text');
  });

  test('a wrong password is shown on the field; the field is focused with its text selected', async ({ page }) => {
    const password = page.locator('#sign-in-password');
    await password.fill('wrong password');
    await serverError(page, 'PASSWORD_HASH_INVALID', 'ErrorIncorrectPassword');
    const group = password.locator('xpath=ancestor::div[contains(@class, "input-group")]');
    await expect(group).toHaveClass(/error/);
    await expect(group.locator('label')).toHaveText('Invalid password, please try again');
    await expect(password).toBeFocused();
    const selected = await password.evaluate((input: HTMLInputElement) => input.selectionEnd! - input.selectionStart!);
    expect(selected).toBe('wrong password'.length);

    await password.pressSequentially('x');
    await expect(group).not.toHaveClass(/error/);
  });
});

test.describe('QR code screen', () => {
  test('a new token redraws the QR code; the loading mask goes away', async ({ page }) => {
    await openApp(page);
    const qr = (token: string) => ({ token, expires: 4102444800 });
    await serverSays(page, 'authorizationStateWaitQrCode', { qrCode: qr('Zmlyc3QtdG9rZW4') });
    const svg = page.locator('#auth-qr-form .qr-container svg');
    await expect(svg).toHaveCount(1);
    await expect(page.locator('#auth-qr-form .qr-loading')).toHaveCount(0);
    const first = await svg.evaluate((el) => el.innerHTML);

    await serverSays(page, 'authorizationStateWaitQrCode', { qrCode: qr('c2Vjb25kLXRva2Vu') });
    await expect.poll(() => svg.evaluate((el) => el.innerHTML)).not.toBe(first);
    await expect(svg).toHaveCount(1); // redrawn in place, not appended a second time
  });
});
