import { expect, type Page, test } from '@playwright/test';

import { openApp, serverSays } from '../e2e/authHelpers';
import { expectNoLeak } from './leaks';
import { collectLongTasks, expectNoLongTasks, startLongTaskCollector } from './longTasks';

// A busy loop in a timer task. (Code run through CDP `Runtime.evaluate` is not an event-loop task, so it is never
// reported as a long task.)
const blockMainThread = (page: Page, ms: number) =>
  page.evaluate(
    (duration) =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          const end = performance.now() + duration;
          while (performance.now() < end);
          resolve();
        }),
      ),
    ms,
  );

// These run against the production build (playwright.perf.config.ts). Every ported screen adds its own
// "open / close" cycle to the leak test and its own interaction to the long-task test.

const QR_CODE = { token: 'dGVzdC10b2tlbg', expires: 4102444800 };

test.describe('leaks', () => {
  // A full mount / unmount cycle of two auth screens (the Transition drops the outgoing slide on the next step), with
  // the QR code library, the lottie plane and the country dropdown created and destroyed on the way.
  test('toggling the QR code and phone number screens does not leak', async ({ page }) => {
    await openApp(page);

    const toggle = async () => {
      await serverSays(page, 'authorizationStateWaitQrCode', { qrCode: QR_CODE });
      await page.locator('#auth-qr-form').waitFor();
      await serverSays(page, 'authorizationStateWaitPhoneNumber');
      await page.locator('#auth-phone-number-form').waitFor();
    };

    const result = await expectNoLeak(page, toggle, { runs: 30, maxGrowthKb: 512, warmupRuns: 5 });
    test.info().annotations.push({ type: 'heap', description: `${result.growthKb.toFixed(0)} KB over 30 runs` });
  });

  test('the helper detects a deliberate leak', async ({ page }) => {
    await page.goto('/');
    await expect(
      expectNoLeak(
        page,
        () =>
          page.evaluate(() => {
            const bucket = ((window as unknown as { __leak?: unknown[] }).__leak ??= []);
            bucket.push(new Array(32_000).fill(Math.random())); // ~256 KB kept alive per run
          }),
        { runs: 20, maxGrowthKb: 1024, warmupRuns: 1 },
      ),
    ).rejects.toThrow(/JS heap grew by/);
  });
});

test.describe('long tasks under 4x CPU throttling', () => {
  test('typing on the auth screens stays under 50 ms per task', async ({ page }) => {
    await openApp(page);
    await serverSays(page, 'authorizationStateWaitPhoneNumber');
    await page.locator('#auth-phone-number-form').waitFor();

    await expectNoLongTasks(
      page,
      async () => {
        await page.locator('#sign-in-phone-number').pressSequentially('6505551234', { delay: 20 });
        await serverSays(page, 'authorizationStateWaitCode', { isCodeViaApp: false });
        await page.locator('#sign-in-code').waitFor();
        await page.locator('#sign-in-code').pressSequentially('1234', { delay: 20 });
      },
      { maxMs: 50 },
    );
  });

  test('the collector sees a deliberately long task', async ({ page }) => {
    await page.goto('/');
    await expect(expectNoLongTasks(page, () => blockMainThread(page, 120))).rejects.toThrow(/longer than 50 ms/);
  });

  test('without throttling the collector still records tasks', async ({ page }) => {
    await page.goto('/');
    await startLongTaskCollector(page);
    await blockMainThread(page, 120);
    expect((await collectLongTasks(page)).length).toBeGreaterThan(0);
  });
});
