// The main shell and the chat list (the chat list slice): the logged-in state of the mocked client (tt's `default`
// scenario: Saved Messages and the channel "aass") plus contacts that the test plays as the server with `apiUpdate`.
import type { Page } from '@playwright/test';

import { openApp } from './authHelpers';
import { expect, test } from './fixtures';

type TestWindow = {
  getActions: () => { apiUpdate: (update: Record<string, unknown>) => void };
  getGlobal: () => Record<string, any>;
  setGlobal: (global: Record<string, unknown>) => void;
};

const ROW = '#LeftColumn .chat-list .ListItem.Chat';
// <Transition> keeps one list per folder rendered; the active slide is the visible one
const ACTIVE_ROW = '#LeftColumn .Transition_slide-active > .chat-list .ListItem.Chat';

// `count` private chats "Contact 1..count", the message of chat N is N minutes after the previous one (N is the newest).
async function addContacts(page: Page, count: number, from = 1) {
  await page.evaluate(
    ([n, first]) => {
      const { apiUpdate } = (window as unknown as TestWindow).getActions();
      const base = Math.floor(Date.now() / 1000) - 100000;
      for (let i = first; i < first + n; i++) {
        const id = String(1000 + i);
        apiUpdate({
          '@type': 'updateUser',
          id,
          user: {
            id,
            type: 'userTypeRegular',
            firstName: 'Contact',
            lastName: String(i),
            isMin: false,
            phoneNumber: '',
          },
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
    },
    [count, from] as const,
  );
}

// tt keeps the read state and the typing statuses of a chat in its main thread (id -1), which exists once a history is
// loaded: the test creates it, with `patch` merged in.
async function patchMainThread(page: Page, chatId: string, patch: Record<string, unknown>) {
  await page.evaluate(
    ([id, threadPatch]) => {
      const { getGlobal, setGlobal } = window as unknown as TestWindow;
      const global = getGlobal();
      const chatMessages = global.messages.byChatId[id];
      const thread = chatMessages.threadsById['-1'] ?? { localState: {} };
      setGlobal({
        ...global,
        messages: {
          ...global.messages,
          byChatId: {
            ...global.messages.byChatId,
            [id]: {
              ...chatMessages,
              threadsById: { ...chatMessages.threadsById, '-1': { ...thread, ...(threadPatch as object) } },
            },
          },
        },
      });
    },
    [chatId, patch] as const,
  );
}

// The titles of the rows from the top of the list to the bottom (the DOM order of a <ManualFor> list is not the visual one).
async function visualOrder(page: Page, rows = ROW): Promise<string[]> {
  return page.evaluate((selector) => {
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .map((row) => ({
        title: (row.querySelector('.fullName, .title')?.textContent ?? '').replace(/SCAM$/, ''),
        top: row.getBoundingClientRect().top,
      }))
      .sort((a, b) => a.top - b.top)
      .map((row) => row.title);
  }, rows);
}

test.describe('chat list', () => {
  test('renders the mocked chats under the main shell', async ({ page }) => {
    await openApp(page);

    await expect(page.locator('#LeftColumn')).toBeVisible();
    await expect(page.locator('#MiddleColumn')).toBeAttached();
    await expect(page.locator(ROW)).toHaveCount(2);
    expect(await visualOrder(page)).toEqual(['aass', 'SavedMessages']);
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    await expect(page.locator('#LeftColumn .SearchInput input')).toBeVisible();
    // The last message of the channel and its avatar are rendered in the row
    await expect(page.locator(ROW).first().locator('.Avatar')).toBeVisible();
  });

  test('opens and closes the chat context menu', async ({ page }) => {
    await openApp(page);
    await page.locator(ROW).first().click({ button: 'right' });

    const menu = page.locator('.ListItem-context-menu .bubble');
    const menuRoot = page.locator('.ListItem-context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Mark as Unread')).toBeVisible();
    await expect(menu.getByText('Delete Chat')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menuRoot).toHaveCount(0);

    // A second round: close by a click on the backdrop
    await page.locator(ROW).first().click({ button: 'right' });
    await expect(menu).toBeVisible();
    await page.mouse.click(900, 400);
    await expect(menuRoot).toHaveCount(0);
  });

  test('switches between folders', async ({ page }) => {
    await openApp(page);
    await addContacts(page, 3);
    await page.evaluate(() => {
      const { apiUpdate } = (window as unknown as TestWindow).getActions();
      apiUpdate({
        '@type': 'updateChatFolder',
        id: 5,
        folder: {
          id: 5,
          title: { text: 'Work' },
          includedChatIds: ['1001', '1002'],
          excludedChatIds: [],
          pinnedChatIds: [],
        },
      });
      apiUpdate({ '@type': 'updateChatFoldersOrder', orderedIds: [0, 5] });
    });

    await expect(
      page
        .getByRole('button', { name: /Work/ })
        .or(page.getByText('Work', { exact: true }))
        .first(),
    ).toBeVisible();
    await expect.poll(() => visualOrder(page, ACTIVE_ROW)).toHaveLength(5);

    await page.locator('#LeftColumn .TabList > [class*="__tab"]').nth(1).click();
    await expect.poll(() => visualOrder(page, ACTIVE_ROW)).toEqual(['Contact 2', 'Contact 1']);

    await page.locator('#LeftColumn .TabList > [class*="__tab"]').nth(0).click();
    await expect
      .poll(() => visualOrder(page, ACTIVE_ROW))
      .toEqual(['Contact 3', 'Contact 2', 'Contact 1', 'aass', 'SavedMessages']);
  });

  test('a new message moves its chat to the top without recreating the rows', async ({ page }) => {
    await openApp(page);
    await addContacts(page, 3);
    await expect
      .poll(() => visualOrder(page))
      .toEqual(['Contact 3', 'Contact 2', 'Contact 1', 'aass', 'SavedMessages']);

    // Mark the DOM nodes: a reorder must keep them (zero DOM moves of kept rows, <ManualFor>)
    await page.evaluate((selector) => {
      document.querySelectorAll(selector).forEach((row, index) => row.setAttribute('data-node', String(index)));
    }, ROW);
    const before = await page.locator(ROW).count();

    await page.evaluate(() => {
      const { apiUpdate } = (window as unknown as TestWindow).getActions();
      apiUpdate({
        '@type': 'newMessage',
        chatId: '1001',
        id: 500,
        message: {
          id: 500,
          chatId: '1001',
          date: Math.floor(Date.now() / 1000),
          isOutgoing: false,
          senderId: '1001',
          content: { text: { text: 'a brand new message' } },
        },
      });
    });

    await expect
      .poll(() => visualOrder(page))
      .toEqual(['Contact 1', 'Contact 3', 'Contact 2', 'aass', 'SavedMessages']);
    await expect(page.locator(ROW).first().locator('.subtitle')).toBeAttached();
    expect(await page.locator(ROW).count()).toBe(before);
    expect(await page.locator(`${ROW}[data-node]`).count()).toBe(before);
    await expect(page.locator(ROW).filter({ hasText: 'a brand new message' })).toHaveCount(1);

    // The unread counter badge appears with the read state of the chat
    const row = page.locator(ROW).filter({ hasText: 'a brand new message' });
    await expect(row.locator('[class*="unread"]')).toHaveCount(0);
    await patchMainThread(page, '1001', { readState: { unreadCount: 3 } });
    await expect(row.locator('[class*="unread"]')).toContainText('3');
  });

  test('shows the typing indicator of a chat', async ({ page }) => {
    await openApp(page);
    await addContacts(page, 2);
    const row = page.locator(ROW).filter({ hasText: 'Contact 2' });
    await expect(row).toContainText('hello 2');

    // tt drops a typing status of a chat whose main thread is not in the store yet
    await patchMainThread(page, '1002', {});
    await page.evaluate(() => {
      (window as unknown as TestWindow).getActions().apiUpdate({
        '@type': 'updateChatTypingStatus',
        id: '1002',
        peerId: '1002',
        typingStatus: { action: 'typing', timestamp: Date.now() },
      });
    });
    await expect(row).toContainText(/typing/i);
    await expect(row).not.toContainText('hello 2');

    // The status goes away by itself (tt clears it after 6 s) and the last message is back
    await expect(row).toContainText('hello 2', { timeout: 12_000 });
  });

  test('loads more chats on scroll (infinite scroll)', async ({ page }) => {
    await openApp(page);
    await addContacts(page, 90);

    await expect.poll(() => page.locator(ROW).count()).toBeGreaterThan(10);
    const first = await page.locator(ROW).count();
    expect(first).toBeLessThan(92); // a slice of the list is rendered, not all of it

    // Scroll with the wheel, as a user does: the loader asks for more when the list moves down near its end
    await page.mouse.move(150, 400);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(150);
    }
    await expect.poll(() => page.locator(ROW).count(), { timeout: 8000 }).toBeGreaterThan(first);
    const titles = await visualOrder(page);
    expect(titles.length).toBeGreaterThan(first);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
