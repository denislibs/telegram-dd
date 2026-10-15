import { openApp } from '../e2e/authHelpers';
import { test } from '../e2e/fixtures';
import { expectAccessible } from './axe';

// The composer under the mocked client (`messages` scenario): the empty input, the input with a reply bar and text, and
// the open emoji picker.
test.use({
  strictOptions: { ignoreConsole: [/GetFullUser|buildApiUserFullInfo|reading 'id'/, /action "loadFullUser" failed/] },
});

async function openCarol(page: import('@playwright/test').Page) {
  await openApp(page, '/#?mockScenario=messages');
  await page.locator('#LeftColumn .chat-list .ListItem.Chat').filter({ hasText: 'Carol Short' }).click();
  await page.locator('#editable-message-text[contenteditable="true"]').waitFor();
  await page.waitForTimeout(1500);
}

test('composer: the empty input', async ({ page }) => {
  await openCarol(page);
  await expectAccessible(page, '.Composer');
});

test('composer: a reply bar and typed text', async ({ page }) => {
  await openCarol(page);
  await page.locator('#editable-message-text').click();
  await page.keyboard.press('Control+ArrowUp');
  await page.locator('.Composer .ComposerEmbeddedMessage').waitFor();
  await page.keyboard.type('a reply');
  await page.waitForTimeout(800);
  await expectAccessible(page, '.Composer');
});

test('composer: the emoji picker', async ({ page }) => {
  await openCarol(page);
  await page.locator('.Composer .symbol-menu-button').click();
  await page.locator('.SymbolMenu .EmojiButton').first().waitFor();
  await page.waitForTimeout(800);
  await expectAccessible(page, '.SymbolMenu');
});
