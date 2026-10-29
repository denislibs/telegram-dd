import { expect, type Page, test } from '@playwright/test';

import { openApp } from '../e2e/authHelpers';
import { expectNoLongTasks } from './longTasks';

// The composer (composer slice), on the production build (playwright.perf.config.ts): typing 200 characters plus sending messages
// must not block the main thread under 4x CPU throttling. The leak gates are in composer.leaks.perf.spec.ts (they need other
// browser flags, which Playwright sets per file).

const ROW = '#LeftColumn .chat-list .ListItem.Chat';
const LIST = '#MiddleColumn .MessageList';
const INPUT = '#editable-message-text';

async function openMessages(page: Page) {
  await openApp(page, '/#?mockScenario=messages');
  await expect(page.locator(ROW)).toHaveCount(6);
  await page.waitForTimeout(1000);
}

async function openChat(page: Page, name: string) {
  await page.locator(ROW).filter({ hasText: name }).click();
  await page.locator(`${LIST} .message-list-item`).first().waitFor();
  await expect(page.locator(INPUT)).toHaveAttribute('contenteditable', 'true');
}

test.describe('composer: long tasks under 4x CPU throttling', () => {
  test('typing 200 characters and sending 10 messages', async ({ page }) => {
    await openMessages(page);
    await openChat(page, 'Carol Short');
    // the first use of the editor compiles its code (cold JIT)
    await page.locator(INPUT).click();
    await page.keyboard.type('warm up');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);

    await expectNoLongTasks(
      page,
      async () => {
        await page.locator(INPUT).click();
        for (let message = 0; message < 10; message++) {
          await page.keyboard.type('x'.repeat(20));
          await page.keyboard.press('Enter');
          await page.waitForTimeout(120);
        }
        await page.waitForTimeout(500);
      },
      { maxMs: 120 },
    );
  });
});
