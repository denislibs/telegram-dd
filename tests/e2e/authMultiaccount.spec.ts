import { openApp, serverSays } from './authHelpers';
import { expect, test } from './fixtures';

// Multi-account on the login screens (tt: AuthPhoneNumber / AuthQrCode read the logged-in slots of the session store):
// a tab that is adding an account gets a back button, and a number that is already logged in in another slot opens
// that slot instead of starting a second login.
const OTHER_SLOT_PHONE = '15551234567';
// A tab of slot 3 is adding an account (a first-slot tab without a session would be redirected to slot 2 at boot).
const THIS_TAB = '/?account=3';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((phone) => {
    localStorage.setItem('account2', JSON.stringify({ dcId: 2, userId: '200', phone, firstName: 'Ada' }));
  }, OTHER_SLOT_PHONE);
});

test('the phone number screen has a back button that leads to the logged-in account', async ({ page }) => {
  await openApp(page, THIS_TAB);
  await serverSays(page, 'authorizationStateWaitPhoneNumber');
  const back = page.locator('#auth-phone-number-form .auth-close');
  await expect(back).toBeVisible();

  await Promise.all([page.waitForURL(/[?&]account=2\b/), back.click()]);
});

test('a number that is logged in in another slot opens that slot', async ({ page }) => {
  await openApp(page, THIS_TAB);
  await serverSays(page, 'authorizationStateWaitPhoneNumber');
  await page.locator('#sign-in-phone-number').fill(`+${OTHER_SLOT_PHONE}`);

  await Promise.all([page.waitForURL(/[?&]account=2\b/), page.getByRole('button', { name: 'Next' }).click()]);
});

test('a number that is not logged in anywhere starts the login', async ({ page }) => {
  await openApp(page, THIS_TAB);
  await serverSays(page, 'authorizationStateWaitPhoneNumber');
  await page.locator('#sign-in-phone-number').fill('+1 555 000 0000');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { getGlobal: () => { auth: { isLoading?: boolean } } }).getGlobal().auth.isLoading,
      ),
    )
    .toBe(true);
  expect(page.url()).toContain('account=3'); // stayed on this tab's slot
});

test('the QR code screen has the back button too', async ({ page }) => {
  await openApp(page, THIS_TAB);
  await serverSays(page, 'authorizationStateWaitQrCode', {
    qrCode: { token: 'dGVzdC10b2tlbg', expires: 4102444800 },
  });
  const back = page.locator('#auth-qr-form .auth-close');
  await expect(back).toBeVisible();
  await Promise.all([page.waitForURL(/[?&]account=2\b/), back.click()]);
});
