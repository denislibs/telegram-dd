import { expect, type Page, test } from '@playwright/test';

import { openApp } from '../e2e/authHelpers';
import { expectNoLeak } from './leaks';
import { expectNoLongTasks } from './longTasks';

// The chat list slice, on the production build (playwright.perf.config.ts): folder switching must not leak, and the
// list interactions must not block the main thread under 4x CPU throttling.

type TestWindow = {
  getActions: () => { apiUpdate: (update: Record<string, unknown>) => void };
};

const ROW = '#LeftColumn .chat-list .ListItem.Chat';
const FOLDER_TAB = '#LeftColumn .TabList > [class*="__tab"]';

async function addContacts(page: Page, count: number) {
  await page.evaluate((n) => {
    const { apiUpdate } = (window as unknown as TestWindow).getActions();
    const base = Math.floor(Date.now() / 1000) - 100000;
    for (let i = 1; i <= n; i++) {
      const id = String(1000 + i);
      apiUpdate({
        '@type': 'updateUser',
        id,
        user: { id, type: 'userTypeRegular', firstName: 'Contact', lastName: String(i), isMin: false, phoneNumber: '' },
      });
      apiUpdate({
        '@type': 'updateChat',
        id,
        chat: { id, type: 'chatTypePrivate', title: `Contact ${i}`, isMin: false, lastReadInboxMessageId: 0 },
      });
      apiUpdate({ '@type': 'updateChatListType', id, folderId: 0 });
      apiUpdate({
        '@type': 'newMessage',
        chatId: id,
        id: i,
        message: {
          id: i,
          chatId: id,
          date: base + i * 60,
          isOutgoing: false,
          senderId: id,
          content: { text: { text: `hello ${i}` } },
        },
      });
    }
    apiUpdate({
      '@type': 'updateChatFolder',
      id: 5,
      folder: {
        id: 5,
        title: { text: 'Work' },
        includedChatIds: ['1001', '1002', '1003'],
        excludedChatIds: [],
        pinnedChatIds: [],
      },
    });
    apiUpdate({ '@type': 'updateChatFoldersOrder', orderedIds: [0, 5] });
  }, count);
}

async function openChatList(page: Page, contacts: number) {
  await openApp(page);
  await page.locator(ROW).first().waitFor();
  await addContacts(page, contacts);
  await expect(page.locator(FOLDER_TAB)).toHaveCount(2);
  await page.waitForTimeout(1500);
}

// The documented defaults of tests/perf/leaks.ts (docs/quality-gates.md): 512 KB over 50 runs. The warm-up is longer than the
// default 5 runs: the first ~20 cycles of a page still compile hot paths (V8 `InstructionStream` / feedback vectors count in
// `Runtime.getHeapUsage`: +190-290 KB over the first 30 cycles in a heap snapshot diff) and settle a one-time step of the
// dependency graph (~0.9k link objects, not growing from 30 to 60 runs).
const LEAK = { runs: 50, maxGrowthKb: 512, warmupRuns: 25 } as const;

type LeftColumnActions = { openLeftColumnContent: (payload: { contentKey?: number }) => void };

test.describe('chat list: leaks', () => {
  // 25 warm-up + 50 measured cycles of ~0.8-1.2 s each
  test.describe.configure({ timeout: 300_000 });

  test('switching between folders does not leak', async ({ page }) => {
    await openChatList(page, 60);

    const switchFolders = async () => {
      await page.locator(FOLDER_TAB).nth(1).click();
      await page.waitForTimeout(350); // the slide
      await page.locator(FOLDER_TAB).nth(0).click();
      await page.waitForTimeout(350);
    };

    const result = await expectNoLeak(page, switchFolders, LEAK);
    test.info().annotations.push({
      type: 'heap',
      description: `${result.growthKb.toFixed(0)} KB over ${LEAK.runs} folder switches`,
    });
  });

  // The folder lists stay mounted while the user switches folders (the kit's Transition keeps a slide per key), so the cycle
  // above never disposes a list. This one does: Settings -> Archive -> back mounts a new ChatFolders with its lists and rows
  // (LeftColumn's Transition drops the main screen after the second step) and disposes the previous ones.
  test('unmounting and mounting the chat list (Settings -> Archive -> chats) does not leak', async ({ page }) => {
    await openChatList(page, 60);

    const remount = async () => {
      const content = (contentKey?: number) =>
        page.evaluate(
          (key) =>
            (window as unknown as { getActions: () => LeftColumnActions })
              .getActions()
              .openLeftColumnContent({ contentKey: key }),
          contentKey,
        );
      await content(2); // LeftColumnContent.Settings
      await page.waitForTimeout(400);
      await content(4); // LeftColumnContent.Archived
      await page.waitForTimeout(400);
      await content(undefined);
      await page.locator(ROW).first().waitFor();
      await page.waitForTimeout(400);
    };

    const result = await expectNoLeak(page, remount, LEAK);
    test.info().annotations.push({
      type: 'heap',
      description: `${result.growthKb.toFixed(0)} KB over ${LEAK.runs} list remounts`,
    });
  });

  test('opening and closing the chat context menu does not leak', async ({ page }) => {
    await openChatList(page, 20);

    const cycle = async () => {
      await page.locator(ROW).first().click({ button: 'right' });
      await page.locator('.ListItem-context-menu .bubble').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('.ListItem-context-menu').waitFor({ state: 'detached' });
    };

    const result = await expectNoLeak(page, cycle, LEAK);
    test.info().annotations.push({
      type: 'heap',
      description: `${result.growthKb.toFixed(0)} KB over ${LEAK.runs} menu cycles`,
    });
  });
});

test.describe('chat list: long tasks under 4x CPU throttling', () => {
  test('a new message and folder switching stay under 50 ms per task', async ({ page }) => {
    await openChatList(page, 90);

    // The first switch to a folder mounts its list; the folder lists stay mounted afterwards, which is what is measured here
    // (the mount has its own test below).
    await page.locator(FOLDER_TAB).nth(1).click();
    await page.waitForTimeout(600);
    await page.locator(FOLDER_TAB).nth(0).click();
    await page.waitForTimeout(600);

    await expectNoLongTasks(
      page,
      async () => {
        // a new message: the chat moves to the top
        await page.evaluate(() => {
          (window as unknown as TestWindow).getActions().apiUpdate({
            '@type': 'newMessage',
            chatId: '1005',
            id: 900,
            message: {
              id: 900,
              chatId: '1005',
              date: Math.floor(Date.now() / 1000),
              isOutgoing: false,
              senderId: '1005',
              content: { text: { text: 'a new message' } },
            },
          });
        });
        await page.waitForTimeout(500);

        // folders
        for (let i = 0; i < 2; i++) {
          await page.locator(FOLDER_TAB).nth(1).click();
          await page.waitForTimeout(500);
          await page.locator(FOLDER_TAB).nth(0).click();
          await page.waitForTimeout(500);
        }
      },
      { maxMs: 50 },
    );
  });

  // The first switch to a folder mounts its list (ChatList, Transition slide, rows). `pnpm perf:compare --scenario folders` (CPU x4,
  // 5 runs): telegram-tt's longest task is 51 ms (50-65), this app's 85 ms (80-92) with 4 long tasks against tt's 1: a known gap
  // (docs/reports/slice-chatlist.md). The cap is this app's measured worst plus a margin, so that it cannot get worse.
  test('mounting the list of a folder stays under 100 ms per task', async ({ page }) => {
    await openChatList(page, 90);

    await expectNoLongTasks(
      page,
      async () => {
        await page.locator(FOLDER_TAB).nth(1).click();
        await page.waitForTimeout(600);
      },
      { maxMs: 100 },
    );
  });

  // Scrolling slides the rendered window of the list by 25-30 rows. The limit is telegram-tt's own: `pnpm perf:compare --scenario
  // scroll` (1200 chats scrolled to the bottom, CPU x4, 5 runs) measured tt's longest task at 104 ms (102-107 ms over the runs,
  // 4 long tasks); the same scenario on this app: longest task 82 ms (76-102), but 41 long tasks (total 2.4 s against tt's 0.27 s).
  // So the gate is the worst task of tt (107 ms), not a round number; the number of long tasks is a gap, tracked in the report
  // (docs/reports/slice-chatlist.md), not hidden here.
  test("scrolling through the list stays under telegram-tt's worst task (107 ms)", async ({ page }) => {
    await openChatList(page, 90);

    await expectNoLongTasks(
      page,
      async () => {
        await page.mouse.move(150, 400);
        for (let i = 0; i < 8; i++) {
          await page.mouse.wheel(0, 500);
          await page.waitForTimeout(100);
        }
        for (let i = 0; i < 8; i++) {
          await page.mouse.wheel(0, -500);
          await page.waitForTimeout(100);
        }
      },
      { maxMs: 107 },
    );
  });
});
