import { openApp, serverSays } from '../e2e/authHelpers';
import { test } from '../e2e/fixtures'; // the strict fixture: console problems and stricterdom violations fail the run too
import { expectAccessible } from './axe';

// axe measures colours: let the fade of the screen transition (and its fallback timer) finish first, or the result depends on
// the opacity of the frame it happens to hit.
const SETTLE_MS = 1200;

// One test per auth screen; the test title is the key of its entry in tests/a11y/baseline.json. The screens are reached
// the way tests/e2e/auth.spec.ts does it: the mocked client boots logged in and the test plays the server.
test('auth: phone number', async ({ page }) => {
  await openApp(page);
  await serverSays(page, 'authorizationStateWaitPhoneNumber');
  await page.locator('#auth-phone-number-form').waitFor();
  await page.waitForTimeout(SETTLE_MS);
  await expectAccessible(page, '#auth-phone-number-form', { screen: 'auth: phone number' });
});

test('auth: code', async ({ page }) => {
  await openApp(page);
  await serverSays(page, 'authorizationStateWaitCode', { isCodeViaApp: false });
  await page.locator('#auth-code-form').waitFor();
  await page.waitForTimeout(SETTLE_MS);
  await expectAccessible(page, '#auth-code-form', { screen: 'auth: code' });
});

test('auth: password', async ({ page }) => {
  await openApp(page);
  await serverSays(page, 'authorizationStateWaitPassword', { hint: 'a hint' });
  await page.locator('#auth-password-form').waitFor();
  await page.waitForTimeout(SETTLE_MS);
  await expectAccessible(page, '#auth-password-form', { screen: 'auth: password' });
});

test('auth: registration', async ({ page }) => {
  await openApp(page);
  await serverSays(page, 'authorizationStateWaitRegistration');
  await page.locator('#auth-registration-form').waitFor();
  await page.waitForTimeout(SETTLE_MS);
  await expectAccessible(page, '#auth-registration-form', { screen: 'auth: registration' });
});

test('auth: QR code', async ({ page }) => {
  await openApp(page);
  await serverSays(page, 'authorizationStateWaitQrCode', {
    qrCode: { token: 'dGVzdC10b2tlbg', expires: Math.floor(Date.now() / 1000) + 3600 },
  });
  await page.locator('#auth-qr-form .qr-container svg').waitFor({ state: 'attached' });
  await page.waitForTimeout(SETTLE_MS);
  await expectAccessible(page, '#auth-qr-form', { screen: 'auth: QR code' });
});
