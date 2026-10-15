// The middle column of an open chat (messages slice): the mocked client's `messages` scenario (chat "Alice Tester": 300
// messages, 33 unread, "Bob Reader": 60 read, "Carol Short": 3 read; `__invokeMiddlewares__/messages.ts` pages the history like
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
    // tt's SafeLink logs a link it cannot parse (the `javascript:` URL of the security test); the mocked client has no
    // full user info (`users.GetFullUser` answers without the user)
    ignoreConsole: [
      /GetFullUser|buildApiUserFullInfo|reading 'id'/,
      /action "loadFullUser" failed/,
      /SafeLink.getDecodedUrl error/,
    ],
  },
});

async function openMessages(page: Page) {
  await openApp(page, '/#?mockScenario=messages');
  await expect(page.locator(ROW)).toHaveCount(4);
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
        const state = () =>
          `${list.scrollTop}|${list.scrollHeight}|${list.querySelectorAll('.message-list-item').length}`;
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
    expect(
      visible[i].top - visible[i - 1].bottom,
      `${label}: gap between ${visible[i - 1].id} and ${visible[i].id}`,
    ).toBeLessThan(VIEWPORT_GAP);
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
    .sort(
      (a, b) =>
        Math.abs((a.top + a.bottom) / 2 - s.clientHeight / 2) - Math.abs((b.top + b.bottom) / 2 - s.clientHeight / 2),
    )[0];

const unreadBadge = (page: Page, name: string) =>
  page.locator(ROW).filter({ hasText: name }).locator('[class*="unread"]');

test.describe('message list', () => {
  test('renders the history with date separators, the header and the bubbles of a short chat', async ({ page }) => {
    await openMessages(page);
    await openChat(page, 'Carol Short');

    await expect(page.locator(`#MiddleColumn .MiddleHeader`)).toContainText('Carol Short');
    await expect(page.locator(ITEM)).toHaveCount(4);
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

    // a service message played as the server (into the open chat): rendered by ActionMessage after the bubbles
    await openChat(page, 'Bob Reader');
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
    await expect(page.locator(`${LIST} .ActionMessage`)).toHaveCount(1);
    await expect(page.locator(`${LIST} .ActionMessage`)).toContainText('removed group photo');
  });

  test('opens at the first unread message with the divider, and marking as read updates the chat list badge', async ({
    page,
  }) => {
    await openMessages(page);
    await expect(unreadBadge(page, 'Alice Tester')).toContainText('33');
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
    await expect
      .poll(async () => Number((await unreadBadge(page, 'Alice Tester').textContent()) || 0))
      .toBeLessThan(33);
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

  test('a new incoming message appends; it scrolls to the bottom only when the list is at the bottom', async ({
    page,
  }) => {
    await openMessages(page);
    await openChat(page, 'Bob Reader');

    const play = (id: number, text: string) =>
      page.evaluate(
        ([messageId, messageText]) => {
          (window as unknown as TestWindow).getActions().apiUpdate({
            '@type': 'newMessage',
            chatId: '6',
            id: messageId,
            message: {
              id: messageId,
              chatId: '6',
              date: Math.floor(Date.now() / 1000),
              isOutgoing: false,
              senderId: '6',
              content: { text: { text: messageText } },
            },
          });
        },
        [id, text] as const,
      );

    // at the bottom: the new message is appended and the list follows it
    await play(1062, 'new at the bottom');
    await expect(page.locator(`${LIST} #message-1062`)).toBeVisible();
    await settle(page);
    let s = await snapshot(page);
    expect(s.scrollTop + s.clientHeight).toBeGreaterThanOrEqual(s.scrollHeight - 3);
    expect(s.items.find((i) => i.id === 1062)!.bottom).toBeLessThanOrEqual(s.clientHeight);
    await expect(page.locator(`${LIST} ~ * [class*="ScrollDownButton-module__unread-count"]`)).toHaveCount(0);

    // scrolled up (past the bottom snap and the "near bottom" threshold): the list stays, the button shows a counter
    for (let i = 0; i < 4; i++) {
      await wheel(page, -400);
      await page.waitForTimeout(100);
    }
    await settle(page);
    const before = await snapshot(page);
    expect(before.scrollTop + before.clientHeight).toBeLessThan(before.scrollHeight - 300);
    const anchor = middleItem(before);
    await play(1063, 'new while scrolled up');
    // the viewport moved into the past (tt keeps a window of the history), so the message is counted, not rendered
    await expect(page.locator('[class*="ScrollDownButton-module__unread-count"]')).toHaveText('1');
    await settle(page);
    const after = await snapshot(page);
    const moved = after.items.find((i) => i.id === anchor.id)!;
    expect(Math.abs(moved.top - anchor.top), 'the list did not move').toBeLessThanOrEqual(2);
    const button = page.locator('[class*="ScrollDownButton-module__unread-count"]');
    await expect(button).toHaveText('1');
    await play(1064, 'and another');
    await expect(button).toHaveText('2');
    // the counter button scrolls to the bottom
    // (the mocked build has no language pack: the label is tt's key, `AccDescrPageDown`)
    await page.locator('[aria-label="AccDescrPageDown"]').click();
    await settle(page, 800);
    s = await snapshot(page);
    expect(s.scrollTop + s.clientHeight).toBeGreaterThanOrEqual(s.scrollHeight - 3);
    await expect(button).toHaveCount(0);
  });

  test('switching chats keeps the scroll position of each chat, as tt does', async ({ page }) => {
    await openMessages(page);
    await openChat(page, 'Alice Tester');
    for (let i = 0; i < 6; i++) {
      await wheel(page, -450);
      await page.waitForTimeout(120);
    }
    await settle(page, 700);
    // tt saves the position (`setScrollOffset`) 200 ms after the last scroll event
    await page.waitForTimeout(600);
    const before = await snapshot(page);
    const anchor = middleItem(before);
    expect(minId(before)).toBeLessThan(anchor.id);

    await openChat(page, 'Bob Reader');
    await expect(page.locator(`${LIST} #message-${anchor.id}`)).toHaveCount(0);
    await openChat(page, 'Alice Tester');
    await settle(page, 700);
    const after = await snapshot(page);
    const back = after.items.find((i) => i.id === anchor.id);
    expect(back, `message ${anchor.id} is rendered again`).toBeDefined();
    expect(Math.abs(back!.top - anchor.top), 'the same message is at the same place').toBeLessThanOrEqual(3);
    expectNoGap(after, { first: 1, last: 300 }, 'after switching back');
  });

  test('entities render as tt renders them, a spoiler stays concealed until it is clicked', async ({ page }) => {
    await openMessages(page);
    await openChat(page, 'Carol Short');
    const text = 'bold italic under strike code pre link mention #hash $CASH /cmd secret https://example.com/x quote';
    const at = (word: string) => ({ offset: text.indexOf(word), length: word.length });
    const entities = [
      { type: 'MessageEntityBold', ...at('bold') },
      { type: 'MessageEntityItalic', ...at('italic') },
      { type: 'MessageEntityUnderline', ...at('under') },
      { type: 'MessageEntityStrike', ...at('strike') },
      { type: 'MessageEntityCode', ...at('code') },
      { type: 'MessageEntityPre', ...at('pre'), language: 'js' },
      { type: 'MessageEntityTextUrl', ...at('link'), url: 'https://example.org/a?b=c' },
      { type: 'MessageEntityMention', ...at('mention') },
      { type: 'MessageEntityHashtag', ...at('#hash') },
      { type: 'MessageEntityCashtag', ...at('$CASH') },
      { type: 'MessageEntityBotCommand', ...at('/cmd') },
      { type: 'MessageEntitySpoiler', ...at('secret') },
      { type: 'MessageEntityUrl', ...at('https://example.com/x') },
      { type: 'MessageEntityBlockquote', ...at('quote') },
    ];
    await page.evaluate(
      ([messageText, messageEntities]) => {
        (window as unknown as TestWindow).getActions().apiUpdate({
          '@type': 'newMessage',
          chatId: '7',
          id: 2100,
          message: {
            id: 2100,
            chatId: '7',
            date: Math.floor(Date.now() / 1000),
            isOutgoing: false,
            senderId: '7',
            content: { text: { text: messageText, entities: messageEntities } },
          },
        });
      },
      [text, entities] as const,
    );

    const content = page.locator(`${LIST} #message-2100 .text-content`);
    await expect(content).toBeVisible();
    await expect(content.locator('strong[data-entity-type="MessageEntityBold"]')).toHaveText('bold');
    await expect(content.locator('em')).toHaveText('italic');
    await expect(content.locator('ins')).toHaveText('under');
    await expect(content.locator('del')).toHaveText('strike');
    await expect(content.locator('code.text-entity-code')).toHaveText('code');
    await expect(content.locator('.CodeBlock pre.code-block')).toContainText('pre');
    const link = content.locator('a[data-entity-type="MessageEntityTextUrl"]');
    await expect(link).toHaveAttribute('href', 'https://example.org/a?b=c');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(content.locator('a[data-entity-type="MessageEntityUrl"]')).toHaveAttribute(
      'href',
      'https://example.com/x',
    );
    for (const [type, label] of [
      ['MessageEntityMention', 'mention'],
      ['MessageEntityHashtag', '#hash'],
      ['MessageEntityCashtag', '$CASH'],
      ['MessageEntityBotCommand', '/cmd'],
    ]) {
      await expect(content.locator(`a[data-entity-type="${type}"]`)).toHaveText(label);
    }
    await expect(content.locator('blockquote[data-entity-type="MessageEntityBlockquote"]')).toContainText('quote');

    // a spoiler: concealed (the dots over transparent text) until it is clicked, then revealed for good
    const spoiler = content.locator('.Spoiler');
    await expect(spoiler).toHaveClass(/Spoiler--concealed/);
    await expect(spoiler.locator('.Spoiler__content')).toHaveCSS('opacity', '0');
    await spoiler.click();
    await expect(spoiler).not.toHaveClass(/Spoiler--concealed/);
    await expect(spoiler.locator('.Spoiler__content')).toHaveCSS('opacity', '1');
  });

  test('a javascript: link is never rendered as a live href', async ({ page }) => {
    await openMessages(page);
    await openChat(page, 'Carol Short');
    page.on('dialog', async (dialog) => {
      await dialog.dismiss();
      throw new Error(`a dialog opened: ${dialog.message()}`);
    });
    const hostile = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(2)',
      ' \tjava\tscript:alert(3)',
      'data:text/html,<script>alert(4)</script>',
      'vbscript:x',
    ];
    const text = `${hostile.map((_, i) => `link${i}`).join(' ')} javascript:alert(5)`;
    const entities = [
      ...hostile.map((url, i) => ({
        type: 'MessageEntityTextUrl',
        offset: text.indexOf(`link${i}`),
        length: `link${i}`.length,
        url,
      })),
      { type: 'MessageEntityUrl', offset: text.indexOf('javascript:alert(5)'), length: 'javascript:alert(5)'.length },
    ];
    await page.evaluate(
      ([messageText, messageEntities]) => {
        (window as unknown as TestWindow).getActions().apiUpdate({
          '@type': 'newMessage',
          chatId: '7',
          id: 2101,
          message: {
            id: 2101,
            chatId: '7',
            date: Math.floor(Date.now() / 1000),
            isOutgoing: false,
            senderId: '7',
            content: { text: { text: messageText, entities: messageEntities } },
          },
        });
      },
      [text, entities] as const,
    );
    const content = page.locator(`${LIST} #message-2101 .text-content`);
    await expect(content.locator('a')).toHaveCount(hostile.length + 1);
    const hrefs = await content.locator('a').evaluateAll((anchors) => anchors.map((a) => a.getAttribute('href') ?? ''));
    for (const href of hrefs) {
      // strip what a URL parser strips (tab, newline, leading control characters and spaces) before looking at the scheme
      const scheme = href.replace(/[\s\p{Cc}]/gu, '').toLowerCase();
      expect(scheme, `href ${JSON.stringify(href)}`).not.toMatch(/^(javascript|data|vbscript):/);
      expect(scheme).toMatch(/^https:\/\//);
    }
    // and no element anywhere in the page has a script URL attribute
    expect(
      await page.evaluate(
        () =>
          [...document.querySelectorAll('[href], [src], [action], [formaction]')].filter((el) =>
            ['href', 'src', 'action', 'formaction'].some((name) =>
              /^\s*(javascript|vbscript):/i.test(el.getAttribute(name) ?? ''),
            ),
          ).length,
      ),
    ).toBe(0);
  });
});
