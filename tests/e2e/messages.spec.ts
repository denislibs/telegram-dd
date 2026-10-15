// The middle column of an open chat (messages slice): the mocked client's `messages` scenario (chat "Alice Tester": 300
// messages, 50 unread, "Bob Reader": 60 read, "Carol Short": 3 read; `__invokeMiddlewares__/messages.ts` pages the history like
// the server) plus messages that the test plays as the server with `apiUpdate`.
import type { Page } from '@playwright/test';

import { openApp } from './authHelpers';
import { expect, test } from './fixtures';

type TestWindow = {
  getActions: () => { apiUpdate: (update: Record<string, unknown>) => void };
  getGlobal: () => Record<string, any>;
};

const ROW = '#LeftColumn .chat-list .ListItem.Chat';
const LIST = '#MiddleColumn .MessageList';
const ITEM = `${LIST} .message-list-item`;

// The known noise of the mocked client: no full user info / folders / language pack (see tests/e2e/strictMonitor.ts)
test.use({
  strictOptions: {
    ignoreConsole: [/GetFullUser|buildApiUserFullInfo|reading 'id'/, /action "loadFullUser" failed/],
  },
});

async function openMessages(page: Page) {
  await openApp(page, '/#?mockScenario=messages');
  await expect(page.locator(ROW)).toHaveCount(3);
}

async function openChat(page: Page, name: string) {
  await page.locator(ROW).filter({ hasText: name }).click();
  await expect(page.locator(`#MiddleColumn .MiddleHeader`)).toContainText(name);
  await expect(page.locator(ITEM).first()).toBeVisible();
  await settle(page);
}

// the list has been quiet (no scroll, no new items) for a while: loads and animations are over
async function settle(page: Page, quietMs = 500) {
  await page.evaluate(
    (ms) =>
      new Promise<void>((resolve) => {
        const list = document.querySelector('#MiddleColumn .MessageList') as HTMLElement;
        const state = () => `${list.scrollTop}|${list.scrollHeight}|${list.querySelectorAll('.message-list-item').length}`;
        let last = state();
        let since = performance.now();
        const tick = () => {
          const now = state();
          if (now !== last) {
            last = now;
            since = performance.now();
          }
          if (performance.now() - since >= ms) resolve();
          else setTimeout(tick, 50);
        };
        tick();
      }),
    quietMs,
  );
}

type Snapshot = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  // `top` / `bottom` relative to the top of the scroll container's viewport
  items: { id: number; top: number; bottom: number }[];
  dividerTop?: number;
};

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const list = document.querySelector('#MiddleColumn .MessageList') as HTMLElement;
    const listTop = list.getBoundingClientRect().top;
    const divider = list.querySelector('.unread-divider');
    return {
      scrollTop: list.scrollTop,
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight,
      items: [...list.querySelectorAll<HTMLElement>('.message-list-item')].map((el) => {
        const rect = el.getBoundingClientRect();
        return { id: Number(el.dataset.messageId), top: rect.top - listTop, bottom: rect.bottom - listTop };
      }),
      dividerTop: divider ? divider.getBoundingClientRect().top - listTop : undefined,
    };
  });
}

const minId = (s: Snapshot) => Math.min(...s.items.map((i) => i.id));
const maxId = (s: Snapshot) => Math.max(...s.items.map((i) => i.id));
const VIEWPORT_GAP = 160; // between two bubbles there are margins and date headers, nothing near this

// The viewport is not empty and has no hole: some item is in it, the items cover it from top to bottom within a bubble gap
// (except past the real ends of the history: message ids 1 and 300 of Alice).
function expectNoGap(s: Snapshot, ends: { first?: number; last?: number } = {}, label = '') {
  const visible = s.items.filter((i) => i.bottom > 0 && i.top < s.clientHeight).sort((a, b) => a.top - b.top);
  expect(visible.length, `${label}: an item in the viewport`).toBeGreaterThan(0);
  const first = visible[0];
  const last = visible[visible.length - 1];
  if (ends.first === undefined || minId(s) !== ends.first) {
    expect(first.top, `${label}: the top of the viewport is covered (first visible ${first.id})`).toBeLessThanOrEqual(
      VIEWPORT_GAP,
    );
  }
  if (ends.last === undefined || maxId(s) !== ends.last) {
    expect(
      s.clientHeight - last.bottom,
      `${label}: the bottom of the viewport is covered (last visible ${last.id})`,
    ).toBeLessThanOrEqual(VIEWPORT_GAP + 120);
  }
  for (let i = 1; i < visible.length; i++) {
    expect(visible[i].top - visible[i - 1].bottom, `${label}: gap between ${visible[i - 1].id} and ${visible[i].id}`).toBeLessThan(
      VIEWPORT_GAP,
    );
  }
}

async function wheel(page: Page, dy: number) {
  await page.mouse.move(800, 400);
  await page.mouse.wheel(0, dy);
}

// the item that is nearest to the middle of the viewport
const middleItem = (s: Snapshot) =>
  [...s.items]
    .filter((i) => i.bottom > 0 && i.top < s.clientHeight)
    .sort((a, b) => Math.abs((a.top + a.bottom) / 2 - s.clientHeight / 2) - Math.abs((b.top + b.bottom) / 2 - s.clientHeight / 2))[0];

const unreadBadge = (page: Page, name: string) => page.locator(ROW).filter({ hasText: name }).locator('[class*="unread"]');

test.describe('message list', () => {
  test('renders the history with date separators, the header and the bubbles of a short chat', async ({ page }) => {
    await openMessages(page);
    await openChat(page, 'Carol Short');

    await expect(page.locator(`#MiddleColumn .MiddleHeader`)).toContainText('Carol Short');
    await expect(page.locator(ITEM)).toHaveCount(3);
    await expect(page.locator(`${LIST} .sticky-date`)).toHaveCount(1);
    await expect(page.locator(`${LIST} .sticky-date`)).toContainText('December 26, 2023');
    // own and other bubbles, time and the outgoing status
    await expect(page.locator(`${LIST} .Message.own`)).toHaveCount(1);
    await expect(page.locator(`${LIST} .Message:not(.own)`)).toHaveCount(2);
    await expect(page.locator(`${LIST} .Message`).first()).toContainText('Carol one');
    await expect(page.locator(`${LIST} .Message.own .MessageOutgoingStatus`)).toBeVisible();
    await expect(page.locator(`${LIST} .Message .message-time`).first()).toBeVisible();
    // it fits: no scrolling, the last message is at the bottom of the viewport
    const s = await snapshot(page);
    expect(s.scrollHeight).toBeLessThanOrEqual(s.clientHeight + 1);
    expectNoGap(s, { first: 2001, last: 2003 }, 'short chat');
  });

  test('a long chat shows several date separators and service messages', async ({ page }) => {
    await openMessages(page);
    await openChat(page, 'Alice Tester');
    const dates = await page.locator(`${LIST} .sticky-date`).allTextContents();
    expect(dates.length).toBeGreaterThanOrEqual(3);
    expect(new Set(dates).size).toBe(dates.length);

    // a service message played as the server: rendered by ActionMessage between the bubbles
    await page.evaluate(() => {
      (window as unknown as TestWindow).getActions().apiUpdate({
        '@type': 'newMessage',
        chatId: '6',
        id: 1061,
        message: {
          id: 1061,
          chatId: '6',
          date: Math.floor(Date.now() / 1000),
          isOutgoing: false,
          senderId: '6',
          content: { action: { mediaType: 'action', type: 'chatDeletePhoto' } },
        },
      });
    });
    await openChat(page, 'Bob Reader');
    await expect(page.locator(`${LIST} .ActionMessage`)).toHaveCount(1);
    await expect(page.locator(`${LIST} .ActionMessage`)).toContainText(/photo/i);
  });

  test('opens at the first unread message with the divider, and marking as read updates the chat list badge', async ({
    page,
  }) => {
    await openMessages(page);
    await expect(unreadBadge(page, 'Alice Tester')).toContainText('50');
    await openChat(page, 'Alice Tester');

    const s = await snapshot(page);
    expect(s.dividerTop, 'the unread divider is in the list').toBeDefined();
    // tt scrolls the divider to the top of the list (UNREAD_DIVIDER_TOP) and the first unread message is right below it
    expect(s.dividerTop!).toBeGreaterThanOrEqual(-2);
    expect(s.dividerTop!).toBeLessThan(80);
    const firstUnread = s.items.find((i) => i.id === 251)!;
    expect(firstUnread.top).toBeGreaterThanOrEqual(s.dividerTop!);
    expect(firstUnread.top).toBeLessThan(s.dividerTop! + 120);
    expectNoGap(s, { first: 1, last: 300 }, 'first unread');

    // the messages in the viewport were marked as read: the badge went down, but not to zero
    await expect.poll(async () => Number((await unreadBadge(page, 'Alice Tester').textContent()) || 0)).toBeLessThan(50);
    // reading the rest (scroll down to the end of the history) clears it
    for (let i = 0; i < 40; i++) {
      await wheel(page, 700);
      await page.waitForTimeout(120);
    }
    await settle(page);
    expect(maxId(await snapshot(page))).toBe(300);
    await expect(unreadBadge(page, 'Alice Tester')).toHaveCount(0);
  });

  test('scrolling up loads older messages with no jump and no gap (steps)', async ({ page }) => {
    await openMessages(page);
    await openChat(page, 'Alice Tester');

    let prependedTimes = 0;
    let before = await snapshot(page);
    for (let step = 0; step < 60 && minId(before) > 1; step++) {
      const anchor = middleItem(before);
      await wheel(page, -300);
      await page.waitForTimeout(60);
      expectNoGap(await snapshot(page), { first: 1, last: 300 }, `step ${step} (right away)`);
      await settle(page, 250);
      const after = await snapshot(page);
      expectNoGap(after, { first: 1, last: 300 }, `step ${step} (settled)`);

      const moved = after.items.find((i) => i.id === anchor.id);
      if (moved) {
        // the wheel moved the content down by at most the step; a prepend that shifted it would show as a bigger jump
        const delta = moved.top - anchor.top;
        expect(delta, `step ${step}: message ${anchor.id} moved by ${delta}px`).toBeGreaterThanOrEqual(-2);
        expect(delta, `step ${step}: message ${anchor.id} moved by ${delta}px`).toBeLessThanOrEqual(302);
      }
      if (minId(after) < minId(before)) prependedTimes++;
      before = after;
    }
    expect(minId(before), 'the whole history was reached').toBe(1);
    expect(prependedTimes, 'older messages were loaded in several pages').toBeGreaterThanOrEqual(3);
  });

  test('scrolling by jumps (scrollTop assignment) up and down never leaves the viewport empty', async ({ page }) => {
    await openMessages(page);
    await openChat(page, 'Alice Tester');

    // up: a jump to the top, then one step each time something is loaded
    for (let round = 0; round < 8; round++) {
      const before = await snapshot(page);
      if (minId(before) === 1) break;
      await page.evaluate(() => {
        (document.querySelector('#MiddleColumn .MessageList') as HTMLElement).scrollTop = 0;
      });
      await page.waitForTimeout(40);
      expectNoGap(await snapshot(page), { first: 1, last: 300 }, `jump up ${round} (right away)`);
      // the loader runs on scroll events and intersection: a wheel step lets it see the new position
      await wheel(page, -40);
      await settle(page, 400);
      expectNoGap(await snapshot(page), { first: 1, last: 300 }, `jump up ${round} (settled)`);
    }
    expect(minId(await snapshot(page))).toBeLessThan(100);

    // down: jump to the bottom of what is rendered
    for (let round = 0; round < 12; round++) {
      const before = await snapshot(page);
      if (maxId(before) === 300 && before.scrollTop + before.clientHeight >= before.scrollHeight - 2) break;
      await page.evaluate(() => {
        const list = document.querySelector('#MiddleColumn .MessageList') as HTMLElement;
        list.scrollTop = list.scrollHeight;
      });
      await page.waitForTimeout(40);
      expectNoGap(await snapshot(page), { first: 1, last: 300 }, `jump down ${round} (right away)`);
      await wheel(page, 40);
      await settle(page, 400);
      expectNoGap(await snapshot(page), { first: 1, last: 300 }, `jump down ${round} (settled)`);
    }
    expect(maxId(await snapshot(page))).toBe(300);
  });
});
