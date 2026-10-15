import { openApp } from '../e2e/authHelpers';
import { test } from '../e2e/fixtures';
import { expectAccessible } from './axe';

// The middle column of an open chat under the mocked client (`messages` scenario): the header and the message list with
// bubbles, links, a spoiler, a quote and a code block.
test.use({
  strictOptions: { ignoreConsole: [/GetFullUser|buildApiUserFullInfo|reading 'id'/, /action "loadFullUser" failed/] },
});

test('middle column: an open chat with entities', async ({ page }) => {
  await openApp(page, '/#?mockScenario=messages');
  await page.locator('#LeftColumn .chat-list .ListItem.Chat').filter({ hasText: 'Dave Entities' }).click();
  await page.locator('#MiddleColumn .MessageList .message-list-item').first().waitFor();
  await page.waitForTimeout(1500); // the list positions itself, the bubbles appear
  await expectAccessible(page, '#MiddleColumn');
});

test('middle column: a long chat opened at its first unread message', async ({ page }) => {
  await openApp(page, '/#?mockScenario=messages');
  await page.locator('#LeftColumn .chat-list .ListItem.Chat').filter({ hasText: 'Alice Tester' }).click();
  await page.locator('#MiddleColumn .MessageList .unread-divider').waitFor();
  await page.waitForTimeout(1500);
  await expectAccessible(page, '#MiddleColumn');
});

// A supergroup (sender groups with avatars and names, a service message, forwards, an album stub) and a broadcast channel
// (views, a forward header, the mute bar of the footer)
for (const chat of ['Team Chat', 'Daily News']) {
  test(`middle column: the ${chat === 'Team Chat' ? 'group' : 'channel'} chat`, async ({ page }) => {
    await openApp(page, '/#?mockScenario=messages');
    await page.locator('#LeftColumn .chat-list .ListItem.Chat').filter({ hasText: chat }).click();
    await page.locator('#MiddleColumn .MessageList .message-list-item').first().waitFor();
    await page.waitForTimeout(1500);
    await expectAccessible(page, '#MiddleColumn');
  });
}
