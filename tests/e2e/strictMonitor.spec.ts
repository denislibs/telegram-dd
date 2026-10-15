// Self-test of the gate: proves that the strict monitor really sees each class of problem.
// Uses the plain Playwright `test` on purpose: the fixture would (correctly) fail these tests.
import { expect, type Page, test } from '@playwright/test';

import { DISABLE_SERVICE_WORKER } from './fixtures';
import { createStrictMonitor } from './strictMonitor';

// the plain `test` has no fixture that removes `navigator.serviceWorker`: the app would register its worker, which Playwright blocks
// with a console warning (the media slice registers the progressive-streaming worker)
test.beforeEach(async ({ context }) => {
  await context.addInitScript(DISABLE_SERVICE_WORKER);
});

async function openApp(page: Page, baseURL: string) {
  const monitor = createStrictMonitor(page, new URL(baseURL).origin);
  await page.goto('/');
  await expect(page.locator('#Main')).toBeVisible();
  return monitor;
}

test('a clean page has no problems', async ({ page, baseURL }) => {
  const monitor = await openApp(page, baseURL!);
  expect(await monitor.problems()).toEqual([]);
});

test('console.error and console.warn are reported', async ({ page, baseURL }) => {
  const monitor = await openApp(page, baseURL!);
  await page.evaluate(() => {
    /* eslint-disable no-console */
    console.error('boom');
    console.warn('careful');
    /* eslint-enable no-console */
  });
  const problems = await monitor.problems();
  expect(problems).toEqual([
    expect.stringContaining('console.error: boom'),
    expect.stringContaining('console.warn: careful'),
  ]);
});

test('DEV timing diagnostics are not gate failures (wall-clock noise on slow runners); other warnings still are', async ({
  page,
  baseURL,
}) => {
  const monitor = await openApp(page, baseURL!);
  await page.evaluate(() => {
    /* eslint-disable no-console */
    console.warn('[frameact/store] Slow store update: 7.3 ms in apiUpdate');
    console.warn('[frameact] Slow effect run: 12.3 ms in Message > span.children [mutate]');
    console.warn('[frameact] Slow mutate drain: 18.0 ms, 240 effect runs');
    console.warn('[API] Slow updates processing: 1 updates in 8.5 ms');
    console.warn('[frameact/store] something else');
    /* eslint-enable no-console */
  });
  expect(await monitor.problems()).toEqual([expect.stringContaining('console.warn: [frameact/store] something else')]);
});

test('uncaught page errors are reported', async ({ page, baseURL }) => {
  const monitor = await openApp(page, baseURL!);
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('uncaught!');
    });
  });
  // The app's handleError (telegram-tt's, imported by the entry) preventDefault()s uncaught errors and logs them with
  // console.error, so the gate sees them as a console error rather than a `pageerror` event: either way it fails a test.
  await expect
    .poll(async () => (await monitor.problems()).join('\n'))
    .toMatch(/(uncaught page error|console\.error): Error: uncaught!/);
});

test('failed requests to the app origin are reported', async ({ page, baseURL }) => {
  const monitor = await openApp(page, baseURL!);
  await page.route('**/missing.json', (route) => route.fulfill({ status: 404, body: 'nope' }));
  await page.route('**/refused.json', (route) => route.abort('connectionrefused'));
  await page.evaluate(() => Promise.allSettled([fetch('/missing.json'), fetch('/refused.json')]));
  await expect
    .poll(async () => (await monitor.problems()).join('\n'))
    .toMatch(/GET .*\/missing\.json \(HTTP 404\)[\s\S]*GET .*\/refused\.json \(net::ERR_CONNECTION_REFUSED\)/);
});

test('stricterdom violations are reported', async ({ page, baseURL }) => {
  const monitor = await openApp(page, baseURL!);
  // A live-DOM write outside an effect's mutate phase: exactly what stricterdom exists to catch.
  await page.evaluate(() => document.querySelector('#Main')!.setAttribute('title', 'written behind the scheduler'));
  await expect.poll(async () => (await monitor.problems()).length).toBe(1);
  const [problem] = await monitor.problems();
  expect(problem).toContain('stricterdom mutation violation');
  expect(problem).toContain('title');
});
