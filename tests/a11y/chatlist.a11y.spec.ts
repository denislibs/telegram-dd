import { openApp } from '../e2e/authHelpers';
import { test } from '../e2e/fixtures';
import { expectAccessible } from './axe';

// The main screen under the mocked client: the left column with the chat list, and the open main menu.
test('main: chat list', async ({ page }) => {
  await openApp(page);
  await page.locator('#LeftColumn .chat-list .ListItem').first().waitFor();
  await page.waitForTimeout(1000); // the lists fade in
  await expectAccessible(page, '#LeftColumn');
});

test('main: main menu', async ({ page }) => {
  await openApp(page);
  await page.locator('#LeftColumn .chat-list .ListItem').first().waitFor();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.locator('.main-menu .bubble').waitFor();
  await page.waitForTimeout(600); // the menu animation
  await expectAccessible(page, '.main-menu');
});
