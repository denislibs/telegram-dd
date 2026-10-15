import { expect, type Page, test } from '@playwright/test';

import { openApp } from '../e2e/authHelpers';
import { expectNoLeak } from './leaks';
import { expectNoLongTasks } from './longTasks';

// The middle column (messages slice), on the production build (playwright.perf.config.ts): opening and closing a chat must not
// leak, and opening a chat and scrolling its history must not block the main thread under 4x CPU throttling. The production
// build of the mocked client has no request middleware (a `@vite-ignore` dynamic import is not bundled), so every history
// request is answered with the whole chat, which is what telegram-tt's mock does as well (`pnpm perf:compare`).

const ROW = '#LeftColumn .chat-list .ListItem.Chat';
const LIST = '#MiddleColumn .MessageList';

async function openMessages(page: Page) {
  await openApp(page, '/#?mockScenario=messages');
  await expect(page.locator(ROW)).toHaveCount(4);
  await page.waitForTimeout(1000);
}

async function openChat(page: Page, name: string) {
  await page.locator(ROW).filter({ hasText: name }).click();
  await page.locator(`${LIST} .message-list-item`).first().waitFor();
}

// The documented threshold of tests/perf/leaks.ts (docs/quality-gates.md): 512 KB over 50 runs. The warm-up is longer than the
// chat list gates': opening a chat pushes browser history entries (`useHistoryBack`, tt does too), which Chrome keeps up to 50
// (about 25 cycles), the first open of a chat loads its history, and V8 compiles the hot paths of the column (the heap diff of the
// chat list report: code and feedback vectors) during the first ~60 cycles; a retained list would still grow linearly after that.
// The heap is measured after 1.5 s of idle (`settleMs`): right after a cycle the state of the open chat (a debounced scroll
// offset, pending observer reports, ripples) is still settling and is worth about 2 MB, so a measurement could catch the
// baseline and the final heap in different states (a flake of 1 run in 3 under load, with no growth in between).
const LEAK = { runs: 50, maxGrowthKb: 512, warmupRuns: 70, settleMs: 1500 } as const;

test.describe('message list: leaks', () => {
  test.describe.configure({ timeout: 400_000 });

  test('opening and closing a chat (history, scroll, observers, the column slide) does not leak', async ({ page }) => {
    await openMessages(page);

    const cycle = async () => {
      await openChat(page, 'Alice Tester');
      await page.waitForTimeout(250); // the list positions itself, the observers run
      await page.mouse.move(800, 400);
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(150);
      await page.keyboard.press('Escape'); // closes the chat
      await page.locator(LIST).waitFor({ state: 'detached' });
      await page.waitForTimeout(250);
    };

    const result = await expectNoLeak(page, cycle, LEAK);
    test.info().annotations.push({
      type: 'heap',
      description: `${result.growthKb.toFixed(0)} KB over ${LEAK.runs} open/close cycles`,
    });
  });

  test('switching between two chats does not leak', async ({ page }) => {
    await openMessages(page);

    const cycle = async () => {
      await openChat(page, 'Alice Tester');
      await page.waitForTimeout(250);
      await openChat(page, 'Bob Reader');
      await page.waitForTimeout(250);
    };

    const result = await expectNoLeak(page, cycle, LEAK);
    test.info().annotations.push({
      type: 'heap',
      description: `${result.growthKb.toFixed(0)} KB over ${LEAK.runs} chat switches`,
    });
  });
});

test.describe('message list: long tasks under 4x CPU throttling', () => {
  // Opening the 300-message chat and scrolling its history to the first message (the history pages in). The limit is telegram-tt's own
  // worst task on the same kind of run (`pnpm perf:compare --scenario open-chat`: a 400-message chat, CPU x4, 5 runs): 123 ms
  // (117-198); this app's 124 ms (117-182). A task's length follows the machine, so the cap is the highest tt value seen, 198 ms,
  // plus 3%: 204 ms. The number of long tasks is higher (22 against 14) and the script time 1.28x tt's: a gap, tracked in
  // docs/reports/slice-messages.md, not hidden here.
  test("opening a chat and scrolling its history stays under telegram-tt's worst task (204 ms)", async ({ page }) => {
    await openMessages(page);
    // the first open of any chat compiles the column's code (cold JIT, about 100 ms more): another chat is opened first, as
    // the long task gates of the chat list do for the first folder switch
    await openChat(page, 'Bob Reader');
    await page.waitForTimeout(800);

    await expectNoLongTasks(
      page,
      async () => {
        await openChat(page, 'Alice Tester');
        await page.waitForTimeout(800);
        await page.mouse.move(800, 400);
        for (let i = 0; i < 40; i++) {
          await page.mouse.wheel(0, -400);
          await page.waitForTimeout(80);
        }
        await page.waitForTimeout(500);
      },
      { maxMs: 204 },
    );
  });
});
