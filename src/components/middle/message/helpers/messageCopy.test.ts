// Original test (not in telegram-tt): the clipboard content built for copied messages is inert for hostile message text.
import '../../../../global/actions/all';

import { marked, type Token, type Tokens } from 'marked';
import { describe, expect, it } from 'vitest';
import { getGlobal, setGlobal } from '../../../../global';

import type { ApiChat, ApiMessage, ApiMessageEntity, ApiUser } from '../../../../api/types';
import type { GlobalState, TabState } from '../../../../global/types';
import { ApiMessageEntityTypes, MAIN_THREAD_ID } from '../../../../api/types';

import { getMessageSummaryText } from '../../../../global/helpers/messageSummary';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../../global/initialState';
import { addChats } from '../../../../global/reducers/chats';
import { addMessages } from '../../../../global/reducers/messages';
import { addUsers } from '../../../../global/reducers/users';
import { getCurrentTabId } from '../../../../util/establishMultitabRole';
import { cloneDeep } from '../../../../util/iteratees';
import { getTranslationFn } from '../../../../util/localization';
import { buildMessageCopyContent } from './messageCopy';

// jsdom has no `innerText`: assigning it only sets a plain property, so tt's `escape_html` filter (`renderText`, which
// reads `innerHTML` after setting `innerText`) returned '' and the sender-header path rendered every text message as
// `MessageUnsupported`. A minimal version of the browser's setter (text, line breaks as `<br>`) for this file.
if (!('innerText' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent;
    },
    set(this: HTMLElement, value: string) {
      this.replaceChildren(
        ...String(value)
          .split('\n')
          .flatMap((line, index) => (index ? [document.createElement('br'), line] : [line])),
      );
    },
  });
}

const tabId = getCurrentTabId();
const SELF_ID = '1000';
const PEER_ID = '2000';

const user = (id: string, firstName: string) =>
  ({ id, firstName, type: 'userTypeRegular', isMin: false, phoneNumber: '' }) as unknown as ApiUser;
const privateChat = (id: string) => ({ id, title: `Chat ${id}`, type: 'chatTypePrivate', unreadCount: 0 }) as ApiChat;

const messageList = { chatId: PEER_ID, threadId: MAIN_THREAD_ID, type: 'thread' as const };

function seed(messages: ApiMessage[]) {
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
  let global: GlobalState = { ...cloneDeep(INITIAL_GLOBAL_STATE), currentUserId: SELF_ID, byTabId: { [tabId]: tab } };
  global = addUsers(global, { [SELF_ID]: user(SELF_ID, 'Me'), [PEER_ID]: user(PEER_ID, 'Ann') });
  global = addChats(global, { [PEER_ID]: privateChat(PEER_ID) });
  global = addMessages(global, messages);
  setGlobal(global, { forceOutdated: true });
}

const textMessage = (id: number, text: string, entities?: ApiMessageEntity[]) =>
  ({
    id,
    chatId: PEER_ID,
    date: 1_700_000_000 + id,
    isOutgoing: false,
    senderId: PEER_ID,
    content: { text: { text, entities } },
  }) as ApiMessage;

const SCRIPT_URLS = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  '  javascript:alert(1)',
  '\tjavascript:alert(1)',
  'java\tscript:alert(1)',
  'javascript://example.com/%0Aalert(1)',
  'vbscript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
  'file:///etc/passwd',
];

const HOSTILE_TEXT = '<img src=x onerror=alert(1)> </script><script>alert(2)</script> javascript:alert(3) link';

function expectInert(content: { plainText: string; html: string; markdown: string }) {
  // The produced HTML is parsed once more, as a paste target would do: no element may be live
  const doc = new DOMParser().parseFromString(content.html, 'text/html');
  expect(doc.querySelector('script, img, iframe, object, embed, style')).toBeNull();
  doc.body.querySelectorAll('*').forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      expect(attribute.name.startsWith('on')).toBe(false);
      if (['href', 'src', 'xlink:href'].includes(attribute.name)) {
        expect(attribute.value.trim().toLowerCase().startsWith('javascript:')).toBe(false);
      }
    });
  });
  expect(content.html).not.toMatch(/<(script|img|iframe)/i);
  expect(content.html).not.toMatch(/href="\s*javascript:/i);
  // Markdown has no live link target either
  expect(content.markdown).not.toMatch(/\]\(\s*javascript:/i);
}

describe('buildMessageCopyContent with hostile message text', () => {
  it('keeps markup in the message text as text', async () => {
    seed([textMessage(1, HOSTILE_TEXT)]);

    const content = await buildMessageCopyContent(
      messageList,
      { type: 'messages', chatId: PEER_ID, threadId: MAIN_THREAD_ID, messageListType: 'thread', messageIds: [1] },
      tabId,
    );

    expect(content.plainText).toBe(HOSTILE_TEXT);
    expect(content.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expectInert(content);
  });

  it.each(SCRIPT_URLS)('does not make a live link of the text link address %j', async (url) => {
    const text = 'open this </script> now';
    seed([
      textMessage(1, text, [{ type: ApiMessageEntityTypes.TextUrl, offset: 5, length: 4, url }]),
      textMessage(2, url, [{ type: ApiMessageEntityTypes.Url, offset: 0, length: url.length }]),
    ]);

    const content = await buildMessageCopyContent(
      messageList,
      { type: 'messages', chatId: PEER_ID, threadId: MAIN_THREAD_ID, messageListType: 'thread', messageIds: [1, 2] },
      tabId,
    );

    expectInert(content);
    expect(content.plainText).toContain('open this </script> now');
    // the link text stays, only the address goes
    expect(content.html).toContain('this');
    expect(content.markdown).toContain('this');
  });

  it('keeps the addresses of allowed schemes', async () => {
    const urls = ['https://example.com/a?b=c', 'http://example.com', 'tg://resolve?domain=x', 'mailto:a@example.com'];
    seed(
      urls.map((url, index) =>
        textMessage(index + 1, 'link', [{ type: ApiMessageEntityTypes.TextUrl, offset: 0, length: 4, url }]),
      ),
    );

    const content = await buildMessageCopyContent(
      messageList,
      {
        type: 'messages',
        chatId: PEER_ID,
        threadId: MAIN_THREAD_ID,
        messageListType: 'thread',
        messageIds: [1, 2, 3, 4],
      },
      tabId,
    );

    const hrefs = [...new DOMParser().parseFromString(content.html, 'text/html').querySelectorAll('a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toEqual(urls);
    urls.forEach((url) => expect(content.markdown).toContain(`](${url})`));
  });

  it.each([
    'https://ok.example/a) [evil](https://evil.example/md',
    'https://ok.example/a)<img src=x onerror=alert(1)>',
    'https://ok.example/a b "title"',
    'https://ok.example/a\\',
    'mailto:a b<img src=x>(c)',
    'tg://resolve?domain=x)<b>y</b>',
  ])('keeps the markdown link address %j inside its link', async (url) => {
    seed([textMessage(1, 'link here', [{ type: ApiMessageEntityTypes.TextUrl, offset: 0, length: 4, url }])]);

    const content = await buildMessageCopyContent(
      messageList,
      { type: 'messages', chatId: PEER_ID, threadId: MAIN_THREAD_ID, messageListType: 'thread', messageIds: [1] },
      tabId,
    );

    // A markdown reader sees exactly one link, over the link text, and no raw HTML
    const tokens: Token[] = [];
    marked.walkTokens(marked.lexer(content.markdown), (token) => {
      tokens.push(token);
    });
    const links = tokens.filter((token) => token.type === 'link');
    expect(links).toHaveLength(1);
    expect((links[0] as Tokens.Link).text).toBe('link');
    expect(tokens.filter((token) => token.type === 'html')).toEqual([]);
    expect(content.markdown).not.toMatch(/<(img|b)\b/i);
    expect(content.markdown).toMatch(/^\[link\]\([^()\s<>"]+\) here$/);
    // The HTML flavour keeps the address as the sender wrote it (the attribute is escaped by the serialiser)
    const anchor = new DOMParser().parseFromString(content.html, 'text/html').querySelector('a');
    expect(anchor?.getAttribute('href')).toBe(url);
  });

  it('is inert on the sender-header path, which renders the message to an HTML summary first', async () => {
    seed([textMessage(1, HOSTILE_TEXT)]);

    const content = await buildMessageCopyContent(
      messageList,
      {
        type: 'messages',
        chatId: PEER_ID,
        threadId: MAIN_THREAD_ID,
        messageListType: 'thread',
        messageIds: [1],
        withSenderHeaders: true,
      },
      tabId,
    );

    expect(content.plainText).toBe(`Ann:\n${HOSTILE_TEXT}`);
    expect(content.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(content.markdown).toContain('**Ann:**');
    expect(content.markdown).toContain('onerror=alert(1)');
    expectInert(content);
  });

  it('copies the text of plain messages on the sender-header path', async () => {
    seed([textMessage(1, 'hello world'), textMessage(2, 'second one')]);

    const content = await buildMessageCopyContent(
      messageList,
      {
        type: 'messages',
        chatId: PEER_ID,
        threadId: MAIN_THREAD_ID,
        messageListType: 'thread',
        messageIds: [1, 2],
        withSenderHeaders: true,
      },
      tabId,
    );

    expect(content.plainText).toBe('Ann:\nhello world\n\nAnn:\nsecond one');
    expect(content.html).toContain('<p>hello world</p>');
    expect(content.html).toContain('<p>second one</p>');
    expect(content.markdown).toContain('hello world');
    expect(content.markdown).toContain('second one');
    for (const text of [content.plainText, content.html, content.markdown]) {
      expect(text).not.toContain('MessageUnsupported');
    }
  });

  it('is inert for the HTML of a selection', async () => {
    seed([textMessage(1, 'x')]);

    const content = await buildMessageCopyContent(
      messageList,
      {
        type: 'selection',
        chatId: PEER_ID,
        threadId: MAIN_THREAD_ID,
        messageListType: 'thread',
        messageId: 1,
        html:
          '<p>safe <img src=x onerror=alert(1)><script>alert(2)</script>' +
          '<a href="javascript:alert(3)" onclick="alert(4)">link</a> ' +
          '<svg onload=alert(5)></svg><iframe src="javascript:alert(6)"></iframe></p>',
      },
      tabId,
    );

    expect(content.plainText).toContain('safe');
    expectInert(content);
  });

  // From the messages slice (a `Range` over rendered messages carries the text a concealed spoiler hides)
  it('never carries the text of a concealed spoiler of a selection, and keeps a revealed one', async () => {
    seed([textMessage(1, 'x')]);

    const content = await buildMessageCopyContent(
      messageList,
      {
        type: 'selection',
        chatId: PEER_ID,
        threadId: MAIN_THREAD_ID,
        messageListType: 'thread',
        messageId: 1,
        html:
          'a <span class="Spoiler Spoiler--concealed"><span class="Spoiler__content">SECRET code</span></span> b ' +
          '<span class="Spoiler"><span class="Spoiler__content">revealed</span></span>',
      },
      tabId,
    );

    for (const text of [content.plainText, content.html, content.markdown]) {
      expect(text).not.toContain('SECRET');
      expect(text).not.toContain('code');
    }
    expect(content.plainText).toContain('revealed');
    expect(content.plainText.replace(/[\s\w]/g, '')).toMatch(/^[⠀-⣿]+$/);
  });
});

// Server strings that are not message text (file names, titles, a poll question, ...) are concatenated into the HTML
// summary of the sender-header path: they must reach the clipboard as text, never as markup.
describe('buildMessageCopyContent with hostile server strings on the sender-header path', () => {
  const INJECTED =
    'x<a href="https://evil.example/inj">CLICK</a><tg-spoiler>sp</tg-spoiler>' +
    '<a href="tg://user?id=777">M</a><tg-emoji emoji-id="123">E</tg-emoji>';

  const mediaMessage = (id: number, content: object) =>
    ({
      id,
      chatId: PEER_ID,
      date: 1_700_000_000 + id,
      isOutgoing: false,
      senderId: PEER_ID,
      content: content as ApiMessage['content'],
    }) as ApiMessage;

  const CASES: { name: string; content: object; expected: string }[] = [
    {
      name: 'document file name',
      content: { document: { id: 'd1', fileName: INJECTED, mimeType: 'application/pdf', size: 1 } },
      expected: `📎 ${INJECTED}`,
    },
    {
      name: 'document file name with a caption',
      content: {
        document: { id: 'd1', fileName: INJECTED, mimeType: 'application/pdf', size: 1 },
        text: { text: 'caption' },
      },
      // tt: the line break of the HTML summary collapses to a space in the parsed paragraph
      expected: `📎 ${INJECTED} caption`,
    },
    {
      name: 'audio title and performer',
      content: {
        audio: { id: 'a1', title: INJECTED, performer: `${INJECTED}2`, duration: 1, mimeType: 'audio/mp3', size: 1 },
      },
      expected: `🎧 ${INJECTED} — ${INJECTED}2`,
    },
    {
      name: 'invoice title',
      content: { invoice: { title: INJECTED, description: INJECTED, extendedMedia: [{}], currency: 'USD' } },
      expected: INJECTED,
    },
    {
      name: 'game title',
      content: { game: { id: 'g1', title: INJECTED, shortName: 's', description: '', accessHash: '1' } },
      expected: `🎮 ${INJECTED}`,
    },
    {
      name: 'poll question',
      content: { pollId: 'p1' },
      expected: `📊 ${INJECTED}`,
    },
    {
      name: 'todo title',
      content: { todo: { todo: { title: { text: INJECTED }, items: [{ id: 1, title: { text: INJECTED } }] } } },
      expected: `📝 ${INJECTED}`,
    },
    {
      name: 'dice emoticon',
      content: { dice: { emoticon: INJECTED, value: 1 } },
      expected: INJECTED,
    },
  ];

  it.each(CASES)('keeps the $name as text', async ({ content, expected }) => {
    seed([mediaMessage(1, content), textMessage(2, 'second')]);
    setGlobal(
      {
        ...getGlobal(),
        messages: {
          ...getGlobal().messages,
          pollById: {
            p1: {
              mediaType: 'poll',
              summary: { id: 'p1', hash: '1', question: { text: INJECTED }, answers: [] },
              results: {},
            },
          },
        },
      },
      { forceOutdated: true },
    );

    const result = await buildMessageCopyContent(
      messageList,
      {
        type: 'messages',
        chatId: PEER_ID,
        threadId: MAIN_THREAD_ID,
        messageListType: 'thread',
        messageIds: [1, 2],
        withSenderHeaders: true,
      },
      tabId,
    );

    // The visible text is the server string itself
    expect(result.plainText).toBe(`Ann:\n${expected}\n\nAnn:\nsecond`);
    expect(result.html).not.toMatch(/<a[\s>]/i);
    expect(result.html).not.toMatch(/<tg-spoiler|<tg-emoji/i);
    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    expect(doc.querySelector('a, tg-spoiler, tg-emoji, [data-entity-type]')).toBeNull();
    expect(doc.body.textContent).toContain(INJECTED);
    expect(result.markdown).not.toContain('](');
    expect(result.markdown).not.toContain('||sp||');
    expectInert(result);
  });

  it('leaves the plain summary (chat list, reply bar) as tt renders it: no escaping', () => {
    const message = mediaMessage(1, {
      document: { id: 'd1', fileName: INJECTED, mimeType: 'application/pdf', size: 1 },
    });
    expect(getMessageSummaryText(getTranslationFn(), message, undefined)).toBe(`📎 ${INJECTED}`);
    const game = mediaMessage(2, {
      game: { id: 'g1', title: INJECTED, shortName: 's', description: '', accessHash: '1' },
    });
    expect(getMessageSummaryText(getTranslationFn(), game, undefined)).toBe(`🎮 ${INJECTED}`);
  });
});
