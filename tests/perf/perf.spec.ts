import { expect, type Page, test } from '@playwright/test';

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

test.describe('leaks', () => {
  test('clicking the counter does not leak', async ({ page }) => {
    await page.goto('/');
    const counter = page.getByRole('button', { name: /clicks:/ });
    await expect(counter).toBeVisible();

    const result = await expectNoLeak(page, () => counter.click(), { runs: 50, maxGrowthKb: 512 });
    test.info().annotations.push({ type: 'heap', description: `${result.growthKb.toFixed(0)} KB over 50 runs` });
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
  test('clicking the counter stays under 50 ms per task', async ({ page }) => {
    await page.goto('/');
    const counter = page.getByRole('button', { name: /clicks:/ });
    await expect(counter).toBeVisible();

    await expectNoLongTasks(
      page,
      async () => {
        for (let i = 0; i < 20; i++) await counter.click();
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
