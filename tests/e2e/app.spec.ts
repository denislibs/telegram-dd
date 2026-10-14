import { expect, test } from './fixtures';

// Example: every ported screen adds a spec like this one next to it, using the strict fixture.
// The mocked client boots logged in (util/init.ts), so the shell shows the main screen: a placeholder until the chat
// list slice lands. The auth flow has its own spec (auth.spec.ts).
test('the app shell renders the main placeholder in mocked mode', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#Main')).toBeVisible();
});

// The API worker against the in-repo MockClient (no Telegram backend, dummy api id/hash). MockClient probes for an optional
// per-scenario `__invokeMiddlewares__/<scenario>` module; the dev server answers 404 for a scenario without one and
// MockClient ignores it, so that single request is allowed here.
// The app starts the worker itself (`initApi` after the multitab role is settled) and logs its stages in the dev build;
// the dev smoke (`?api`, src/dev/apiSmoke.ts) attached a second listener to the same worker and missed updates that the
// app's own start had already consumed.
test.describe('mocked API worker', () => {
  test.use({ strictOptions: { ignoreRequests: [/\/__invokeMiddlewares__\//] } });

  test('the GramJS API worker starts against the mocked client', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (message) => logs.push(message.text()));

    await page.goto('/');
    // a cold dev server transforms the whole app on this first load: give the worker time to start
    await expect.poll(() => logs.some((line) => line.includes('>>> FINISH INIT API')), { timeout: 30_000 }).toBe(true);
    expect(logs.some((line) => line.includes('>>> START LOAD WORKER'))).toBe(true);
  });
});
