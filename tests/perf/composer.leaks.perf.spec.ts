import { expect, type Page, test } from '@playwright/test';

import { openApp } from '../e2e/authHelpers';
import { expectNoLeak, INTERPRETER_ONLY } from './leaks';

// The composer (composer slice), on the production build (playwright.perf.config.ts): opening a chat, typing and sending, closing a
// chat with a pending draft, typing and clearing must not leak. The long-task gate is in composer.perf.spec.ts.

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

// The leak cycles run on V8's interpreter alone (`INTERPRETER_ONLY`, tests/perf/leaks.ts): with the optimizing tiers on, the editor's
// code was still being compiled after 130 warm-up cycles (1.7 MB of `InstructionStream` and friends between the 60th and the 200th
// cycle), and on a CI runner that tier-up made the second-half check flaky (416 KB over a 384 KB limit, passing on retry). On the
// interpreter every cycle below grows the heap by less than 0.3 KB per run after 40 cycles, the message a cycle sends included, so the
// documented limit applies. The leak this gate found on its first run was 1366 KB per run (tiptap/markdown registered its tokenizers
// in a shared `marked` instance, which kept every editor alive): retained data, which the interpreter measures the same way.
test.use({ launchOptions: { args: INTERPRETER_ONLY } });
const LEAK = { runs: 50, maxGrowthKb: 512, warmupRuns: 40, settleMs: 1500 } as const;

test.describe('composer: leaks', () => {
  test.describe.configure({ timeout: 600_000 });

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

  test('closing a chat with a draft that is still waiting for its debounce does not leak', async ({ page }) => {
    await openMessages(page);

    // The draft is saved after 10 s of typing pause: a composer closed before that used to stay alive (with its whole editor,
    // ~0.8 MB) until the timer fired. The close now flushes the draft and releases the timer, so the settle of the gate is enough.
    const cycle = async () => {
      await openChat(page, 'Carol Short');
      await page.locator(INPUT).click();
      // the draft of the previous cycle is restored on open: clear it, or the text (and the editor's document) grows every cycle
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.press('Backspace');
      await page.keyboard.type('a draft, closed at once');
      await page.keyboard.press('Escape'); // closes the chat
      await page.locator(LIST).waitFor({ state: 'detached' });
      await page.waitForTimeout(150);
    };

    const result = await expectNoLeak(page, cycle, { ...LEAK, runs: 30 });
    test.info().annotations.push({
      type: 'heap',
      description: `${result.growthKb.toFixed(0)} KB over 30 open/type/close cycles with a pending draft`,
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
