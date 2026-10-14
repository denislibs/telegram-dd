import { expect, test } from './fixtures';

// Example: every ported screen adds a spec like this one next to it, using the strict fixture.
test('the app shell renders and reacts to clicks', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Telegram on frameact' })).toBeVisible();

  const counter = page.getByRole('button', { name: /clicks:/ });
  await expect(counter).toHaveText('clicks: 0');
  await counter.click();
  await expect(counter).toHaveText('clicks: 1');
});

// The dev smoke of the ported API layer, against the in-repo MockClient (no Telegram backend, dummy api id/hash).
// MockClient probes for an optional per-scenario `__invokeMiddlewares__/<scenario>` module; the dev server answers 404
// for a scenario without one and MockClient ignores it, so that single request is allowed here.
test.describe('mocked API worker', () => {
  test.use({ strictOptions: { ignoreRequests: [/\/__invokeMiddlewares__\//] } });

  test('the GramJS API worker starts against the mocked client (?api)', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (message) => logs.push(message.text()));

    await page.goto('/?api');
    // MockClient reports the logged-in state straight away: the smoke logs every API update it receives.
    await expect.poll(() => logs.some((line) => line.includes('[api] update updateApiReady'))).toBe(true);
  });
});
