// The composer (composer slice) against the mocked client's `messages` scenario (chats "Alice Tester", "Bob Reader",
// "Carol Short", "Dave Entities"). The mock answers SendMessage / EditMessage / SaveDraft / SetTyping
// (src/lib/gramjs/client/mockUtils/composerRequests.ts); a message that contains `[slow]` is answered 2.2 s late (the API layer marks a message "sending" after 1 s), so that
// the "sending" status can be observed.
import type { Page } from '@playwright/test';

import { openApp } from './authHelpers';
import { expect, test } from './fixtures';

type TestWindow = {
  getActions: () => Record<string, (payload?: Record<string, unknown>) => void>;
  getGlobal: () => Record<string, any>;
};

const ROW = '#LeftColumn .chat-list .ListItem.Chat';
const LIST = '#MiddleColumn .MessageList';
const ITEM = `${LIST} .message-list-item`;
const INPUT = '#editable-message-text';
const SEND = '.Composer .main-button';

test.use({
  // The known noise of the mocked client: no full user info / folders / language pack (see tests/e2e/strictMonitor.ts)
  strictOptions: {
    ignoreConsole: [/GetFullUser|buildApiUserFullInfo|reading 'id'/, /action "loadFullUser" failed/],
  },
});

async function openMessages(page: Page) {
  await openApp(page, '/#?mockScenario=messages');
  await expect(page.locator(ROW)).toHaveCount(4);
}

async function openChat(page: Page, name: string) {
  await page.locator(ROW).filter({ hasText: name }).click();
  await expect(page.locator('#MiddleColumn .MiddleHeader')).toContainText(name);
  await expect(page.locator(ITEM).first()).toBeVisible();
  // the editor is created asynchronously (the `editor` bundle)
  await expect(page.locator(INPUT)).toHaveAttribute('contenteditable', 'true');
  await page.waitForTimeout(800);
}

async function typeText(page: Page, text: string) {
  await page.locator(INPUT).click();
  await page.keyboard.type(text);
}

const lastItem = (page: Page) => page.locator(ITEM).last();

/** The text of the last message of the chat, with its entities, as the global holds it. */
async function lastMessageOf(page: Page, chatId: string) {
  return page.evaluate((id) => {
    const global = (window as unknown as TestWindow).getGlobal();
    const byId = global.messages.byChatId[id].byId as Record<string, any>;
    const ids = Object.keys(byId)
      .map(Number)
      .sort((a, b) => a - b);
    const message = byId[ids[ids.length - 1]];
    return {
      id: message.id,
      text: message.content.text?.text as string | undefined,
      entities: (message.content.text?.entities || []) as {
        type: string;
        offset: number;
        length: number;
        url?: string;
      }[],
      replyToMsgId: message.replyInfo?.replyToMsgId as number | undefined,
      sendingState: message.sendingState as string | undefined,
    };
  }, chatId);
}

const CAROL = '7';

test('type and send: the message appears at the bottom, sending then sent, the chat goes to the top with the new preview', async ({
  page,
}) => {
  await openMessages(page);
  await openChat(page, 'Carol Short');
  // Carol is not on top: Dave's chat is
  await expect(page.locator(ROW).first()).toContainText('Dave Entities');
  const before = await page.locator(ITEM).count();

  await typeText(page, 'Hello from the composer [slow]');
  await page.locator(SEND).click();

  await expect(page.locator(ITEM)).toHaveCount(before + 1);
  await expect(lastItem(page)).toContainText('Hello from the composer [slow]');
  // sending ...
  const activeStatus = lastItem(page).locator('.MessageOutgoingStatus .Transition_slide-active');
  await expect(activeStatus.locator('.icon-message-pending')).toBeVisible();
  // ... sent (the kit's Transition keeps the leaving slide, the active one is what the reader sees)
  await expect(activeStatus.locator('.icon-check')).toBeVisible();
  await expect(activeStatus.locator('.icon-message-pending')).toHaveCount(0);

  // the bottom of the list shows it and the input is empty again
  const { items, scroller } = await page.evaluate(() => {
    const list = document.querySelector('#MiddleColumn .MessageList') as HTMLElement;
    const last = [...list.querySelectorAll<HTMLElement>('.message-list-item')].pop()!;
    return {
      items: last.getBoundingClientRect().bottom,
      scroller: list.getBoundingClientRect().bottom,
    };
  });
  expect(items).toBeLessThanOrEqual(scroller + 1);
  await expect(page.locator(`${INPUT} p`)).toHaveText('');

  // the chat moved to the top of the chat list with the new preview
  await expect(page.locator(ROW).first()).toContainText('Carol Short');
  await expect(page.locator(ROW).first()).toContainText('Hello from the composer [slow]');
});

test('Enter sends, Shift+Enter makes a new line', async ({ page }) => {
  await openMessages(page);
  await openChat(page, 'Carol Short');
  const before = await page.locator(ITEM).count();

  await typeText(page, 'line one');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('line two');
  // two paragraphs, nothing sent yet
  await expect(page.locator(`${INPUT} p`)).toHaveCount(2);
  await expect(page.locator(ITEM)).toHaveCount(before);

  await page.keyboard.press('Enter');
  await expect(page.locator(ITEM)).toHaveCount(before + 1);
  await expect.poll(async () => (await lastMessageOf(page, CAROL)).text).toBe('line one\nline two');
  await expect(page.locator(`${INPUT} p`)).toHaveText('');

  // an empty input sends nothing
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await expect(page.locator(ITEM)).toHaveCount(before + 1);
});

test('with the Ctrl+Enter setting, Enter adds a line and Ctrl+Enter sends', async ({ page }) => {
  await openMessages(page);
  await openChat(page, 'Carol Short');
  await page.evaluate(() => {
    (window as unknown as TestWindow).getActions().setSharedSettingOption({ messageSendKeyCombo: 'ctrl-enter' });
  });
  const before = await page.locator(ITEM).count();

  await typeText(page, 'first');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second');
  await expect(page.locator(`${INPUT} p`)).toHaveCount(2);
  await expect(page.locator(ITEM)).toHaveCount(before);

  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator(ITEM)).toHaveCount(before + 1);
  await expect.poll(async () => (await lastMessageOf(page, CAROL)).text).toBe('first\nsecond');
});

test('reply to a message (Ctrl+ArrowUp), the sent message carries the reply', async ({ page }) => {
  await openMessages(page);
  await openChat(page, 'Carol Short');

  await page.locator(INPUT).click();
  await page.keyboard.press('Control+ArrowUp');
  const bar = page.locator('.Composer .ComposerEmbeddedMessage');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('Carol three');

  await page.keyboard.type('this is a reply');
  await page.keyboard.press('Enter');
  await expect(lastItem(page)).toContainText('this is a reply');
  await expect(lastItem(page).locator('.EmbeddedMessage')).toContainText('Carol three');
  await expect.poll(async () => (await lastMessageOf(page, CAROL)).replyToMsgId).toBe(2003);
  // the bar closes after sending
  await expect(page.locator('.Composer .ComposerEmbeddedMessage')).toHaveCount(0);
});

test('ArrowUp in an empty input edits the last own message', async ({ page }) => {
  await openMessages(page);
  await openChat(page, 'Carol Short');

  await page.locator(INPUT).click();
  await page.keyboard.press('ArrowUp');
  const bar = page.locator('.Composer .ComposerEmbeddedMessage');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText(/Edit\s?Message/i);
  await expect(page.locator(INPUT)).toContainText('Carol two');
  await expect(page.locator(SEND)).toHaveClass(/edit/);

  await page.keyboard.press('End');
  await page.keyboard.type(' (edited)');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => {
      const text = await page.evaluate(() => {
        const global = (window as unknown as TestWindow).getGlobal();
        return global.messages.byChatId['7'].byId['2002'].content.text.text as string;
      });
      return text;
    })
    .toBe('Carol two (edited)');
  await expect(page.locator(ITEM).filter({ hasText: 'Carol two (edited)' })).toHaveCount(1);
  await expect(page.locator('.Composer .ComposerEmbeddedMessage')).toHaveCount(0);
  await expect(page.locator(`${INPUT} p`)).toHaveText('');
});

test('a draft survives switching chats and shows in the chat list preview', async ({ page }) => {
  await openMessages(page);
  await openChat(page, 'Carol Short');
  await typeText(page, 'unsent thought');
  await page.waitForTimeout(300);

  await openChat(page, 'Bob Reader');
  await expect(page.locator(`${INPUT} p`)).toHaveText('');
  const carolRow = page.locator(ROW).filter({ hasText: 'Carol Short' });
  await expect(carolRow.locator('.draft')).toBeVisible();
  await expect(carolRow).toContainText('unsent thought');

  await openChat(page, 'Carol Short');
  await expect(page.locator(INPUT)).toContainText('unsent thought');
  // sending the draft clears it from the preview
  await page.keyboard.press('Enter');
  await expect(carolRow.locator('.draft')).toHaveCount(0);
  await expect(carolRow).toContainText('unsent thought');
});

test('formatting by shortcuts sends the right entities', async ({ page }) => {
  await openMessages(page);
  await openChat(page, 'Carol Short');

  await typeText(page, 'plain ');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type('bold');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type(' ');
  await page.keyboard.press('ControlOrMeta+i');
  await page.keyboard.type('italic');
  await page.keyboard.press('ControlOrMeta+i');
  await expect(page.locator(`${INPUT} strong`)).toHaveText('bold');
  await expect(page.locator(`${INPUT} em`)).toHaveText('italic');

  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lastMessageOf(page, CAROL)).text).toBe('plain bold italic');
  const { entities } = await lastMessageOf(page, CAROL);
  expect(entities.map(({ type, offset, length }) => ({ type, offset, length }))).toEqual([
    { type: 'MessageEntityBold', offset: 6, length: 4 },
    { type: 'MessageEntityItalic', offset: 11, length: 6 },
  ]);
  await expect(lastItem(page).locator('strong, b').first()).toHaveText('bold');
});

test('formatting a selection from the floating formatter', async ({ page }) => {
  await openMessages(page);
  await openChat(page, 'Carol Short');

  await typeText(page, 'make this strong');
  // select the last word: Shift+ArrowLeft x6 ("strong")
  await page.keyboard.press('Shift+ArrowLeft');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');
  const formatter = page.locator('[role=toolbar][data-text-formatter]');
  await expect(formatter).toBeVisible();
  await formatter.getByRole('button', { name: /bold/i }).click();
  await expect(page.locator(`${INPUT} strong`)).toHaveText('strong');

  await page.locator(INPUT).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lastMessageOf(page, CAROL)).text).toBe('make this strong');
  const { entities } = await lastMessageOf(page, CAROL);
  expect(entities.map(({ type, offset, length }) => ({ type, offset, length }))).toEqual([
    { type: 'MessageEntityBold', offset: 10, length: 6 },
  ]);
});

// The app's CSP (`script-src 'self'`) would block an inline handler and hide that it ran: the paste tests switch it off,
// so `window.__pwned` proves that nothing executed, and the page's strict gate does not see tt's CSP console errors (the
// parser creates the hostile handler attributes in an inert document, where the CSP reports them without running them).
test.describe('paste', () => {
  test.use({ bypassCSP: true });

  async function paste(page: Page, data: Record<string, string>) {
    await page.locator(INPUT).click();
    await page.evaluate((payload) => {
      const transfer = new DataTransfer();
      Object.entries(payload).forEach(([type, value]) => transfer.setData(type, value));
      const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
      document.querySelector('#editable-message-text')!.dispatchEvent(event);
    }, data);
  }

  test('pasted HTML with a script, an onerror image and a javascript: link becomes safe text or entities only', async ({
    page,
  }) => {
    await openMessages(page);
    await openChat(page, 'Carol Short');

    await paste(page, {
      'text/html':
        '<p><b>safe bold</b> <a href="https://example.com/ok">good link</a> ' +
        '<a href="javascript:window.__pwned=3">evil link</a> ' +
        '<script>window.__pwned=1</script><img src="x" onerror="window.__pwned=2">' +
        '<svg onload="window.__pwned=4"></svg><iframe src="javascript:window.__pwned=5"></iframe>' +
        '<span onclick="window.__pwned=6" style="position:fixed">styled</span></p>',
      'text/plain': 'safe bold good link evil link styled',
    });
    await expect(page.locator(`${INPUT} strong`)).toHaveText('safe bold');

    // nothing live landed in the editor
    const dom = await page.locator(INPUT).evaluate((input) => ({
      forbidden: input.querySelectorAll('script, img, svg, iframe, object, embed, style').length,
      handlers: [...input.querySelectorAll('*')].flatMap((el) =>
        [...el.attributes].map((attribute) => attribute.name).filter((name) => name.startsWith('on')),
      ),
      unsafeLinks: [...input.querySelectorAll('a')]
        .map((a) => a.getAttribute('href') || '')
        .filter((href) => /^\s*(javascript|vbscript|data):/i.test(href)),
      links: [...input.querySelectorAll('a')].map((a) => a.getAttribute('href')),
      text: input.textContent,
      positioned: [...input.querySelectorAll<HTMLElement>('*')].filter((el) => el.style.position).length,
    }));
    expect(dom.forbidden).toBe(0);
    expect(dom.handlers).toEqual([]);
    expect(dom.unsafeLinks).toEqual([]);
    expect(dom.links).toEqual(['https://example.com/ok']);
    expect(dom.positioned).toBe(0);
    expect(dom.text).toContain('evil link');
    expect(dom.text).toContain('styled');
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();

    await page.keyboard.press('Enter');
    await expect.poll(async () => (await lastMessageOf(page, CAROL)).text).toContain('safe bold good link evil link');
    const { entities, text } = await lastMessageOf(page, CAROL);
    expect(entities.map(({ type }) => type).sort()).toEqual(['MessageEntityBold', 'MessageEntityTextUrl']);
    expect(entities.find(({ type }) => type === 'MessageEntityTextUrl')!.url).toBe('https://example.com/ok');
    expect(text).not.toMatch(/javascript:|<script|onerror/);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    // the sent bubble holds no live link to a script either
    const hrefs = await lastItem(page)
      .locator('a')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href') || ''));
    hrefs.forEach((href) => expect(href).not.toMatch(/^\s*(javascript|vbscript|data):/i));
  });

  test('pasted markdown text keeps links safe', async ({ page }) => {
    await openMessages(page);
    await openChat(page, 'Carol Short');

    await paste(page, {
      'text/plain':
        '**bold** [fine](https://example.com/a) [bad](javascript:window.__pwned=1) <img src=x onerror=window.__pwned=2>',
    });
    await expect(page.locator(`${INPUT} strong`)).toHaveText('bold');
    const links = await page.locator(`${INPUT} a`).evaluateAll((all) => all.map((a) => a.getAttribute('href')));
    expect(links).toEqual(['https://example.com/a']);
    expect(await page.locator(`${INPUT} img`).count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  });
});

test('the emoji picker inserts the emoji at the caret', async ({ page }) => {
  await openMessages(page);
  await openChat(page, 'Carol Short');

  await typeText(page, 'ab');
  await page.keyboard.press('ArrowLeft');
  await page.locator('.Composer .symbol-menu-button').click();
  const menu = page.locator('.SymbolMenu');
  await expect(menu).toBeVisible();
  const emoji = menu.locator('.EmojiButton').first();
  await expect(emoji).toBeVisible();
  const title = await emoji.getAttribute('title');
  expect(title).toMatch(/^:.+:$/);
  await emoji.dispatchEvent('mousedown');
  // the emoji is between "a" and "b"
  await expect(page.locator(`${INPUT} p`)).toHaveText(/^a\S+b$/u);
  const text = (await page.locator(`${INPUT} p`).textContent())!;
  expect(text.length).toBeGreaterThan(2);
  expect(text.startsWith('a')).toBe(true);
  expect(text.endsWith('b')).toBe(true);

  // sent with the emoji in place
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lastMessageOf(page, CAROL)).text).toBe(text);
});

test.describe('copy', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('copying several selected messages puts their text on the clipboard', async ({ page }) => {
    await openMessages(page);
    await openChat(page, 'Carol Short');

    // select the three messages of the chat as a user drags over them
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('#MiddleColumn .MessageList .message-list-item')];
      const range = document.createRange();
      range.setStartBefore(items[0].querySelector('.text-content')!);
      range.setEndAfter(items[items.length - 1].querySelector('.text-content')!);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.keyboard.press('ControlOrMeta+c');
    await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toContain('Carol three');
    // plain text: a sender header when the sender changes (our own messages have none), the messages separated by an empty line
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'Carol Short:\nCarol one\n\nCarol two\n\nCarol Short:\nCarol three',
    );
    // the html flavour holds the same three messages and nothing active
    const html = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      return item.types.includes('text/html') ? await (await item.getType('text/html')).text() : '';
    });
    expect(html).toContain('Carol one');
    expect(html).toContain('Carol three');
    expect(html).not.toMatch(/<script|onerror=|javascript:/i);
  });
});
