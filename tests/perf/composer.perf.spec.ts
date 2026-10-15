import { expect, type Page, test } from '@playwright/test';

import { openApp } from '../e2e/authHelpers';
import { expectNoLeak } from './leaks';
import { expectNoLongTasks } from './longTasks';

// The composer (composer slice), on the production build (playwright.perf.config.ts): opening a chat, typing and sending must not
// leak, and typing 200 characters plus sending messages must not block the main thread under 4x CPU throttling.

const ROW = '#LeftColumn .chat-list .ListItem.Chat';
const LIST = '#MiddleColumn .MessageList';
const INPUT = '#editable-message-text';

async function openMessages(page: Page) {
  await openApp(page, '/#?mockScenario=messages');
  await expect(page.locator(ROW)).toHaveCount(4);
  await page.waitForTimeout(1000);
}

async function openChat(page: Page, name: string) {
  await page.locator(ROW).filter({ hasText: name }).click();
  await page.locator(`${LIST} .message-list-item`).first().waitFor();
  await expect(page.locator(INPUT)).toHaveAttribute('contenteditable', 'true');
}

// The documented threshold of tests/perf/leaks.ts (docs/quality-gates.md): 512 KB over 50 runs, with the long warm-up of the
// message list gates (history entries, JIT of the column) plus the editor: the first open loads the `editor` bundle and the cycle
// sends a message each time, which is data that stays (the message in the store and in the mocked server): the cycle sends the
// shortest text.
const LEAK = { runs: 50, maxGrowthKb: 512, warmupRuns: 70, settleMs: 1500 } as const;

test.describe('composer: leaks', () => {
  test.describe.configure({ timeout: 500_000 });

  test('opening a chat, typing and sending a message, closing the chat does not leak', async ({ page }) => {
    await openMessages(page);

    const cycle = async () => {
      await openChat(page, 'Carol Short');
      await page.locator(INPUT).click();
      await page.keyboard.type('hi');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(150);
      await page.keyboard.press('Escape'); // closes the chat
      await page.locator(LIST).waitFor({ state: 'detached' });
      await page.waitForTimeout(150);
    };

    const result = await expectNoLeak(page, cycle, LEAK);
    test.info().annotations.push({
      type: 'heap',
      description: `${result.growthKb.toFixed(0)} KB over ${LEAK.runs} open/type/send/close cycles`,
    });
  });

  test('typing and discarding text in an open chat does not leak', async ({ page }) => {
    await openMessages(page);
    await openChat(page, 'Carol Short');

    const cycle = async () => {
      await page.locator(INPUT).click();
      await page.keyboard.type('some typed text, never sent');
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(150);
    };

    const result = await expectNoLeak(page, cycle, LEAK);
    test.info().annotations.push({
      type: 'heap',
      description: `${result.growthKb.toFixed(0)} KB over ${LEAK.runs} type/clear cycles`,
    });
  });
});

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
