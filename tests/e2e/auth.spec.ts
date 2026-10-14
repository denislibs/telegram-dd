import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// The auth flow against the mocked client (docs/quality-gates.md). The mocked client boots logged in, so the "server"
// side of the login is played by the test: it feeds `apiUpdate` actions (exactly what the API worker sends) and the
// UI answers with the real auth actions. Every test runs under the strict fixture: no console problems, no stricterdom
// violations.
type AuthState =
  | 'authorizationStateWaitPhoneNumber'
  | 'authorizationStateWaitCode'
  | 'authorizationStateWaitPassword'
  | 'authorizationStateWaitRegistration'
  | 'authorizationStateWaitQrCode'
  | 'authorizationStateReady';

type TestWindow = {
  getActions: () => { apiUpdate: (update: Record<string, unknown>) => void };
  getGlobal: () => { auth: Record<string, unknown> };
};

async function serverSays(page: Page, authorizationState: AuthState, extra: Record<string, unknown> = {}) {
  await page.evaluate(
    ({ state, fields }) => {
      (window as unknown as TestWindow).getActions().apiUpdate({
        '@type': 'updateAuthorizationState',
        authorizationState: state,
        ...fields,
      });
    },
    { state: authorizationState, fields: extra },
  );
}

async function readAuth(page: Page) {
  return page.evaluate(() => {
    const { auth } = (window as unknown as TestWindow).getGlobal();
    return { state: auth.state, isLoading: auth.isLoading, errorKey: auth.errorKey };
  });
}

// The mocked API worker answers `authorizationStateReady` and `updateApiReady` shortly after it started, and the app
// then runs its sync (DEBUG logs `>>> START SYNC`, a few times). The sync handlers write whole-global snapshots taken
// before their awaits, which would silently undo an auth step the test played in the middle of them. So the test waits
// until the sync has been quiet for a moment before it starts playing the server.
function waitForQuietSync(page: Page, quietMs = 1000) {
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    page.on('console', (message) => {
      if (!message.text().includes('>>> START SYNC')) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(resolve, quietMs);
    });
  });
}

async function openApp(page: Page) {
  const quiet = waitForQuietSync(page);
  await page.goto('/');
  await expect(page.locator('#Main')).toBeVisible();
  await quiet;
}

test('phone number -> code -> password -> registration -> main', async ({ page }) => {
  await openApp(page);

  // 1. Phone number
  await serverSays(page, 'authorizationStateWaitPhoneNumber');
  await expect(page.locator('#auth-phone-number-form')).toBeVisible();
  await expect(page.locator('#auth-phone-number-form h1')).toHaveText('Telegram');
  const phone = page.locator('#sign-in-phone-number');
  await phone.fill('+1 650 555 1234');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect
    .poll(() => readAuth(page))
    .toMatchObject({ state: 'authorizationStateWaitPhoneNumber', isLoading: true });

  // 2. Code
  await serverSays(page, 'authorizationStateWaitCode', { isCodeViaApp: false });
  await expect(page.locator('#auth-code-form')).toBeVisible();
  await expect(page.locator('#auth-phone-number-form')).toBeHidden(); // the outgoing slide is inactive
  await page.locator('#sign-in-code').fill('12345');
  await expect.poll(() => readAuth(page)).toMatchObject({ state: 'authorizationStateWaitCode', isLoading: true });

  // A wrong code is reported by the server and shown on the field.
  await page.evaluate(() => {
    (window as unknown as TestWindow).getActions().apiUpdate({
      '@type': 'updateAuthorizationError',
      errorKey: { key: 'ErrorIncorrectCode' },
      errorCode: 'PHONE_CODE_INVALID',
    });
  });
  await expect.poll(() => readAuth(page).then((auth) => Boolean(auth.errorKey))).toBe(true);

  // 3. Password
  await serverSays(page, 'authorizationStateWaitPassword', { hint: 'a hint' });
  await expect(page.locator('#auth-password-form')).toBeVisible();
  await page.locator('#sign-in-password').fill('correct horse');
  await page.locator('#auth-password-form').getByRole('button', { name: 'Next' }).click();
  await expect.poll(() => readAuth(page)).toMatchObject({ state: 'authorizationStateWaitPassword', isLoading: true });

  // 4. Registration
  await serverSays(page, 'authorizationStateWaitRegistration');
  await expect(page.locator('#auth-registration-form')).toBeVisible();
  await page.locator('#registration-first-name').fill('Ada');
  await page.locator('#auth-registration-form').getByRole('button', { name: 'Next' }).click();
  await expect
    .poll(() => readAuth(page))
    .toMatchObject({ state: 'authorizationStateWaitRegistration', isLoading: true });

  // 5. Ready: the main placeholder
  await serverSays(page, 'authorizationStateReady');
  await expect(page.locator('#Main')).toBeVisible();
  await expect(page.locator('#auth-registration-form')).toBeHidden();
});

test('QR code screen and the way back to the phone number', async ({ page }) => {
  await openApp(page);

  await serverSays(page, 'authorizationStateWaitQrCode', {
    qrCode: { token: 'dGVzdC10b2tlbg', expires: Math.floor(Date.now() / 1000) + 3600 },
  });
  await expect(page.locator('#auth-qr-form')).toBeVisible();
  // The styled QR code (qr-code-styling) is drawn into the container once the library has loaded.
  await expect(page.locator('#auth-qr-form .qr-container svg, #auth-qr-form .qr-container canvas')).toHaveCount(1);

  await page.getByRole('button', { name: 'Log in by phone number' }).click();
  await serverSays(page, 'authorizationStateWaitPhoneNumber');
  await expect(page.locator('#auth-phone-number-form')).toBeVisible();
});

test('the country picker opens on focus and closes on Escape', async ({ page }) => {
  await openApp(page);
  await serverSays(page, 'authorizationStateWaitPhoneNumber');
  await expect(page.locator('#auth-phone-number-form')).toBeVisible();

  // The mocked client has no country list: the menu shows its "no results" row.
  await page.locator('#sign-in-phone-code').click();
  const menu = page.locator('.CountryCodeInput .bubble');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.no-results')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});
