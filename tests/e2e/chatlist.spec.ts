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
// The mocked sync of the app writes whole-global snapshots taken before its awaits, which can undo what the test played
// (see tests/e2e/authHelpers.ts): the contacts are checked and played again when they are gone.
async function addContacts(page: Page, count: number, from = 1) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await playContacts(page, count, from);
    await page.waitForTimeout(800);
    const present = await page.evaluate(
      ([n, first]) => {
        const { byId } = (window as unknown as TestWindow).getGlobal().chats;
        return Boolean(byId[String(1000 + first)] && byId[String(1000 + first + n - 1)]);
      },
      [count, from] as const,
    );
    if (present) return;
  }
  throw new Error('the mocked sync keeps undoing the contacts of the test');
}

async function playContacts(page: Page, count: number, from = 1) {
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
          chat: {
            id,
            type: 'chatTypePrivate',
            title: `Contact ${i}`,
            isMin: false,
            lastReadInboxMessageId: 0,
            accessHash: '1',
          },
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

// The titles of the rows in DOM order (a <ManualFor> list: kept rows are not moved, so it is not the visual order)
async function domOrder(page: Page, rows = ROW): Promise<string[]> {
  return page.evaluate(
    (selector) =>
      [...document.querySelectorAll<HTMLElement>(selector)].map((row) =>
        (row.querySelector('.fullName, .title')?.textContent ?? '').replace(/SCAM$/, ''),
      ),
    rows,
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
    const domBefore = await domOrder(page);

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

    // <ManualFor>: the kept rows were not moved in the DOM (only the row whose order key changed may have been), so with that
    // row left out the DOM order is what it was
    const domAfter = await domOrder(page);
    expect(domAfter.filter((title) => title !== 'Contact 1')).toEqual(
      domBefore.filter((title) => title !== 'Contact 1'),
    );

    // The reorder animation ends clean: no transform / opacity / animation class left on any row
    await expect
      .poll(() =>
        page.evaluate((selector) => {
          return [...document.querySelectorAll<HTMLElement>(selector)].filter(
            (row) => row.style.transform || row.style.opacity || row.matches('.animate-transform, .animate-opacity'),
          ).length;
        }, ROW),
      )
      .toBe(0);
    // and the rows are laid out one after another
    const tops = await page.evaluate(
      (selector) =>
        [...document.querySelectorAll<HTMLElement>(selector)]
          .map((row) => row.getBoundingClientRect().top)
          .sort((a, b) => a - b),
      ROW,
    );
    for (let i = 1; i < tops.length; i++) expect(tops[i] - tops[i - 1]).toBe(72);
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
    expect(first).toBeLessThanOrEqual(60); // a window of the list is rendered (CHAT_LIST_SLICE * 2), not all of it

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
    // The window slid without a gap: the rendered rows are contiguous in the list and one row high apart
    const numbers = titles.map((title) => Number(title.replace('Contact ', '')));
    for (let i = 1; i < numbers.length; i++) expect(numbers[i - 1] - numbers[i]).toBe(1);
    const tops = await page.evaluate(
      (selector) =>
        [...document.querySelectorAll<HTMLElement>(selector)]
          .map((row) => row.getBoundingClientRect().top)
          .sort((a, b) => a - b),
      ROW,
    );
    for (let i = 1; i < tops.length; i++) expect(tops[i] - tops[i - 1]).toBe(72);
  });

  test('a hidden chat list that receives reorders comes back at the top (the preload does not slide its window)', async ({
    page,
  }) => {
    await openApp(page);
    await addContacts(page, 90);
    await expect.poll(() => visualOrder(page).then((titles) => titles[0])).toBe('Contact 90');

    // Focusing the search switches the left column to the global search: the chat list slide gets `display: none`
    await page.locator('#LeftColumn .SearchInput input').click();
    await expect(page.locator('#LeftColumn .chat-list')).toBeHidden();

    for (const [id, text] of [
      ['1005', 'first reorder'],
      ['1007', 'second reorder'],
    ]) {
      await page.evaluate(
        ([chatId, message]) => {
          (window as unknown as TestWindow).getActions().apiUpdate({
            '@type': 'newMessage',
            chatId,
            id: 5000 + Number(chatId),
            message: {
              id: 5000 + Number(chatId),
              chatId,
              date: Math.floor(Date.now() / 1000),
              isOutgoing: false,
              senderId: chatId,
              content: { text: { text: message } },
            },
          });
        },
        [id, text],
      );
      await page.waitForTimeout(1200); // longer than the loader's quiet period
    }

    await page.keyboard.press('Escape');
    await expect(page.locator('#LeftColumn .chat-list').first()).toBeVisible();
    await expect.poll(() => visualOrder(page).then((titles) => titles.slice(0, 2))).toEqual(['Contact 7', 'Contact 5']);
    // The window is still on top: the first row is inside the list, not below the fold
    const firstTop = await page.evaluate((selector) => {
      const list = document.querySelector('#LeftColumn .chat-list')!.getBoundingClientRect();
      const tops = [...document.querySelectorAll<HTMLElement>(selector)].map((row) => row.getBoundingClientRect().top);
      return Math.min(...tops) - list.top;
    }, ROW);
    expect(firstTop).toBeLessThan(80);
  });

  test('rows mounted by a later scroll do not replay a reorder that happened above the window', async ({ page }) => {
    await openApp(page);
    await addContacts(page, 90);
    await expect.poll(() => visualOrder(page).then((titles) => titles[0])).toBe('Contact 90');

    // Slide the rendered window down, away from the top of the list
    await page.mouse.move(150, 400);
    for (let i = 0; i < 14; i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(120);
    }
    await expect.poll(() => visualOrder(page).then((titles) => titles.includes('Contact 90'))).toBe(false);

    // A chat in the top of the list gets a message: the rows above the window move, none of the mounted ones does
    await page.evaluate(() => {
      (window as unknown as TestWindow).getActions().apiUpdate({
        '@type': 'newMessage',
        chatId: '1080',
        id: 7000,
        message: {
          id: 7000,
          chatId: '1080',
          date: Math.floor(Date.now() / 1000),
          isOutgoing: false,
          senderId: '1080',
          content: { text: { text: 'moved to the top' } },
        },
      });
    });
    await page.waitForTimeout(600);

    // Scroll back up: the rows that mount now were not part of the reorder animation of tt (its diff lives for one render)
    await page.evaluate(() => {
      (window as unknown as { __animated: number }).__animated = 0;
      new MutationObserver((records) => {
        for (const record of records) {
          const target = record.target as HTMLElement;
          if (target.matches?.('.chat-list .ListItem.Chat') && target.matches('.animate-transform, .animate-opacity')) {
            (window as unknown as { __animated: number }).__animated++;
          }
        }
      }).observe(document.querySelector('#LeftColumn .chat-list')!, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    });
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(120);
    }
    await expect.poll(() => visualOrder(page).then((titles) => titles[0])).toBe('Contact 80');
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { __animated: number }).__animated)).toBe(0);
  });

  test('conceals spoilers in the chat list: the login code of the 777000 chat and a spoilered draft', async ({
    page,
  }) => {
    await openApp(page);
    await addContacts(page, 1);
    // The service notifications chat: tt wraps the login code of its last message in a Spoiler entity for the chat list
    await page.evaluate(() => {
      const { apiUpdate } = (window as unknown as TestWindow).getActions();
      const id = '777000';
      apiUpdate({
        '@type': 'updateUser',
        id,
        user: { id, type: 'userTypeRegular', firstName: 'Telegram', isMin: false, phoneNumber: '' },
      });
      apiUpdate({ '@type': 'updateChat', id, chat: { id, type: 'chatTypePrivate', title: 'Telegram', isMin: false } });
      apiUpdate({ '@type': 'updateChatListType', id, folderId: 0 });
      apiUpdate({
        '@type': 'newMessage',
        chatId: id,
        id: 1,
        message: {
          id: 1,
          chatId: id,
          date: Math.floor(Date.now() / 1000),
          isOutgoing: false,
          senderId: id,
          content: {
            text: {
              text: 'Login code: 48213. Do not give this code to anyone, even if they say they are from Telegram!',
            },
          },
        },
      });
    });
    const login = page.locator(ROW).filter({ hasText: /Do not give this code/ });
    await expect(login).toHaveCount(1);
    await expect(login).not.toContainText('48213');
    await expect(login).toContainText('Login code:');

    // A draft of the contact with a spoilered secret
    await patchMainThread(page, '1001', {
      localState: {
        draft: {
          text: { text: 'the pin is 9917', entities: [{ type: 'MessageEntitySpoiler', offset: 11, length: 4 }] },
          date: Math.floor(Date.now() / 1000) + 10,
        },
      },
    });
    const draft = page.locator(ROW).filter({ hasText: 'the pin is' });
    await expect(draft).toHaveCount(1);
    await expect(draft).not.toContainText('9917');
  });

  test('a click on the active folder tab scrolls its list to the top', async ({ page }) => {
    await openApp(page);
    await addContacts(page, 90);
    await page.evaluate(() => {
      const { apiUpdate } = (window as unknown as TestWindow).getActions();
      apiUpdate({
        '@type': 'updateChatFolder',
        id: 5,
        folder: { id: 5, title: { text: 'Work' }, includedChatIds: ['1001'], excludedChatIds: [], pinnedChatIds: [] },
      });
      apiUpdate({ '@type': 'updateChatFoldersOrder', orderedIds: [0, 5] });
    });
    await expect(page.locator('#LeftColumn .TabList > [class*="__tab"]')).toHaveCount(2);

    const scrollTop = () =>
      page.evaluate(() => document.querySelector('#LeftColumn .Transition_slide-active > .chat-list')!.scrollTop);
    await page.mouse.move(150, 400);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(120);
    }
    await expect.poll(scrollTop).toBeGreaterThan(300);

    await page.locator('#LeftColumn .TabList > [class*="__tab"]').nth(0).click();
    await expect.poll(scrollTop).toBe(0);
  });

  test('keyboard: Alt+Down / Alt+Up open the next / previous chat of the list', async ({ page }) => {
    await openApp(page);
    await addContacts(page, 3);
    await expect
      .poll(() => visualOrder(page))
      .toEqual(['Contact 3', 'Contact 2', 'Contact 1', 'aass', 'SavedMessages']);
    const openChat = () =>
      page.evaluate(() => {
        const global = (window as unknown as TestWindow).getGlobal();
        const tab = Object.values<any>(global.byTabId)[0];
        return tab.messageLists.at(-1)?.chatId;
      });

    await page.keyboard.press('Alt+ArrowDown'); // no chat is open: the first one
    await expect.poll(openChat).toBe('1003');
    await page.keyboard.press('Alt+ArrowDown');
    await expect.poll(openChat).toBe('1002');
    await page.keyboard.press('Alt+ArrowUp');
    await expect.poll(openChat).toBe('1003');
  });

  test('keyboard: Ctrl+Shift+Digit opens the folder, Escape returns to the first one', async ({ page }) => {
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
    await expect(page.locator('#LeftColumn .TabList > [class*="__tab"]')).toHaveCount(2);
    const activeFolder = () =>
      page.evaluate(
        () => Object.values<any>((window as unknown as TestWindow).getGlobal().byTabId)[0].activeChatFolder,
      );

    await page.keyboard.press('Control+Shift+Digit2');
    await expect.poll(activeFolder).toBe(1);
    await expect.poll(() => visualOrder(page, ACTIVE_ROW)).toEqual(['Contact 2', 'Contact 1']);

    await page.keyboard.press('Escape');
    await expect.poll(activeFolder).toBe(0);
    await expect.poll(() => visualOrder(page, ACTIVE_ROW)).toHaveLength(5);
  });

  test('a context menu item runs its action (Quick Preview opens the preview of that chat)', async ({ page }) => {
    await openApp(page);
    await addContacts(page, 2);
    await page.locator(ROW).filter({ hasText: 'Contact 2' }).click({ button: 'right' });
    await page.locator('.ListItem-context-menu .bubble').getByText('Quick Preview').click();
    await expect(page.locator('.ListItem-context-menu')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => Object.values<any>((window as unknown as TestWindow).getGlobal().byTabId)[0].quickPreview?.chatId,
        ),
      )
      .toBe('1002');
  });

  // A gap above or below the rows (a viewport that shows empty space where rows should be) after the window slid.
  const gapOf = (page: Page) =>
    page.evaluate((selector) => {
      const list = document.querySelector('#LeftColumn .Transition_slide-active > .chat-list') as HTMLElement;
      const box = list.getBoundingClientRect();
      const rects = [...document.querySelectorAll<HTMLElement>(selector)].map((row) => row.getBoundingClientRect());
      const firstTop = Math.min(...rects.map((rect) => rect.top));
      const lastBottom = Math.max(...rects.map((rect) => rect.bottom));
      return {
        scrollTop: Math.round(list.scrollTop),
        scrollHeight: list.scrollHeight,
        // positive: empty pixels at the top / bottom of the viewport
        above: Math.max(0, Math.round(firstTop - box.top)),
        below: Math.max(0, Math.round(box.bottom - lastBottom)),
        rows: rects.length,
      };
    }, ACTIVE_ROW);
  const expectNoGap = async (page: Page, what: string) => {
    // the loader answers within a frame or two of the scroll event
    await expect
      .poll(
        async () => {
          const { above, below } = await gapOf(page);
          return above + below;
        },
        { message: what, timeout: 5000 },
      )
      .toBe(0);
  };

  test('no gap above the rows after the window slid down and the list is scrolled back up (real account bug)', async ({
    page,
  }) => {
    await openApp(page);
    await addContacts(page, 400);
    await expect.poll(() => visualOrder(page).then((titles) => titles[0])).toBe('Contact 400');
    await page.mouse.move(150, 400);

    // down, several pages past the first window shifts
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(120);
      if (i % 5 === 4) await expectNoGap(page, `down, step ${i}`);
    }
    const deep = await gapOf(page);
    expect(deep.scrollTop).toBeGreaterThan(6000); // well past the first shifts
    expect((await visualOrder(page)).includes('Contact 400')).toBe(false);

    // and back up, in steps
    for (let i = 0; i < 38; i++) {
      await page.mouse.wheel(0, -500);
      await page.waitForTimeout(120);
      if (i % 4 === 3) await expectNoGap(page, `up, step ${i}`);
    }
    await expect.poll(() => visualOrder(page).then((titles) => titles[0])).toBe('Contact 400');
    await expectNoGap(page, 'back at the top');
  });

  test('no gap after a jump by scrollTop assignment (down, then up) once the user scrolls on', async ({ page }) => {
    await openApp(page);
    await addContacts(page, 400);
    await expect.poll(() => visualOrder(page).then((titles) => titles[0])).toBe('Contact 400');
    await page.mouse.move(150, 400);
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(120);
    }
    await expectNoGap(page, 'deep');

    // a fast jump back up by about three windows (30 rows * 72 px each), then the scroll goes on in small steps
    await page.evaluate(() => {
      const list = document.querySelector('#LeftColumn .Transition_slide-active > .chat-list') as HTMLElement;
      list.scrollTop -= 3 * 30 * 72;
    });
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(150);
    }
    await expectNoGap(page, 'after the jump up');

    // and a jump down
    await page.evaluate(() => {
      const list = document.querySelector('#LeftColumn .Transition_slide-active > .chat-list') as HTMLElement;
      list.scrollTop += 2 * 30 * 72;
    });
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(150);
    }
    await expectNoGap(page, 'after the jump down');
  });
});
