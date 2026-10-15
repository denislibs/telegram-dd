// Review I2 (docs/reviews/port-state-review.md): the entry must not wait for the lazy `actions/all` chunk. telegram-tt
// loads it with the Main bundle after the first render (since the chat list slice `components/main/Main.tsx` imports it, as
// in tt, and the entry no longer loads it itself): a chunk that fails to load must not keep the tab from rendering the
// app root or from establishing its multitab role. The main screen itself cannot render without the actions (as in tt).
import { expect, test } from './fixtures';

test.describe('boot does not depend on the lazy actions chunk', () => {
  test.use({
    strictOptions: {
      // the aborted chunk request is the point of the test; its failure is reported once, through handleError
      ignoreRequests: [/\/global\/actions\/all/],
      ignoreConsole: [
        /actions\/all/,
        /dynamically imported module/i,
        /Failed to fetch/i,
        /ERR_FAILED/,
        // the API update that follows the login calls an action of the missing chunk (`actions.sync`)
        /action "apiUpdate" failed/,
      ],
    },
  });

  test('the app renders and the tab becomes the master when actions/all cannot be loaded', async ({ page }) => {
    await page.route(/\/global\/actions\/all(\.ts)?(\?.*)?$/, (route) => route.abort('failed'));
    await page.goto('/');

    await expect(page.locator('#root')).toBeAttached();
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
