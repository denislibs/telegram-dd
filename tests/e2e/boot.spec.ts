// Review I2 (docs/reviews/port-state-review.md): the entry must not wait for the lazy `actions/all` chunk. telegram-tt
// loads it with the Main bundle after the first render; a chunk that fails to load must not leave the screen empty or
// keep the tab from establishing its multitab role.
import { expect, test } from './fixtures';

test.describe('boot does not depend on the lazy actions chunk', () => {
  test.use({
    strictOptions: {
      // the aborted chunk request is the point of the test; its failure is reported once, through handleError
      ignoreRequests: [/\/global\/actions\/all/],
      ignoreConsole: [/actions\/all/, /dynamically imported module/i, /Failed to fetch/i, /ERR_FAILED/],
    },
  });

  test('the app renders and the tab becomes the master when actions/all cannot be loaded', async ({ page }) => {
    await page.route(/\/global\/actions\/all(\.ts)?(\?.*)?$/, (route) => route.abort('failed'));
    await page.goto('/');

    await expect(page.locator('#Main')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.values((window as unknown as { getGlobal: () => any }).getGlobal().byTabId).some(
            (tab: any) => tab.isMasterTab,
          ),
        ),
      )
      .toBe(true);
  });
});
