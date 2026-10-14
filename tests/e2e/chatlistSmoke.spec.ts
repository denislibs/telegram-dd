import { openApp } from './authHelpers';
import { expect, test } from './fixtures';

test('smoke', async ({ page }) => {
  await openApp(page);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/smoke.png' });
  console.log(await page.locator('#LeftColumn').count(), await page.locator('.chat-list .ListItem').count());
  expect(true).toBe(true);
});
