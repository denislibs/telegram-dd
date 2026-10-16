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

// The known noise of the mocked client: no full user info / folders / language pack (see tests/e2e/strictMonitor.ts)
const IGNORED_CONSOLE = [
  /GetFullUser|buildApiUserFullInfo|reading 'id'/,
  /action "loadFullUser" failed/,
  // frameact's timing hint, a frame of delay and nothing else: the tooltip controller (tt's code) updates the props of its
  // rendered container from a mutate task, and the measure effect of `useHorizontalScroll` reads them (engine gap 12 of
  // docs/reports/slice-composer.md); it appears when an inserted emoji makes the custom emoji tooltip open
  /measure effect .*CustomEmojiTooltip.* was dirtied during the mutate phase/,
];

test.use({ strictOptions: { ignoreConsole: IGNORED_CONSOLE } });

async function openMessages(page: Page) {
  await openApp(page, '/#?mockScenario=messages');
  await expect(page.locator(ROW)).toHaveCount(6);
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

/**
 * The text a user sees in an element: text nodes plus the `alt` of emoji images. tt (and the port) render emoji as
 * native text only on macOS / iOS (`IS_EMOJI_SUPPORTED`); elsewhere (the Linux CI runner) an emoji is an `<img alt>`.
 */
function visibleText(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((root) => {
      let text = '';
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
        else if ((node as Element).tagName === 'IMG') text += (node as HTMLImageElement).alt;
      }
      return text;
    });
}

/** Both emoji renderings: native text (macOS) and `<img alt>` (any other platform), whatever the host OS is. */
const EMOJI_PLATFORMS = [
  { name: 'native emoji (macOS)', platform: 'MacIntel' },
  { name: 'emoji images (Linux)', platform: 'Linux x86_64' },
] as const;

function usePlatform(platform: string) {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((value) => {
      Object.defineProperty(Navigator.prototype, 'platform', { get: () => value, configurable: true });
    }, platform);
  });
}

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
  // Carol is not on top: the group is
  await expect(page.locator(ROW).first()).toContainText('Team Chat');
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

// The same kind of paste with the app's CSP ON (no `bypassCSP`): nothing is fetched, nothing runs, the editor holds only
// safe markup. A fetch of a same-origin URL is allowed by the CSP (`img-src 'self'`), so the pixel routes below prove
// that the pasted markup never reached a live document.
test.describe('paste with the CSP on', () => {
  test.use({
    strictOptions: {
      ignoreConsole: IGNORED_CONSOLE,
      // Chromium checks `script-src-attr` when the HTML parser SETS an `on*` attribute, also in an inert `<template>`
      // where no handler is ever compiled (docs/reports/slice-composer.md, "Security"). `normalizeHtml` parses the pasted
      // markup into such a template and then strips the handlers, so the second parse (ProseMirror's `readHTML`) reports
      // nothing; this report of the first parse cannot be avoided by any DOM parsing API. Only this message, and only
      // from that module, is allowed: a report from anywhere else still fails the test.
      ignoreConsoleAt: [
        {
          text: /^Executing inline event handler violates the following Content Security Policy directive 'script-src /,
          location: /\/src\/util\/tiptap\/botApiHtml\.ts(\?[^:]*)?:\d+$/,
        },
      ],
    },
  });

  async function paste(page: Page, data: Record<string, string>) {
    await page.locator(INPUT).click();
    await page.evaluate((payload) => {
      const transfer = new DataTransfer();
      Object.entries(payload).forEach(([type, value]) => transfer.setData(type, value));
      const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
      document.querySelector('#editable-message-text')!.dispatchEvent(event);
    }, data);
  }

  test('hostile pasted HTML fetches nothing, runs nothing and leaves only safe markup', async ({ page }) => {
    const fetched: string[] = [];
    await page.route(/csp-pixel|evil\.example/, (route) => {
      fetched.push(route.request().url());
      return route.fulfill({ status: 204 });
    });
    page.on('request', (request) => {
      if (/csp-pixel|evil\.example/.test(request.url())) fetched.push(request.url());
    });

    await openMessages(page);
    await openChat(page, 'Carol Short');
    const violations = await page.evaluate(() => {
      const list: string[] = [];
      document.addEventListener('securitypolicyviolation', (event) => list.push(event.violatedDirective));
      (window as unknown as { __cspViolations: string[] }).__cspViolations = list;
      return list.length;
    });
    expect(violations).toBe(0);

    await paste(page, {
      'text/html':
        '<p><b>safe bold</b> <a href="https://example.com/ok">good link</a> ' +
        '<a href="javascript:window.__pwned=3">evil link</a> ' +
        '<script>window.__pwned=1</script><img src="/csp-pixel.gif?img" onerror="window.__pwned=2">' +
        '<svg onload="window.__pwned=4"><image href="/csp-pixel.gif?svg"></image></svg>' +
        '<iframe src="/csp-pixel.html?iframe"></iframe><object data="/csp-pixel.gif?object">obj</object>' +
        '<style>@import url("/csp-pixel.css?import"); p { background: url("/csp-pixel.gif?css"); }</style>' +
        '<link rel="stylesheet" href="/csp-pixel.css?link"><video poster="/csp-pixel.gif?poster"></video>' +
        '<input type="image" src="/csp-pixel.gif?input"><details open ontoggle="window.__pwned=7"><summary>sum</summary>' +
        'details body</details><form action="https://evil.example/form"><button formaction="javascript:window.__pwned=8">' +
        'btn</button></form><span onclick="window.__pwned=6" style="position:fixed;background:url(/csp-pixel.gif?bg)">' +
        'styled</span></p>',
      'text/plain': 'safe bold good link evil link styled',
    });
    await expect(page.locator(`${INPUT} strong`)).toHaveText('safe bold');
    await page.waitForTimeout(500);

    const dom = await page.locator(INPUT).evaluate((input) => ({
      forbidden: input.querySelectorAll(
        'script, img:not(.ProseMirror-separator), svg, iframe, object, embed, style, ' + 'link, video, input, form',
      ).length,
      handlers: [...input.querySelectorAll('*')].flatMap((el) =>
        [...el.attributes].map((attribute) => attribute.name).filter((name) => name.startsWith('on')),
      ),
      links: [...input.querySelectorAll('a')].map((a) => a.getAttribute('href')),
      styled: [...input.querySelectorAll<HTMLElement>('[style]')].map((el) => el.getAttribute('style')),
      text: input.textContent,
    }));
    expect(dom.forbidden).toBe(0);
    expect(dom.handlers).toEqual([]);
    expect(dom.links).toEqual(['https://example.com/ok']);
    dom.styled.forEach((style) => expect(style).not.toMatch(/url\(|position/));
    expect(dom.text).toContain('evil link');
    expect(dom.text).toContain('styled');
    expect(fetched).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    const reported = await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
    // Only the parse of the pasted markup into the inert template reports its handler attributes: the CSP is on
    expect(reported.every((directive) => directive === 'script-src-attr')).toBe(true);
  });
});

for (const { name, platform } of EMOJI_PLATFORMS) {
  test.describe(name, () => {
    usePlatform(platform);

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
      await expect.poll(() => visibleText(page, `${INPUT} p`)).toMatch(/^a\S+b$/u);
      const text = await visibleText(page, `${INPUT} p`);

      // sent with the emoji in place
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await lastMessageOf(page, CAROL)).text).toBe(text);
    });
  });
}

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

// Fidelity review H4: the link input of the formatter sits in an `inert` container until the link control opens; it must
// receive focus, so that the typed URL goes into it and not over the selected text.
test('the formatter link button: the URL goes into the link input and links the selected word', async ({ page }) => {
  await openMessages(page);
  await openChat(page, 'Carol Short');

  await typeText(page, 'make this link');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
  const formatter = page.locator('[role=toolbar][data-text-formatter]');
  await expect(formatter).toBeVisible();
  await formatter.getByRole('button', { name: 'Add Link' }).click();

  const linkInput = formatter.locator('input[inputmode="url"]');
  await expect(linkInput).toBeFocused();
  await page.keyboard.type('example.com');
  await expect(linkInput).toHaveValue('example.com');
  await expect(page.locator(INPUT)).toContainText('make this link');
  await page.keyboard.press('Enter');
  await expect(page.locator(`${INPUT} a`)).toHaveText('link');

  await page.locator(INPUT).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lastMessageOf(page, CAROL)).text).toBe('make this link');
  const { entities } = await lastMessageOf(page, CAROL);
  expect(entities).toEqual([{ type: 'MessageEntityTextUrl', offset: 10, length: 4, url: 'https://example.com' }]);
});

test('Mod+K opens the link input with focus, Escape closes it and keeps the text', async ({ page }) => {
  await openMessages(page);
  await openChat(page, 'Carol Short');

  await typeText(page, 'make this link');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
  // the formatter (and its range) appears once the selection settled
  await expect(page.locator('[role=toolbar][data-text-formatter]')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  const linkInput = page.locator('[data-text-formatter] input[inputmode="url"]');
  await expect(linkInput).toBeFocused();
  await page.keyboard.type('xyz');
  await expect(linkInput).toHaveValue('xyz');
  // Escape closes the formatter (the link input is gone or no longer focused), nothing is linked
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-text-formatter] input[inputmode="url"]:focus')).toHaveCount(0);
  await expect(page.locator(INPUT)).toHaveText('make this link');
  await expect(page.locator(`${INPUT} a`)).toHaveCount(0);
});

// Editor review M1: the store merges a new reply into the draft's record in place, so the record keeps its identity; a
// second reply must still focus the input (tt keyed the focus effect on the reply object).
test('a second reply started while the input is blurred focuses the input again', async ({ page }) => {
  await openMessages(page);
  await openChat(page, 'Carol Short');

  await page.locator(INPUT).click();
  await page.keyboard.press('Control+ArrowUp');
  const bar = page.locator('.Composer .ComposerEmbeddedMessage');
  await expect(bar).toContainText('Carol three');
  await expect(page.locator(INPUT)).toBeFocused();

  // blur the input, then reply to another message (what a double click or "Reply" in the context menu does)
  await page.locator(LIST).click({ position: { x: 10, y: 10 } });
  await expect(page.locator(INPUT)).not.toBeFocused();
  await page.evaluate(() => {
    (window as unknown as TestWindow).getActions().updateDraftReplyInfo({ replyToMsgId: 2001 });
  });
  await expect(bar).toContainText('Carol one');
  await expect(page.locator(INPUT)).toBeFocused();
  await page.keyboard.type('typed');
  await expect(page.locator(INPUT)).toHaveText('typed');
});

// The fidelity review's missing scenarios: autocomplete, IME, undo / redo, the editing draft across a chat switch.
const TEAM_CHAT = '-1000000000009';

/** The text of each mention node of the editor's document. */
function mentionTexts(page: Page) {
  return page.evaluate((selector) => {
    type DocNode = { type: { name: string }; textContent: string };
    const dom = document.querySelector(`${selector}.ProseMirror, ${selector} .ProseMirror`) as
      (Element & { editor?: { state: { doc: { descendants: (fn: (node: DocNode) => void) => void } } } }) | null;
    const texts: string[] = [];
    dom?.editor?.state.doc.descendants((node) => {
      if (node.type.name === 'mention') texts.push(node.textContent);
    });
    return texts;
  }, INPUT);
}

test.describe('autocomplete', () => {
  test.use({
    strictOptions: {
      ignoreConsole: [
        ...IGNORED_CONSOLE,
        // the mocked client has no update state for the group (as in messages.spec.ts)
        /\[UpdateManager\] Channel for difference not found/,
        // frameact's timing hint (engine gap 12 / editor review L1): the tooltip controller writes the props of its
        // container from a mutate task, and a selected item is inserted from one (`addRecentEmoji` writes the store there)
        /measure effect .*(EmojiTooltip|MentionTooltip|MessageInput|ConfirmDialog).* was dirtied during the mutate phase/,
      ],
    },
  });

  test('the @ mention tooltip: arrows move the selection, Tab inserts the mention, Escape closes it', async ({
    page,
  }) => {
    await openMessages(page);
    await openChat(page, 'Team Chat');
    // The mocked client has no participants list: the members come as the chat's full info
    await page.evaluate((chatId) => {
      (window as unknown as TestWindow).getActions().apiUpdate({
        '@type': 'updateChatFullInfo',
        id: chatId,
        fullInfo: { members: ['5', '6', '7', '8'].map((userId) => ({ userId })) },
      });
    }, TEAM_CHAT);

    await typeText(page, 'hi @');
    const tooltip = page.locator('.composer-tooltip');
    await expect(tooltip.locator('.ListItem')).toHaveCount(4);
    await expect(tooltip.locator('.ListItem').nth(0)).toHaveClass(/\bfocus\b/);
    await page.keyboard.press('ArrowDown');
    await expect(tooltip.locator('.ListItem').nth(1)).toHaveClass(/\bfocus\b/);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await expect(tooltip.locator('.ListItem').nth(1)).toHaveClass(/\bfocus\b/);
    const selectedName = (await tooltip.locator('.ListItem').nth(1).locator('.fullName').innerText()).split(' ')[0];
    await page.keyboard.press('Tab');
    // a mention node (an avatar and the name as its content); the query is gone
    await expect.poll(() => mentionTexts(page)).toEqual([selectedName]);
    await expect(page.locator(`${INPUT} p`)).not.toContainText('@');

    // a query narrows the list; Escape closes the tooltip and keeps the text
    await page.keyboard.type('@Car');
    await expect(tooltip.locator('.ListItem')).toHaveCount(1);
    await expect(tooltip.locator('.ListItem')).toContainText('Carol');
    await page.keyboard.press('Escape');
    await expect(tooltip.locator('xpath=..')).not.toHaveClass(/open/);
    await expect(page.locator(INPUT)).toContainText('@Car');

    // Enter on a reopened list inserts the mention too (and does not send)
    const before = await page.locator(ITEM).count();
    await page.keyboard.type('o');
    await expect(tooltip.locator('xpath=..')).toHaveClass(/open/);
    await page.keyboard.press('Enter');
    await expect.poll(() => mentionTexts(page)).toEqual([selectedName, 'Carol']);
    await expect(page.locator(`${INPUT} p`)).not.toContainText('@Caro');
    await expect(page.locator(ITEM)).toHaveCount(before);
  });

  for (const { name, platform } of EMOJI_PLATFORMS) {
    test.describe(name, () => {
      usePlatform(platform);

      test('the : emoji tooltip: an arrow selects an emoji, Enter inserts it in place of the query', async ({
        page,
      }) => {
        await openMessages(page);
        await openChat(page, 'Carol Short');

        await typeText(page, 'so :smile');
        const tooltip = page.locator('.composer-tooltip');
        await expect(tooltip.locator('xpath=..')).toHaveClass(/open/);
        const first = tooltip.locator('.EmojiButton').first();
        await expect(first).toBeVisible();
        const emoji = await visibleText(page, '.composer-tooltip .EmojiButton');
        expect(emoji).not.toBe('');
        // the emoji list is horizontal and nothing is selected until an arrow key
        await page.keyboard.press('ArrowRight');
        await expect(first).toHaveClass(/\bfocus\b/);
        await page.keyboard.press('Enter');
        await expect.poll(() => visibleText(page, `${INPUT} p`)).not.toContain(':smile');
        await expect.poll(() => visibleText(page, `${INPUT} p`)).toBe(`so ${emoji}`);
      });
    });
  }
});

test('IME: Enter during a composition does not send, Enter after it does', async ({ page }) => {
  await openMessages(page);
  await openChat(page, 'Carol Short');
  const before = await page.locator(ITEM).count();

  await typeText(page, 'konnichiwa');
  await page.evaluate((selector) => {
    const input = document.querySelector(selector)!;
    const target = input.querySelector('p') || input;
    target.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, isComposing: true }),
    );
  }, INPUT);
  await page.waitForTimeout(500);
  await expect(page.locator(ITEM)).toHaveCount(before);
  await expect(page.locator(INPUT)).toContainText('konnichiwa');

  await page.evaluate((selector) => {
    const input = document.querySelector(selector)!;
    const target = input.querySelector('p') || input;
    target.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
  }, INPUT);
  await page.waitForTimeout(100);
  await page.keyboard.press('Enter');
  await expect(page.locator(ITEM)).toHaveCount(before + 1);
  await expect.poll(async () => (await lastMessageOf(page, CAROL)).text).toBe('konnichiwa');
});

test('undo and redo by keyboard; the history buttons stay hidden outside the expanded input', async ({ page }) => {
  await openMessages(page);
  await openChat(page, 'Carol Short');

  const history = page.locator('.Composer .rich-editor-history');
  await expect(history).not.toHaveClass(/rich-editor-history-open/);
  await expect(history).toHaveAttribute('inert', '');
  await expect(history).toHaveAttribute('aria-hidden', /^(true|)$/);

  await typeText(page, 'undo me');
  // canUndo is tracked even while the buttons are hidden
  await expect(history.getByRole('button', { name: 'Undo', includeHidden: true })).toBeEnabled();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator(`${INPUT} p`)).toHaveText('');
  await expect(history.getByRole('button', { name: 'Redo', includeHidden: true })).toBeEnabled();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.locator(INPUT)).toHaveText('undo me');
  await expect(history).not.toHaveClass(/rich-editor-history-open/);
});

test('an edit survives a chat switch: the editing bar and the edited text come back', async ({ page }) => {
  await openMessages(page);
  await openChat(page, 'Carol Short');

  await page.locator(INPUT).click();
  await page.keyboard.press('ArrowUp');
  const bar = page.locator('.Composer .ComposerEmbeddedMessage');
  await expect(bar).toContainText(/Edit\s?Message/i);
  await expect(page.locator(INPUT)).toContainText('Carol two');
  await page.keyboard.press('End');
  await page.keyboard.type(' changed');
  await page.waitForTimeout(300);

  await openChat(page, 'Bob Reader');
  await expect(page.locator('.Composer .ComposerEmbeddedMessage')).toHaveCount(0);
  await expect(page.locator(`${INPUT} p`)).toHaveText('');

  await openChat(page, 'Carol Short');
  await expect(bar).toContainText(/Edit\s?Message/i);
  await expect(page.locator(INPUT)).toHaveText('Carol two changed');
  // the message itself is unchanged until the edit is saved
  expect(
    await page.evaluate(() => {
      const global = (window as unknown as TestWindow).getGlobal();
      return global.messages.byChatId['7'].byId['2002'].content.text.text as string;
    }),
  ).toBe('Carol two');
});
