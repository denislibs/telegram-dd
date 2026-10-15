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

// The documented threshold of tests/perf/leaks.ts (docs/quality-gates.md) is 512 KB over 50 runs. This cycle sends a message each
// time, and the message is data that stays (the store, the mocked server's history, the chat list preview: about 2 KB each), and
// the editor's code is still being tiered up after 130 warm-up cycles (a heap snapshot diff shows `InstructionStream` and nothing
// else growing over 40 runs), so the limit is 512 KB plus 256 KB, and the second half of the runs may add 384 KB of it. The leak this
// gate found on its first run was 1366 KB per run (tiptap/markdown registered its tokenizers in a shared `marked` instance, which kept
// every editor alive): two orders of magnitude over the limit, so it cannot hide behind the extra 256 KB.
const LEAK = { runs: 50, maxGrowthKb: 768, warmupRuns: 130, settleMs: 1500 } as const;
// Typing in a chat that stays open: Chromium keeps an undo step per typed run of text of the contenteditable (native
// `UndoStep` / `InsertIntoTextNodeCommand` objects, a heap snapshot diff shows nothing else growing: 89 steps and 1072 commands
// over 40 cycles, about 60 KB; the browser's own limit is 1000 steps, tt has the same), and the editor's code is still being
// tiered up after 70 cycles (`InstructionStream`, 80 KB over 40 cycles). So the limit is twice the documented one, and the
// second half of the runs may add 512 KB of it.
const LEAK_TYPING = { runs: 50, maxGrowthKb: 1024, warmupRuns: 90, settleMs: 1500 } as const;

test.describe('composer: leaks', () => {
  test.describe.configure({ timeout: 900_000 });

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

    const result = await expectNoLeak(page, cycle, LEAK_TYPING);
    test.info().annotations.push({
      type: 'heap',
      description: `${result.growthKb.toFixed(0)} KB over ${LEAK_TYPING.runs} type/clear cycles`,
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
