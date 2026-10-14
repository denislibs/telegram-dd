// Self-test of the gate: proves that the strict monitor really sees each class of problem.
// Uses the plain Playwright `test` on purpose: the fixture would (correctly) fail these tests.
import { expect, type Page, test } from '@playwright/test';

import { createStrictMonitor } from './strictMonitor';

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
