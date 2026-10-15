// Original test (not in telegram-tt): the rich-text renderer on the frameact DOM runtime (jsdom).
// The first block is the chat-list requirement (the chat list is always on screen: a Spoiler range, e.g. the login code of
// the 777000 chat, must stay concealed in previews and summaries). The rest is the DOM shape of every entity type and
// the behaviour on untrusted entities (URLs, offsets, counts).
import { createRoot, flushSync } from 'frameact';
import { addEvent, delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { addActionHandler, setGlobal } from '../../../global';

import type { ApiMessageEntity } from '../../../api/types';
import { ApiMessageEntityTypes as T } from '../../../api/types';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE } from '../../../global/initialState';
import { ensureProtocol } from '../../../util/browser/url';
import { concealSpoilers, insertTextEntity, organizeEntities, renderTextWithEntities } from './renderTextWithEntities';

// The custom emoji component loads stickers through the API; the renderer's part is the props it passes
const customEmojiProps = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('../CustomEmoji', () => ({
  default: (props: Record<string, unknown>) => {
    customEmojiProps.push({
      documentId: props.documentId,
      size: props.size,
      isSelectable: props.isSelectable,
      withSharedAnimation: props.withSharedAnimation,
      forceAlways: props.forceAlways,
      noPlay: props.noPlay,
      withTranslucentThumb: props.withTranslucentThumb,
      sharedCanvasRef: props.sharedCanvasRef,
    });
    const el = document.createElement('div');
    el.className = 'custom-emoji';
    el.setAttribute('data-document-id', String(props.documentId));
    return el;
  },
}));

// The actions the entities call: the handlers of tt (global/actions) are not loaded, the payload is what is checked
const actionCalls = vi.hoisted(() => [] as [string, unknown][]);
vi.mock('../../../util/clipboard', () => ({
  copyTextToClipboard: (text: string) => {
    actionCalls.push(['copy', text]);
  },
}));

const BRAILLE = /^[⠀-⣿]+$/;
const BRAILLE_CHARS = /[⠀-⣿]/g;
// A frame (`harness.frame`) is needed for the measure/mutate effects of the components
const harness = useDomHarness();
const violations: string[] = [];
const disposers: (() => void)[] = [];

type Options = Parameters<typeof renderTextWithEntities>[0];

const entity = (type: T, text: string, whole: string, extra: Record<string, unknown> = {}): ApiMessageEntity =>
  ({ type, offset: whole.indexOf(text), length: text.length, ...extra }) as ApiMessageEntity;
const bold = (offset: number, length: number) => ({ type: T.Bold, offset, length }) as ApiMessageEntity;
const spoiler = (offset: number, length: number) => ({ type: T.Spoiler, offset, length }) as ApiMessageEntity;

// The call of a component (it has an owner); the result is checked, so the owner may go at once
function run(options: Options) {
  return createRoot((dispose) => {
    const result = renderTextWithEntities(options);
    dispose();
    return result;
  });
}

async function mount(options: Options) {
  const el = suppressStrict(container);
  disposers.push(render(() => renderTextWithEntities(options), el));
  await harness.frame();
  await harness.frame();
  return el;
}

function allElements(el: Element) {
  return [el, ...Array.from(el.querySelectorAll('*'))];
}

// What a browser would navigate to for `href` on an https page. An address that does not parse (`https://javascript:alert(1)`:
// "alert(1)" is not a port) cannot be navigated to at all: it counts as its scheme when it is written as `http(s)://`.
function resolveScheme(href: string) {
  try {
    return new URL(href, 'https://example.test/').protocol;
  } catch {
    return /^https?:\/\//i.test(href) ? 'https:' : 'invalid:';
  }
}

// The text of an element as the user reads it: the indentation spaces that tt turns into non-breaking ones are spaces
const readable = (el: Node) => el.textContent!.replace(/\u00A0/g, ' ');

beforeAll(() => {
  for (const name of [
    'sendBotCommand',
    'searchHashtag',
    'openChatByUsername',
    'openMediaFromTimestamp',
    'showNotification',
    'openUrl',
  ] as const) {
    addActionHandler(name, (global, actions, payload) => {
      actionCalls.push([name, payload]);
    });
  }
  setGlobal(structuredClone(INITIAL_GLOBAL_STATE));
  // jsdom has no `innerText`; `renderText`'s `escape_html` (the HTML string path) uses it as a text setter/getter
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent;
    },
    set(this: HTMLElement, value: string) {
      this.textContent = value;
    },
  });
});

afterAll(() => {
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).innerText;
});

beforeEach(() => {
  violations.length = 0;
  customEmojiProps.length = 0;
  actionCalls.length = 0;
  delegateEvents(['click', 'contextmenu', 'mousedown', 'mouseup', 'input']);
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}]`));
});

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  setHandler();
  disableStrict();
  expect(violations).toEqual([]);
});

describe('previews conceal spoilers (the chat list is always on screen)', () => {
  it('returns the text as it is without entities or without a Spoiler', () => {
    expect(renderTextWithEntities({ text: 'hello' })).toEqual(['hello']);
    expect(renderTextWithEntities({ text: 'hello', asPreview: true, entities: [] })).toEqual(['hello']);
    expect(renderTextWithEntities({ text: 'hello', asPreview: true, entities: [bold(0, 5)] })).toEqual(['hello']);
  });

  it('conceals a Spoiler range of a preview with characters of the same length and keeps the rest', async () => {
    const el = await mount({ text: 'code 12345 now', entities: [spoiler(5, 5)], asPreview: true });

    expect(el.textContent).toHaveLength('code 12345 now'.length);
    expect(el.textContent.startsWith('code ')).toBe(true);
    expect(el.textContent.endsWith(' now')).toBe(true);
    expect(el.textContent.slice(5, 10)).toMatch(BRAILLE);
    expect(el.textContent).not.toContain('12345');
    // The dots look of the Spoiler stays, and the real characters are in no attribute either
    const wrapper = el.querySelector('.Spoiler')!;
    expect(wrapper.classList.contains('Spoiler--concealed')).toBe(true);
    expect(wrapper.textContent).toMatch(BRAILLE);
    expect(el.innerHTML).not.toContain('12345');
  });

  it('conceals the text of a Spoiler in every shape of the other entities of a preview', async () => {
    const text = 'secret 1234 here';
    const variants: ApiMessageEntity[][] = [
      // Nested, in both orders, and a partial overlap that tt's tree puts outside of the Spoiler
      [spoiler(7, 4), bold(7, 4)],
      [bold(7, 4), spoiler(7, 4)],
      [{ type: T.Italic, offset: 0, length: 9 }, spoiler(7, 4)],
      [bold(10, 6), spoiler(7, 4)],
      // Not sorted, out of range and fractional entities around it
      [bold(12, 4), spoiler(7, 4)],
      [spoiler(7, 4), bold(-4, 100)],
      [spoiler(7.5, 3.2)],
    ];

    for (const entities of variants) {
      const el = await mount({ text, entities, asPreview: true });
      expect(el.textContent, JSON.stringify(entities)).not.toMatch(/123|234/);
    }
  });

  it('conceals the Spoiler ranges beyond the cap of the entities too', async () => {
    const entities = Array.from({ length: 3000 }, () => bold(0, 1));
    entities.push(spoiler(5, 5));
    const el = await mount({ text: 'code 12345 now', entities, asPreview: true });

    expect(el.textContent).not.toContain('12345');
    expect(el.textContent).toHaveLength('code 12345 now'.length);
  });

  it('leaves the Spoiler of a message to the component: the text is there under the dots', async () => {
    const el = await mount({ text: 'code 12345 now', entities: [spoiler(5, 5)], containerId: 'm1' });

    expect(readable(el)).toBe('code 12345 now');
    expect(el.querySelector('.Spoiler')!.classList.contains('Spoiler--concealed')).toBe(true);
  });

  it('merges overlapping and adjacent ranges and ignores ranges outside the text', () => {
    const text = concealSpoilers('0123456789', [spoiler(2, 4), spoiler(4, 4), spoiler(8, 50), spoiler(-3, 2)]);
    expect(text).toHaveLength(10);
    expect(text.slice(0, 2)).not.toMatch(BRAILLE); // -3..-1 is outside
    expect(text.slice(2, 10)).toMatch(BRAILLE);
    expect(text).not.toMatch(/[2-9]/);
  });

  it('survives a Spoiler range that is not a pair of numbers', () => {
    const entities = [
      { type: T.Spoiler, offset: Number.NaN, length: 3 },
      { type: T.Spoiler, offset: '2', length: 3 },
      { type: T.Spoiler, offset: 1, length: Infinity },
    ] as unknown as ApiMessageEntity[];

    const result = concealSpoilers('0123456789', entities);
    expect(result).toHaveLength(10);
    expect(result.slice(1)).toMatch(BRAILLE);
  });

  it('conceals only the Spoiler range of the summary string', () => {
    const concealed = concealSpoilers('a b c', [spoiler(2, 1)]);
    expect(concealed.replace(BRAILLE_CHARS, '#')).toBe('a # c');
  });
});

describe('a call without an owner (a helper that builds a summary string)', () => {
  it('returns the text without components, with the Spoilers of a preview concealed', () => {
    const text = 'bold secret 😀 end';
    const entities = [
      bold(0, 4),
      spoiler(5, 6),
      { type: T.CustomEmoji, offset: 12, length: 2, documentId: '5' },
      { type: T.TextUrl, offset: 15, length: 3, url: 'https://example.com' },
    ] as ApiMessageEntity[];

    const result = renderTextWithEntities({ text, entities, asPreview: true });

    expect(result.every((part) => typeof part === 'string' || (part as Node).nodeName === 'IMG')).toBe(true);
    expect(result.filter((part) => typeof part === 'string').join('')).not.toContain('secret');
    expect(customEmojiProps).toHaveLength(0);
  });
});

describe('the DOM of the entity types', () => {
  it('renders the text decorations', async () => {
    const text = 'bold italic under strike';
    const el = await mount({
      text,
      entities: [
        entity(T.Bold, 'bold', text),
        entity(T.Italic, 'italic', text),
        entity(T.Underline, 'under', text),
        entity(T.Strike, 'strike', text),
      ],
    });

    expect(el.querySelector('strong[data-entity-type="MessageEntityBold"]')!.textContent).toBe('bold');
    expect(el.querySelector('em[data-entity-type="MessageEntityItalic"]')!.textContent).toBe('italic');
    expect(el.querySelector('ins[data-entity-type="MessageEntityUnderline"]')!.textContent).toBe('under');
    expect(el.querySelector('del[data-entity-type="MessageEntityStrike"]')!.textContent).toBe('strike');
    expect(readable(el)).toBe(text);
  });

  it('renders inline code as a focusable, clickable text box', async () => {
    const text = 'run ls -la now';
    const el = await mount({ text, entities: [entity(T.Code, 'ls -la', text)] });

    const code = el.querySelector('code')!;
    expect(code.textContent).toBe('ls -la');
    expect(code.className).toBe('text-entity-code clickable');
    expect(code.getAttribute('role')).toBe('textbox');
    expect(code.getAttribute('tabindex')).toBe('0');
    expect(code.getAttribute('data-entity-type')).toBe('MessageEntityCode');
  });

  it('renders a code block with its language title, text and copy button', async () => {
    const text = 'x\nconst a = 1;\ny';
    const el = await mount({ text, entities: [entity(T.Pre, 'const a = 1;', text, { language: 'js' })] });

    const pre = el.querySelector('pre')!;
    expect(pre.getAttribute('data-entity-type')).toBe('MessageEntityPre');
    expect(pre.getAttribute('data-language')).toBe('js');
    expect(el.querySelector('.code-title')!.textContent).toBe('JavaScript');
    expect(pre.textContent).toContain('const a = 1;');
    expect(pre.querySelector('.code-overlay')).not.toBeNull();
    expect(el.querySelector('.icon-copy')).not.toBeNull();
  });

  it('renders a protected code block without the copy button', async () => {
    const text = 'let a';
    const el = await mount({ text, entities: [entity(T.Pre, text, text)], isProtected: true });

    expect(el.querySelector('pre')!.textContent).toBe('let a');
    expect(el.querySelector('.icon-copy')).toBeNull();
  });

  it('highlights the code of a known language into spans, with the source text kept', async () => {
    const source = 'const answer = 42;';
    const el = await mount({ text: source, entities: [entity(T.Pre, source, source, { language: 'javascript' })] });
    await vi.waitFor(async () => {
      await harness.frame();
      expect(el.querySelector('pre code.hljs')).not.toBeNull();
    });

    const code = el.querySelector('pre code.hljs')!;
    expect(code.textContent).toBe(source);
    expect(code.querySelector('span[class^="hljs-"]')).not.toBeNull();
    expect(allElements(code).every((node) => ['CODE', 'SPAN'].includes(node.tagName))).toBe(true);
  });

  it('does not take a prototype member for the pretty name of a language', async () => {
    for (const language of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const el = await mount({ text: 'x', entities: [entity(T.Pre, 'x', 'x', { language })] });
      expect(el.querySelector('.code-title')!.textContent).toBe(language);
      expect(el.querySelector('pre')!.getAttribute('data-language')).toBe(language);
    }
  });

  it('renders a block quote, collapsible on request', async () => {
    const text = 'before quote after';
    const el = await mount({ text, entities: [entity(T.Blockquote, 'quote', text, { canCollapse: true })] });

    const quote = el.querySelector('blockquote')!;
    expect(quote.getAttribute('data-entity-type')).toBe('MessageEntityBlockquote');
    expect(quote.querySelector('[data-rich-copy-wrapper]')!.textContent).toBe('quote');
    expect(readable(el)).toBe('before quote after');
  });

  it('renders links, text links, e-mails and phones', async () => {
    const text = 'see https://example.com/a?b=1 or click or me@example.com or +123456789';
    const el = await mount({
      text,
      entities: [
        entity(T.Url, 'https://example.com/a?b=1', text),
        entity(T.TextUrl, 'click', text, { url: 'https://example.org/page' }),
        entity(T.Email, 'me@example.com', text),
        entity(T.Phone, '+123456789', text),
      ],
    });

    const url = el.querySelector<HTMLAnchorElement>('a[data-entity-type="MessageEntityUrl"]')!;
    expect(url.getAttribute('href')).toBe('https://example.com/a?b=1');
    expect(url.getAttribute('rel')).toBe('noopener noreferrer');
    expect(url.getAttribute('target')).toBe('_blank');
    expect(url.textContent).toBe('https://example.com/a?b=1');

    const textUrl = el.querySelector<HTMLAnchorElement>('a[data-entity-type="MessageEntityTextUrl"]')!;
    expect(textUrl.getAttribute('href')).toBe('https://example.org/page');
    expect(textUrl.textContent).toBe('click');
    expect(textUrl.getAttribute('rel')).toBe('noopener noreferrer');

    const email = el.querySelector<HTMLAnchorElement>('a[data-entity-type="MessageEntityEmail"]')!;
    expect(email.getAttribute('href')).toBe('mailto:me@example.com');
    expect(email.getAttribute('rel')).toBe('noopener noreferrer');

    const phone = el.querySelector<HTMLAnchorElement>('a[data-entity-type="MessageEntityPhone"]')!;
    expect(phone.getAttribute('href')).toBe('tel:+123456789');
  });

  it('renders mentions, mention names, hashtags, cashtags and bot commands as links without a href', async () => {
    const text = '@user @Named #tag $CASH /start@bot';
    const el = await mount({
      text,
      entities: [
        entity(T.Mention, '@user', text),
        entity(T.MentionName, '@Named', text, { userId: '12345' }),
        entity(T.Hashtag, '#tag', text),
        entity(T.Cashtag, '$CASH', text),
        entity(T.BotCommand, '/start@bot', text),
      ],
    });

    for (const type of ['Mention', 'MentionName', 'Hashtag', 'Cashtag', 'BotCommand']) {
      const link = el.querySelector(`a[data-entity-type="MessageEntity${type}"]`)!;
      expect(link, type).not.toBeNull();
      expect(link.classList.contains('text-entity-link'), type).toBe(true);
      expect(link.getAttribute('dir'), type).toBe('auto');
      expect(link.hasAttribute('href'), type).toBe(false);
    }
    expect(el.querySelector('a[data-entity-type="MessageEntityMentionName"]')!.textContent).toBe('@Named');
  });

  it('renders a timestamp as a link only when the message has a media long enough', async () => {
    const text = 'at 1:30 here';
    const entities = [entity(T.Timestamp, '1:30', text, { timestamp: 90 })];

    const plain = await mount({ text, entities });
    expect(plain.querySelector('a')).toBeNull();
    expect(readable(plain)).toBe('at 1:30 here');

    const tooLate = await mount({ text, entities, chatId: '1', messageId: 2, maxTimestamp: 60 });
    expect(tooLate.querySelector('a')).toBeNull();

    const link = await mount({ text, entities, chatId: '1', messageId: 2, maxTimestamp: 120 });
    expect(link.querySelector('a[data-entity-type="MessageEntityTimestamp"]')!.textContent).toBe('1:30');
  });

  it('renders a formatted date with its unix time and format, as plain text in a preview', async () => {
    const text = 'on 2024-05-01 ok';
    const date = Date.UTC(2024, 4, 1, 12) / 1000;
    const entities = [entity(T.FormattedDate, '2024-05-01', text, { date, shortDate: true, shortTime: true })];

    const el = await mount({ text, entities, chatId: '1', messageId: 3 });
    const link = el.querySelector('a[data-entity-type="MessageEntityFormattedDate"]')!;
    expect(link.getAttribute('data-unix')).toBe(String(date));
    expect(link.getAttribute('data-format')).toBe('dt');
    expect(link.getAttribute('title')).toBeTruthy();
    expect(link.classList.contains('text-entity-link')).toBe(true);

    const preview = await mount({ text, entities, asPreview: true });
    expect(preview.querySelector('a')).toBeNull();
    expect(preview.textContent.startsWith('on ')).toBe(true);
  });

  it('renders the text for a date that cannot be formatted', async () => {
    const text = 'on a date ok';
    for (const date of [Number.NaN, Infinity, 1e20, 'x' as unknown as number]) {
      const entities = [entity(T.FormattedDate, 'a date', text, { date, shortDate: true })];
      const message = await mount({ text, entities, chatId: '1', messageId: 3 });
      const preview = await mount({ text, entities, asPreview: true });

      expect(message.querySelector('a')).toBeNull();
      expect(readable(message)).toBe(text);
      expect(readable(preview)).toBe(text);
    }
  });

  it('renders a TON address as a link with a menu', async () => {
    const text = 'send to EQ-address please';
    const el = await mount({ text, entities: [entity(T.TonAddress, 'EQ-address', text)] });

    const link = el.querySelector('a[data-entity-type="MessageEntityTonAddress"]')!;
    expect(link.textContent).toBe('EQ-address');
    expect(link.hasAttribute('href')).toBe(false);
  });

  it('renders the local entities of the diffs and of the focused quote', async () => {
    const text = 'keep added old gone quote';
    const el = await mount({
      text,
      entities: [
        entity(T.DiffInsert, 'added', text),
        entity(T.DiffReplace, 'old', text, { oldText: 'was' }),
        entity(T.DiffDelete, 'gone', text),
        entity(T.QuoteFocus, 'quote', text),
      ],
    });

    expect(el.querySelector('.text-entity-diff-insert')!.textContent).toBe('added');
    expect(el.querySelector('.text-entity-diff-replace-old')!.textContent).toBe('was');
    expect(el.querySelector('.text-entity-diff-replace-new')!.textContent).toBe('old');
    expect(el.querySelector('.text-entity-diff-delete')!.textContent).toBe('gone');
    expect(el.querySelector('.matching-text-highlight.is-quote')!.textContent).toBe('quote');
  });

  it('renders custom emoji through the CustomEmoji component with tt props', async () => {
    const text = '😀 text 😀';
    const el = await mount({
      text,
      entities: [
        { type: T.CustomEmoji, offset: 0, length: 2, documentId: '5368324170671202286' },
        { type: T.CustomEmoji, offset: 8, length: 2, documentId: '-42' },
      ],
      emojiSize: 24,
      forcePlayback: true,
      noCustomEmojiPlayback: true,
      withTranslucentThumbs: true,
    });

    const emoji = el.querySelectorAll('.custom-emoji');
    expect(emoji).toHaveLength(2);
    expect(emoji[0].getAttribute('data-document-id')).toBe('5368324170671202286');
    expect(emoji[1].getAttribute('data-document-id')).toBe('-42');
    expect(customEmojiProps[0]).toMatchObject({
      documentId: '5368324170671202286',
      size: 24,
      isSelectable: true,
      withSharedAnimation: true,
      forceAlways: true,
      noPlay: true,
      withTranslucentThumb: true,
    });
    expect(readable(el)).toBe(' text ');
  });

  it('passes the shared canvas accessors to the custom emoji', async () => {
    const sharedCanvasRef = () => undefined;
    await mount({
      text: '😀',
      entities: [{ type: T.CustomEmoji, offset: 0, length: 2, documentId: '1' }],
      sharedCanvasRef,
    });

    expect(customEmojiProps[0].sharedCanvasRef).toBe(sharedCanvasRef);
  });

  it('renders custom emoji of a preview too', async () => {
    const el = await mount({
      text: 'a 😀 b',
      entities: [{ type: T.CustomEmoji, offset: 2, length: 2, documentId: '77' }],
      asPreview: true,
    });

    expect(el.querySelector('.custom-emoji')!.getAttribute('data-document-id')).toBe('77');
    expect(customEmojiProps[0]).toMatchObject({ documentId: '77', isSelectable: true });
  });

  it('renders the text instead of a custom emoji whose id is not an integer', async () => {
    const ids = ['__proto__', 'constructor', '1; DROP', '<img>', '', '12345678901234567890123', '1.5', 'NaN'];
    const entities = ids.map((documentId, i) => ({ type: T.CustomEmoji, offset: i * 2, length: 2, documentId }));
    const text = '🙂'.repeat(ids.length);

    const el = await mount({ text, entities: entities as ApiMessageEntity[] });
    const preview = await mount({ text, entities: entities as ApiMessageEntity[], asPreview: true });

    for (const view of [el, preview]) {
      expect(view.querySelectorAll('.custom-emoji')).toHaveLength(0);
      expect(view.querySelectorAll('img.emoji')).toHaveLength(ids.length);
    }
    expect(customEmojiProps).toHaveLength(0);
  });

  it('shows the emoji of the text as images and the big ones in high quality', async () => {
    const small = await mount({ text: 'hi 😀' });
    expect(small.querySelector('img.emoji-small')!.getAttribute('alt')).toBe('😀');
    expect(small.querySelector('img.emoji-small')!.getAttribute('src')).toContain('img-apple-64');

    const big = await mount({ text: '😀', emojiSize: 100 });
    expect(big.querySelector('img.emoji')!.getAttribute('src')).toContain('img-apple-160');
  });

  it('keeps line breaks in messages and drops them in previews', async () => {
    const message = await mount({ text: 'one\ntwo', entities: [bold(4, 3)] });
    expect(message.querySelectorAll('br')).toHaveLength(1);

    const preview = await mount({ text: 'one\ntwo', entities: [bold(4, 3)], asPreview: true });
    expect(preview.querySelectorAll('br')).toHaveLength(0);
    expect(preview.textContent).toBe('one\ntwo');
  });

  it('removes the line break that follows a code block', async () => {
    const text = 'code\nafter';
    const el = await mount({ text, entities: [{ type: T.Pre, offset: 0, length: 4 }] });

    expect(el.querySelectorAll('br')).toHaveLength(0);
    expect(el.textContent).toContain('after');
  });
});

describe('previews', () => {
  it('render only the text of the links, quotes and styles', async () => {
    const text = 'bold link quote tag';
    const el = await mount({
      text,
      entities: [
        entity(T.Bold, 'bold', text),
        entity(T.TextUrl, 'link', text, { url: 'https://example.com' }),
        entity(T.Blockquote, 'quote', text),
        entity(T.Hashtag, 'tag', text),
      ],
      asPreview: true,
    });

    expect(el.querySelector('a, strong, blockquote, em')).toBeNull();
    expect(el.textContent).toBe(text);
  });

  it('keep the highlight of the search', async () => {
    const el = await mount({
      text: 'find the needle here',
      entities: [bold(0, 4)],
      highlight: 'needle',
      asPreview: true,
    });

    expect(el.querySelector('.matching-text-highlight')!.textContent).toBe('needle');
  });

  it('keep the highlight inside a styled entity of a message', async () => {
    const el = await mount({ text: 'find the needle here', entities: [bold(0, 20)], highlight: 'NEEDLE' });

    expect(el.querySelector('strong .matching-text-highlight')!.textContent).toBe('needle');
  });

  it('render a Spoiler of a message and of a preview with the same wrapper', async () => {
    const text = 'a secret b';
    const entities = [entity(T.Spoiler, 'secret', text)];

    const message = await mount({ text, entities, containerId: 'x' });
    const preview = await mount({ text, entities, asPreview: true });

    expect(message.querySelector('.Spoiler--animated')).not.toBeNull();
    expect(preview.querySelector('.Spoiler')).not.toBeNull();
    expect(preview.querySelector('.Spoiler--animated')).toBeNull();
  });
});

describe('the Spoiler of a message', () => {
  const text = 'a one b two c';
  const entities = [entity(T.Spoiler, 'one', text), entity(T.Spoiler, 'two', text)];
  const click = (target: Element) => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
  };

  it('is concealed until the click, which reveals the spoilers of the message, once', async () => {
    const el = await mount({ text, entities, containerId: 'message-1' });
    const spoilers = Array.from(el.querySelectorAll<HTMLElement>('.Spoiler'));
    expect(spoilers).toHaveLength(2);
    expect(spoilers.every((node) => node.classList.contains('Spoiler--concealed'))).toBe(true);
    expect(spoilers.every((node) => node.classList.contains('Spoiler--animated'))).toBe(true);
    // Their content is invisible through the class (CSS: opacity 0, user-select none), not removed
    expect(spoilers[0].querySelector('.Spoiler__content')!.textContent).toBe('one');

    // A handler of an ancestor, delegated like the handlers of the app
    const listener = vi.fn();
    addEvent(el, 'click', listener, true);
    click(spoilers[0].querySelector('.Spoiler__content')!);

    expect(spoilers.every((node) => !node.classList.contains('Spoiler--concealed'))).toBe(true);
    expect(spoilers.every((node) => !node.classList.contains('Spoiler--animated'))).toBe(true);
    // The first click only reveals: it does not reach the handlers around (a link inside would not open)
    expect(listener).not.toHaveBeenCalled();

    // Revealed once: the next click is not stopped, and the spoilers stay revealed
    click(spoilers[1]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(spoilers.every((node) => !node.classList.contains('Spoiler--concealed'))).toBe(true);
  });

  it('keeps the spoilers of another message concealed', async () => {
    const first = await mount({ text, entities, containerId: 'message-a' });
    const second = await mount({ text, entities, containerId: 'message-b' });

    click(first.querySelector('.Spoiler')!);

    expect(first.querySelector('.Spoiler--concealed')).toBeNull();
    expect(second.querySelectorAll('.Spoiler--concealed')).toHaveLength(2);
  });

  it('reveals after a spoiler of the same message was removed (a text edit)', async () => {
    await mount({ text, entities, containerId: 'message-c' });
    const second = await mount({ text, entities, containerId: 'message-c' });
    // The old spoilers go away
    disposers.shift()!();
    await harness.frame();

    click(second.querySelector('.Spoiler')!);

    expect(second.querySelector('.Spoiler--concealed')).toBeNull();
  });

  it('is not clickable without a container (a notification)', async () => {
    const el = await mount({ text, entities });
    const listener = vi.fn();
    addEvent(el, 'click', listener, true);

    click(el.querySelector('.Spoiler')!);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(el.querySelectorAll('.Spoiler--concealed')).toHaveLength(2);
  });
});

// What the sender concealed must not be readable without the click: not in the text around a Spoiler, not in a tooltip, and
// the click that reveals must not also run what is under the dots (S1-S3 of the messages security review).
describe('a Spoiler hides what it covers', () => {
  const click = (target: Element, init: MouseEventInit = {}, type = 'click') => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    flushSync();
    return event;
  };
  // The text that is outside of every `.Spoiler`, as a reader sees it
  const outsideSpoilers = (el: Element) => {
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('.Spoiler').forEach((node) => node.remove());
    return clone.textContent;
  };

  describe('the first click only reveals', () => {
    it('does not open a URL under a concealed spoiler, and has no tooltip while it is concealed', async () => {
      const text = 'see https://evil.example/u now';
      const el = await mount({
        text,
        entities: [entity(T.Spoiler, 'https://evil.example/u', text), entity(T.Url, 'https://evil.example/u', text)],
        containerId: 'm-url',
        chatId: '1',
        messageId: 2,
      });
      const link = el.querySelector('a')!;
      expect(link.hasAttribute('title')).toBe(false);

      const first = click(link);
      expect(actionCalls).toEqual([]);
      expect(first.defaultPrevented).toBe(true);
      expect(el.querySelector('.Spoiler--concealed')).toBeNull();
      await harness.frame();
      expect(link.getAttribute('title')).toBe('https://evil.example/u');

      click(link);
      expect(actionCalls.map(([name]) => name)).toEqual(['openUrl']);
    });

    it('does not send a bot command under a concealed spoiler', async () => {
      const text = 'run /ban_all please';
      const el = await mount({
        text,
        entities: [entity(T.Spoiler, '/ban_all', text), entity(T.BotCommand, '/ban_all', text)],
        containerId: 'm-cmd',
      });

      click(el.querySelector('a')!);
      expect(actionCalls).toEqual([]);
      expect(el.querySelector('.Spoiler--concealed')).toBeNull();

      click(el.querySelector('a')!);
      expect(actionCalls).toEqual([['sendBotCommand', { command: '/ban_all' }]]);
    });

    it('stops a middle click on a link under a concealed spoiler, and the keyboard click of a focused one', async () => {
      const text = 'see https://evil.example/u now';
      const el = await mount({
        text,
        entities: [entity(T.Spoiler, 'https://evil.example/u', text), entity(T.Url, 'https://evil.example/u', text)],
        containerId: 'm-aux',
      });
      const link = el.querySelector('a')!;

      const aux = click(link, { button: 1 }, 'auxclick');
      expect(aux.defaultPrevented).toBe(true);
      expect(actionCalls).toEqual([]);
      expect(el.querySelector('.Spoiler--concealed')).not.toBeNull();

      // Enter on a focused link is a `click` event with no coordinates
      click(link, { detail: 0 });
      expect(actionCalls).toEqual([]);
      expect(el.querySelector('.Spoiler--concealed')).toBeNull();
    });

    it('has no date tooltip under a concealed spoiler, and a link around the spoiler has no address tooltip', async () => {
      const text = 'on 2024-05-01 ok https://evil.example/u end';
      const date = Date.UTC(2024, 4, 1, 12) / 1000;
      const el = await mount({
        text,
        entities: [
          entity(T.Spoiler, '2024-05-01', text),
          entity(T.FormattedDate, '2024-05-01', text, { date, shortDate: true }),
          entity(T.Url, 'https://evil.example/u', text),
          entity(T.Spoiler, 'evil', text),
        ],
        containerId: 'm-title',
        chatId: '1',
        messageId: 3,
      });
      const anchors = Array.from(el.querySelectorAll('a'));
      expect(anchors).toHaveLength(2);
      expect(anchors.map((a) => a.hasAttribute('title'))).toEqual([false, false]);

      click(el.querySelector('.Spoiler')!);
      await harness.frame();
      expect(anchors.every((a) => a.getAttribute('title'))).toBe(true);
    });

    it('does not intercept the click of a preview, which has no container', async () => {
      const text = 'a secret b';
      const el = await mount({ text, entities: [entity(T.Spoiler, 'secret', text)], asPreview: true });
      const listener = vi.fn();
      addEvent(el, 'click', listener, true);

      click(el.querySelector('.Spoiler')!);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(el.querySelector('.Spoiler--concealed')).not.toBeNull();
    });
  });

  describe('the caps never show a Spoiler as plain text', () => {
    it('keeps a Spoiler that is beyond the cap of the entities', async () => {
      const count = 2100;
      const text = `${'ab '.repeat(count)}SECRET123 tail`;
      const entities = [
        ...Array.from({ length: count }, (_, i) => bold(i * 3, 2)),
        entity(T.Spoiler, 'SECRET123', text),
      ];
      const el = await mount({ text, entities, containerId: 'm-cap' });

      expect(el.querySelectorAll('.Spoiler--concealed')).toHaveLength(1);
      expect(outsideSpoilers(el)).not.toContain('SECRET123');
      expect(readable(el)).toBe(text);
    });

    it('conceals at least what more Spoilers than the cap conceal', async () => {
      const count = 3000;
      const text = 'x '.repeat(count);
      const entities = Array.from({ length: count }, (_, i) => spoiler(i * 2, 1));
      const el = await mount({ text, entities, containerId: 'm-many' });

      expect(el.querySelectorAll('.Spoiler--concealed').length).toBeLessThanOrEqual(2048);
      // every `x` is in a Spoiler, only the spaces between them may be outside
      expect(outsideSpoilers(el).replace(/\s/g, '')).toBe('');
      expect(readable(el)).toBe(text);
    });

    it('keeps a Spoiler below the depth cap, wrapping the flattened text', async () => {
      const depth = 40;
      const text = `${'x'.repeat(depth)}SECRET123 tail`;
      const entities = [
        ...Array.from({ length: depth }, (_, i) => bold(i, text.length - i)),
        entity(T.Spoiler, 'SECRET123', text),
      ];
      const el = await mount({ text, entities, containerId: 'm-depth' });

      expect(el.querySelectorAll('.Spoiler--concealed').length).toBeGreaterThan(0);
      expect(outsideSpoilers(el)).not.toContain('SECRET123');
      expect(readable(el)).toBe(text);
    });

    it('the wrapped text reveals with the click, like any spoiler of the message', async () => {
      const depth = 40;
      const text = `${'x'.repeat(depth)}SECRET123`;
      const entities = [
        ...Array.from({ length: depth }, (_, i) => bold(i, text.length - i)),
        entity(T.Spoiler, 'SECRET123', text),
      ];
      const el = await mount({ text, entities, containerId: 'm-depth2' });

      click(el.querySelector('.Spoiler')!);

      expect(el.querySelector('.Spoiler--concealed')).toBeNull();
    });
  });

  describe('entities that cross or hold a Spoiler', () => {
    it('does not print the tail of a Spoiler that starts inside another entity in the clear', async () => {
      const text = 'aaaaaSECRETCODE12345tail';
      const el = await mount({ text, entities: [bold(0, 10), spoiler(5, 15)], containerId: 'm-cross' });

      expect(readable(el)).toBe(text);
      expect(outsideSpoilers(el)).toBe('aaaaatail');
      expect(el.querySelectorAll('.Spoiler--concealed')).toHaveLength(2);
      // one click reveals both pieces
      click(el.querySelector('.Spoiler')!);
      expect(el.querySelector('.Spoiler--concealed')).toBeNull();
    });

    it('splits a Spoiler that ends inside another entity the same way', async () => {
      const text = 'aaaSECRETbbbbtail';
      const el = await mount({ text, entities: [spoiler(3, 6), bold(6, 6)], containerId: 'm-cross2' });

      expect(readable(el)).toBe(text);
      expect(outsideSpoilers(el)).toBe('aaabbbbtail'.replace('bbbb', 'bbb' + 'b'));
      expect(outsideSpoilers(el)).not.toContain('SECRET');
    });

    it('conceals a date and a custom emoji in the range of a Spoiler in a preview, with no digits of the date', () => {
      const text = 'meet 2030-01-01 ok';
      const date = Date.UTC(2030, 0, 1, 12) / 1000;
      const dateEntity = entity(T.FormattedDate, '2030-01-01', text, { date, shortDate: true });
      for (const entities of [
        [dateEntity, spoiler(5, 10)],
        [spoiler(5, 10), dateEntity],
        [spoiler(0, 18), dateEntity],
      ]) {
        const result = run({ text, entities, asPreview: true });
        const holder = document.createElement('div');
        holder.append(
          ...(result.map((part) => (typeof part === 'string' ? document.createTextNode(part) : part)) as Node[]),
        );

        expect(holder.textContent, JSON.stringify(entities)).not.toMatch(/\d{2}/);
        expect(holder.textContent).not.toContain('2030');
        expect(holder.textContent.length).toBe(text.length);
      }
    });

    it('conceals a custom emoji around or inside a Spoiler in a preview', async () => {
      const text = 'a \u{1F600}\u{1F600}\u{1F600} b';
      const emoji = {
        type: T.CustomEmoji,
        offset: 2,
        length: 6,
        documentId: '5368324170671202286',
      } as ApiMessageEntity;
      for (const entities of [
        [emoji, spoiler(2, 6)],
        [spoiler(2, 6), emoji],
      ]) {
        const el = await mount({ text, entities, asPreview: true });

        expect(el.querySelector('.custom-emoji')).toBeNull();
        expect(el.textContent).not.toContain('\u{1F600}');
      }
    });

    it('keeps the Spoiler when a date or a custom emoji holds it in a message', async () => {
      const text = 'meet 2030-01-01 ok';
      const date = Date.UTC(2030, 0, 1, 12) / 1000;
      const el = await mount({
        text,
        entities: [entity(T.FormattedDate, '2030-01-01', text, { date, shortDate: true }), spoiler(5, 10)],
        containerId: 'm-date',
        chatId: '1',
        messageId: 4,
      });

      expect(el.querySelectorAll('.Spoiler--concealed')).toHaveLength(1);
      expect(outsideSpoilers(el).replace(/\u00A0/g, ' ')).toBe('meet  ok');
    });

    it('keeps the Spoiler when a custom emoji holds it in a message, and a code block too', async () => {
      const text = 'a \u{1F600} b SECRET c';
      const emoji = {
        type: T.CustomEmoji,
        offset: 2,
        length: 2,
        documentId: '5368324170671202286',
      } as ApiMessageEntity;
      const el = await mount({
        text,
        entities: [emoji, spoiler(2, 2), entity(T.Spoiler, 'SECRET', text)],
        containerId: 'm-emoji',
      });
      expect(el.querySelector('.custom-emoji')).toBeNull();
      expect(outsideSpoilers(el)).not.toContain('\u{1F600}');

      const code = 'code SECRET end';
      const pre = await mount({
        text: code,
        entities: [{ type: T.Pre, offset: 0, length: 15 }, entity(T.Spoiler, 'SECRET', code)],
        containerId: 'm-pre',
      });
      expect(pre.querySelector('.CodeBlock')).toBeNull();
      expect(outsideSpoilers(pre)).not.toContain('SECRET');
    });
  });

  it('never leaves a character of a Spoiler outside of it, whatever the entities cross (random)', () => {
    const text = 'abcdefghijklmnopqrstuvwxyz';
    const types = [T.Bold, T.Italic, T.Strike, T.Underline, T.Code, T.Spoiler, T.Spoiler];
    let seed = 987654;
    const random = (limit: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % limit;
    };

    for (let iteration = 0; iteration < 400; iteration++) {
      const entities = Array.from({ length: 1 + random(6) }, () => ({
        type: types[random(types.length)],
        offset: random(26),
        length: 1 + random(12),
      })) as ApiMessageEntity[];
      const concealed = new Set<number>();
      for (const e of entities) {
        if (e.type !== T.Spoiler) continue;
        for (let i = e.offset; i < Math.min(26, e.offset + e.length); i++) concealed.add(i);
      }

      const el = document.createElement('div');
      const dispose = render(
        () => renderTextWithEntities({ text, entities, containerId: `m-random-${iteration}` }),
        el,
      );
      flushSync();
      const label = JSON.stringify(entities);
      expect(readable(el), label).toBe(text);
      const clear = outsideSpoilers(el);
      for (const index of concealed) expect(clear, `${label} leaks ${text[index]}`).not.toContain(text[index]);
      dispose();
    }
  });
});

describe('links from the server (untrusted)', () => {
  const SCRIPT_URLS = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'JAVASCRIPT:alert(1)',
    '  javascript:alert(1)',
    '\tjavascript:alert(1)',
    '\n\r javascript:alert(1)',
    '\u0001\u0002javascript:alert(1)',
    '\u0000javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'java\rscr\tipt:alert(1)',
    'jav&#x61;script:alert(1)',
    'javascript\u0000:alert(1)',
    'javascript://%0aalert(1)',
    'javascript://example.com/%0Aalert(1)',
    'vbscript:msgbox(1)',
    'VbScript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'DATA:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'data:image/svg+xml,<svg onload=alert(1)>',
    'file:///etc/passwd',
    'blob:https://example.com/uuid',
    'filesystem:https://example.com/temporary/x',
    'about:blank',
    ' javascript:alert(1)',
    ' javascript:alert(1)',
    'javascript：alert(1)',
  ];

  const SAFE_SCHEMES = new Set(['http:', 'https:', 'tg:', 'ton:', 'mailto:', 'tel:']);

  function assertSafe(el: Element) {
    for (const node of Array.from(el.querySelectorAll('[href], [src], [action], [formaction], [srcdoc]'))) {
      if (node.hasAttribute('href')) {
        const href = node.getAttribute('href')!;
        expect(SAFE_SCHEMES.has(resolveScheme(href)), `href ${JSON.stringify(href)}`).toBe(true);
        // Without the characters the URL parser skips (controls and spaces)
        const visible = Array.from(href)
          .filter((char) => char.charCodeAt(0) > 32)
          .join('');
        expect(visible.toLowerCase()).not.toMatch(/^(javascript|vbscript|data):/);
      }
      expect(node.hasAttribute('srcdoc')).toBe(false);
    }
    for (const node of allElements(el)) {
      for (const name of node.getAttributeNames()) {
        expect(name.toLowerCase().startsWith('on'), `${node.tagName} ${name}`).toBe(false);
      }
    }
  }

  it.each(SCRIPT_URLS)('never makes %j a live href of a text link', async (url) => {
    const text = 'click me';
    const el = await mount({ text, entities: [entity(T.TextUrl, text, text, { url })], chatId: '1', messageId: 1 });

    expect(el.querySelector('a')).not.toBeNull();
    assertSafe(el);
  });

  it.each(SCRIPT_URLS)('never makes %j a live href of a link in the text', async (url) => {
    const el = await mount({ text: url, entities: [entity(T.Url, url, url)], chatId: '1', messageId: 1 });

    expect(el.querySelector('a')).not.toBeNull();
    assertSafe(el);
  });

  it('keeps the allowed schemes as they are', async () => {
    for (const url of ['http://example.com', 'https://example.com/x', 'tg://resolve?domain=x', 'ton://transfer/x']) {
      const el = await mount({ text: 'link', entities: [entity(T.TextUrl, 'link', 'link', { url })] });
      expect(el.querySelector('a')!.getAttribute('href')).toBe(url);
    }
  });

  it('does not take the text of the link for its address when it is a text link', async () => {
    const text = 'https://safe.example';
    const el = await mount({
      text,
      entities: [entity(T.TextUrl, text, text, { url: 'javascript:alert(document.cookie)' })],
    });

    const href = el.querySelector('a')!.getAttribute('href')!;
    expect(href).toBe('https://javascript:alert(document.cookie)');
    expect(resolveScheme(href)).toBe('https:');
  });

  it('produces no event handler attributes, srcdoc or inline script anywhere', async () => {
    const text = '"onmouseover=alert(1) <img src=x onerror=alert(1)> <script>alert(1)</script> &lt;b&gt;';
    const el = await mount({
      text,
      entities: [
        bold(0, 20),
        { type: T.Italic, offset: 5, length: 40 },
        { type: T.Code, offset: 10, length: 30 },
        spoiler(20, 30),
        { type: T.TextUrl, offset: 3, length: 40, url: '"><img src=x onerror=alert(1)>' },
        { type: T.Blockquote, offset: 30, length: 30 },
        { type: T.Pre, offset: 50, length: 20, language: '"><img src=x onerror=alert(1)>' },
        { type: T.Mention, offset: 0, length: 10 },
      ] as ApiMessageEntity[],
      containerId: 'x',
    });

    expect(el.querySelector('img:not(.emoji), script, iframe, object, embed, style')).toBeNull();
    assertSafe(el);
    expect(el.textContent).toContain('<script>');
  });

  it('puts the text of an entity in text nodes only', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    const types = [
      T.Bold,
      T.Italic,
      T.Underline,
      T.Strike,
      T.Code,
      T.Pre,
      T.Spoiler,
      T.Blockquote,
      T.Mention,
      T.Hashtag,
      T.Cashtag,
      T.BotCommand,
      T.Email,
      T.Phone,
    ];

    for (const type of types) {
      const el = await mount({
        text: payload,
        entities: [{ type, offset: 0, length: payload.length } as ApiMessageEntity],
      });
      expect(el.querySelector('img'), type).toBeNull();
      expect(el.textContent, type).toContain(payload);
    }
  });
});

describe('the clicks on the entities', () => {
  const click = (target: Element, init: MouseEventInit = {}) => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
    flushSync();
  };

  it('send a bot command with the text of the link', async () => {
    const text = 'try /start now';
    const el = await mount({ text, entities: [entity(T.BotCommand, '/start', text)] });

    click(el.querySelector('a')!);

    expect(actionCalls).toEqual([['sendBotCommand', { command: '/start' }]]);
  });

  it('search a hashtag or a cashtag, in a chat when it has a username', async () => {
    const text = '#tag #tag@channel $CASH';
    const el = await mount({
      text,
      entities: [
        { type: T.Hashtag, offset: 0, length: 4 },
        { type: T.Hashtag, offset: 5, length: 12 },
        { type: T.Cashtag, offset: 18, length: 5 },
      ] as ApiMessageEntity[],
    });

    const links = Array.from(el.querySelectorAll('a'));
    click(links[0]);
    click(links[1]);
    click(links[2]);

    expect(actionCalls).toEqual([
      ['searchHashtag', { hashtag: '#tag' }],
      [
        'openChatByUsername',
        { username: 'channel', onChatChanged: { action: 'searchHashtag', payload: { hashtag: '#tag' } } },
      ],
      ['searchHashtag', { hashtag: '$CASH' }],
    ]);
  });

  it('copy the code and tell about it', async () => {
    const text = 'run ls -la now';
    const el = await mount({ text, entities: [entity(T.Code, 'ls -la', text)] });

    click(el.querySelector('code')!);

    expect(actionCalls[0]).toEqual(['copy', 'ls -la']);
    expect(actionCalls[1]).toEqual(['showNotification', { message: { key: 'TextCopied' } }]);
  });

  it('open the media of a message at the time of a timestamp', async () => {
    const text = 'at 1:30 here';
    const el = await mount({
      text,
      entities: [entity(T.Timestamp, '1:30', text, { timestamp: 90 })],
      chatId: '12',
      messageId: 34,
      threadId: 5,
      maxTimestamp: 120,
    });

    click(el.querySelector('a')!);

    expect(actionCalls).toEqual([
      ['openMediaFromTimestamp', { chatId: '12', messageId: 34, threadId: 5, timestamp: 90 }],
    ]);
  });

  it('open a link through the action, with the message it is in, and keep the browser from following it', async () => {
    const text = 'click';
    const el = await mount({
      text,
      entities: [entity(T.TextUrl, text, text, { url: 'https://example.com/x' })],
      chatId: '12',
      messageId: 34,
      threadId: 5,
    });
    const link = el.querySelector('a')!;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    flushSync();

    expect(event.defaultPrevented).toBe(true);
    expect(actionCalls).toEqual([
      [
        'openUrl',
        expect.objectContaining({
          url: 'https://example.com/x',
          linkContext: { type: 'message', chatId: '12', threadId: 5, messageId: 34 },
        }),
      ],
    ]);
  });

  it('hand a script address of a text link to the action, whose first step makes it an https address', async () => {
    const text = 'click';
    const el = await mount({
      text,
      entities: [entity(T.TextUrl, text, text, { url: 'JaVaScRiPt:alert(1)' })],
    });

    click(el.querySelector('a')!);

    const [name, payload] = actionCalls[0] as [string, { url: string; shouldSkipModal: boolean }];
    expect(name).toBe('openUrl');
    // The link says something else than where it goes: the confirmation is not skipped
    expect(payload.shouldSkipModal).toBe(false);
    // `openUrl` (global/actions/api/messages.ts) starts with `ensureProtocol(url)`
    expect(resolveScheme(ensureProtocol(payload.url))).toBe('https:');
  });
});

describe('the HTML string path (shouldRenderAsHtml)', () => {
  const html = (options: Options) =>
    (renderTextWithEntities({ ...options, shouldRenderAsHtml: true }) as string[]).join('');

  it('returns strings that are escaped', () => {
    const result = renderTextWithEntities({ text: 'a <b>&"\'', shouldRenderAsHtml: true });
    expect(result.every((part) => typeof part === 'string')).toBe(true);
    expect((result as string[]).join('')).toBe('a &lt;b&gt;&amp;"\'');
  });

  it('builds the tags of the entities', () => {
    const text = 'bold italic under strike code spoiler';
    const result = html({
      text,
      entities: [
        entity(T.Bold, 'bold', text),
        entity(T.Italic, 'italic', text),
        entity(T.Underline, 'under', text),
        entity(T.Strike, 'strike', text),
        entity(T.Code, 'code', text),
        entity(T.Spoiler, 'spoiler', text),
      ],
    });

    expect(result).toContain('<b>bold</b>');
    expect(result).toContain('<i>italic</i>');
    expect(result).toContain('<u>under</u>');
    expect(result).toContain('<del>strike</del>');
    expect(result).toContain('<code class="text-entity-code">code</code>');
    expect(result).toMatch(/<span\s+class="spoiler"\s+data-entity-type="MessageEntitySpoiler"\s*>spoiler<\/span>/);
  });

  it('escapes the text inside the tags', () => {
    const text = '<b>x</b>';
    expect(html({ text, entities: [bold(0, text.length)] })).toBe('<b>&lt;b&gt;x&lt;/b&gt;</b>');
  });

  it('escapes the attribute values that come from the entity', () => {
    const attack = '"><img src=x onerror=alert(1)>';
    const text = 'link name pre';

    const holder = document.createElement('div');
    holder.innerHTML = html({
      text,
      entities: [
        entity(T.TextUrl, 'link', text, { url: attack }),
        entity(T.MentionName, 'name', text, { userId: attack }),
        entity(T.Pre, 'pre', text, { language: attack }),
      ],
    });

    expect(holder.querySelector('img')).toBeNull();
    const [link, mention] = Array.from(holder.querySelectorAll('a'));
    expect(link.getAttribute('href')).toBe(`https://${attack}`);
    expect(mention.getAttribute('data-user-id')).toBe(attack);
    expect(holder.querySelector('code')!.getAttribute('class')).toBe(`language-${attack}`);
    for (const node of allElements(holder)) {
      expect(node.getAttributeNames().filter((name) => name.startsWith('on'))).toEqual([]);
    }
  });

  it('never makes a script URL the href of a link', () => {
    for (const url of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'data:text/html,x']) {
      const text = 'click';
      const holder = document.createElement('div');
      holder.innerHTML = html({ text, entities: [entity(T.TextUrl, text, text, { url })] });

      expect(['http:', 'https:'], url).toContain(resolveScheme(holder.querySelector('a')!.getAttribute('href')!));
    }
  });

  it('builds a custom emoji image with the id as an attribute value', () => {
    const attack = '"><b>';
    const holder = document.createElement('div');
    holder.innerHTML = html({
      text: '😀',
      entities: [{ type: T.CustomEmoji, offset: 0, length: 2, documentId: attack }],
    });

    expect(holder.querySelector('b')).toBeNull();
    expect(holder.querySelector('img')!.getAttribute('data-document-id')).toBe(attack);
  });

  it('puts the date of a formatted date in the markup as a number', () => {
    const holder = document.createElement('div');
    holder.innerHTML = html({
      text: 'date',
      entities: [{ type: T.FormattedDate, offset: 0, length: 4, date: '1"><b>' as unknown as number, longDate: true }],
    });

    expect(holder.querySelector('b')).toBeNull();
    expect(holder.querySelector('a')!.getAttribute('data-unix')).toBe('0');
  });

  it('trims the line break of a code block that is edited', () => {
    const text = 'x\ncode\n';
    expect(html({ text, entities: [{ type: T.Pre, offset: 2, length: 5 }] })).toContain('<pre><code>code</code></pre>');
  });
});

describe('entities from the server with a range that cannot be rendered', () => {
  const MALFORMED: [string, ApiMessageEntity[]][] = [
    ['negative offset', [bold(-5, 8)]],
    ['negative length', [bold(3, -2)]],
    ['zero length', [bold(3, 0)]],
    ['offset beyond the text', [bold(100, 4)]],
    ['length beyond the text', [bold(2, 1000)]],
    ['both beyond the text', [bold(100, 1000), { type: T.Italic, offset: 200, length: 5 }]],
    ['NaN offset', [bold(Number.NaN, 3)]],
    ['NaN length', [bold(2, Number.NaN)]],
    ['Infinity length', [bold(2, Infinity)]],
    ['-Infinity offset', [bold(-Infinity, 3)]],
    ['MAX_SAFE_INTEGER', [bold(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)]],
    ['fractional', [bold(1.5, 2.5)]],
    ['not numbers', [{ type: T.Bold, offset: '1', length: {} } as unknown as ApiMessageEntity]],
    ['missing fields', [{ type: T.Bold } as unknown as ApiMessageEntity]],
    ['overlapping', [bold(0, 6), { type: T.Italic, offset: 3, length: 6 }, { type: T.Strike, offset: 5, length: 6 }]],
    ['unsorted', [bold(8, 2), { type: T.Italic, offset: 0, length: 5 }, { type: T.Strike, offset: 3, length: 4 }]],
    ['duplicated', [bold(0, 5), bold(0, 5), bold(0, 5)]],
    ['unknown type', [{ type: 'MessageEntityNope', offset: 0, length: 5 } as unknown as ApiMessageEntity]],
    ['a type from Object.prototype', [{ type: '__proto__', offset: 0, length: 5 } as unknown as ApiMessageEntity]],
    ['a link without a url', [{ type: T.TextUrl, offset: 0, length: 5 } as ApiMessageEntity]],
    ['a custom emoji without an id', [{ type: T.CustomEmoji, offset: 0, length: 2 } as unknown as ApiMessageEntity]],
    ['a mention name without an id', [{ type: T.MentionName, offset: 0, length: 5 } as ApiMessageEntity]],
  ];

  it.each(MALFORMED)('does not throw on %s, in a message, a preview and as HTML', async (_name, entities) => {
    const text = '0123456789abcdef';
    for (const options of [
      {},
      { asPreview: true },
      { shouldRenderAsHtml: true },
      { highlight: '5', containerId: 'c' },
    ]) {
      expect(() => {
        const result = run({ text, entities, ...options });
        expect(Array.isArray(result)).toBe(true);
      }).not.toThrow();
    }

    const el = await mount({ text, entities });
    // Never more text than tt would show for a sane range: the whole text, a few times at most
    expect(el.textContent.length).toBeLessThanOrEqual(text.length * 4);
    expect(el.textContent).toContain('0');
  });

  it('keeps the whole text for ranges that are out of it', async () => {
    const text = 'hello world';
    for (const entities of [[bold(-3, 2)], [bold(50, 5)], [bold(3, 0)], [bold(3, -4)], [bold(Number.NaN, 2)]]) {
      const el = await mount({ text, entities });
      expect(readable(el)).toBe(text);
    }
  });

  it('clamps a range that ends beyond the text', async () => {
    const el = await mount({ text: 'hello world', entities: [bold(6, 500)] });

    expect(el.querySelector('strong')!.textContent).toBe('world');
    expect(readable(el)).toBe('hello world');
  });

  it('does not throw when a range splits a surrogate pair', async () => {
    const text = 'a😀b😀c';
    for (const [offset, length] of [
      [2, 2],
      [1, 1],
      [1, 2],
      [3, 1],
      [0, 2],
    ]) {
      const entities = [bold(offset, length)];
      for (const options of [{}, { asPreview: true }, { shouldRenderAsHtml: true }]) {
        expect(() => run({ text, entities, ...options })).not.toThrow();
      }
      const el = await mount({ text, entities });
      expect(el.isConnected).toBe(true);
    }

    // A link whose text is split in the middle of a pair is still a safe link
    const el = await mount({
      text: '😀😀',
      entities: [
        { type: T.Url, offset: 1, length: 2 },
        { type: T.TextUrl, offset: 0, length: 3, url: '😀\uD83D' },
      ],
    });
    for (const anchor of Array.from(el.querySelectorAll('a[href]'))) {
      expect(['http:', 'https:']).toContain(resolveScheme(anchor.getAttribute('href')!));
    }
  });

  it('survives an empty text and a huge text', async () => {
    expect(renderTextWithEntities({ text: '' })).toEqual([]);
    expect(renderTextWithEntities({ text: '', entities: [bold(0, 3)] })).toEqual([]);
    const huge = 'x'.repeat(200_000);
    const el = await mount({ text: huge, entities: [bold(5, 100_000)] });
    expect(el.textContent).toHaveLength(huge.length);
  });

  it('nests overlapping entities like tt', async () => {
    const text = 'abcdefghij';
    const el = await mount({
      text,
      entities: [bold(0, 10), { type: T.Italic, offset: 2, length: 3 }, { type: T.Strike, offset: 3, length: 1 }],
    });

    expect(readable(el)).toBe(text);
    expect(el.querySelector('strong em')!.textContent).toBe('cde');
    expect(el.querySelector('strong em del')!.textContent).toBe('d');
  });

  it('renders nested entities, with the text around them', async () => {
    const text = 'start bold-italic-link end';
    const el = await mount({
      text,
      entities: [
        entity(T.Bold, 'bold-italic-link', text),
        entity(T.Italic, 'italic-link', text),
        entity(T.TextUrl, 'link', text, { url: 'https://example.com' }),
      ],
    });

    expect(readable(el)).toBe(text);
    expect(el.querySelector('strong em a')!.textContent).toBe('link');
    expect(el.querySelector('strong')!.textContent).toBe('bold-italic-link');
    expect(readable(el.firstChild!)).toBe('start ');
    // The text after an entity is split in the indentation (a non-breaking space) and the rest
    expect(readable(el.lastChild!.previousSibling!) + readable(el.lastChild!)).toBe(' end');
  });

  it('renders deep nesting only up to the cap, as plain text below', async () => {
    const depth = 200;
    const text = 'x'.repeat(depth + 2);
    const entities = Array.from({ length: depth }, (_, i) => bold(i, depth + 2 - i));
    const el = await mount({ text, entities });

    expect(readable(el)).toBe(text);
    expect(el.querySelectorAll('strong').length).toBeLessThanOrEqual(40);
  });
});

describe('a message with a very large number of entities', () => {
  it('renders 5000 flat entities in bounded time, the ones over the cap as plain text', async () => {
    const count = 5000;
    const text = 'ab '.repeat(count);
    const entities = Array.from({ length: count }, (_, i) => bold(i * 3, 2));

    const start = performance.now();
    const el = await mount({ text, entities });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);
    expect(el.querySelectorAll('strong').length).toBeLessThanOrEqual(2048);
    expect(el.querySelectorAll('strong').length).toBeGreaterThan(1000);
    expect(readable(el)).toBe(text);
  });

  it('renders 5000 entities that all contain each other in bounded time', () => {
    const count = 5000;
    const text = 'z'.repeat(count + 10);
    const entities = Array.from({ length: count }, (_, i) => ({
      type: i % 2 ? T.Bold : T.Italic,
      offset: i,
      length: count + 10 - i,
    }));

    const start = performance.now();
    const result = run({ text, entities });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);
    expect(result.length).toBeGreaterThan(0);
  });

  it('renders 5000 entities that start at one offset in bounded time', () => {
    const text = 'z'.repeat(40);
    const entities = Array.from({ length: 5000 }, (_, i) => bold(0, 1 + (i % 40)));

    const start = performance.now();
    run({ text, entities });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);
  });

  it('renders 5000 overlapping spoilers of a preview without text left in the clear', () => {
    const text = 'secret '.repeat(100);
    const entities = Array.from({ length: 5000 }, (_, i) => spoiler((i * 7) % 700, 7));

    const start = performance.now();
    const result = run({ text, entities, asPreview: true });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);
    expect(result.length).toBeGreaterThan(0);
  });

  it('renders the entities of the HTML string path in bounded time', () => {
    const count = 5000;
    const text = 'ab '.repeat(count);
    const entities = Array.from({ length: count }, (_, i) => bold(i * 3, 2));

    const start = performance.now();
    const result = renderTextWithEntities({ text, entities, shouldRenderAsHtml: true });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('insertTextEntity', () => {
  it('keeps the entities that do not overlap the new one and sorts by offset, longer first', () => {
    const result = insertTextEntity([bold(8, 2), bold(0, 3)], { type: T.QuoteFocus, offset: 4, length: 2 });

    expect(result.map(({ type, offset, length }) => [type, offset, length])).toEqual([
      [T.Bold, 0, 3],
      [T.QuoteFocus, 4, 2],
      [T.Bold, 8, 2],
    ]);
  });

  it('keeps an entity that contains the new one', () => {
    const result = insertTextEntity([bold(0, 10)], { type: T.QuoteFocus, offset: 4, length: 2 });

    expect(result.map(({ type }) => type)).toContain(T.QuoteFocus);
    expect(result.some((item) => item.type === T.Bold)).toBe(true);
  });
});

// tt's algorithm of the entity tree as it was (it takes time exponential in the nesting, so only for a few entities)
describe('the entity tree', () => {
  type Organized = { entity: ApiMessageEntity; organizedIndexes: Set<number>; nestedEntities: Organized[] };

  function organizeEntityTt(
    item: ApiMessageEntity,
    index: number,
    entities: ApiMessageEntity[],
    organizedEntityIndexes: Set<number>,
  ): Organized | undefined {
    const { offset, length } = item;
    const organizedIndexes = new Set([index]);

    if (organizedEntityIndexes.has(index)) return undefined;

    const nestedEntities: Organized[] = [];
    const parsedNestedEntities = entities
      .filter((e, i) => i > index && e.offset >= offset && e.offset < offset + length)
      .map((e) => organizeEntityTt(e, entities.indexOf(e), entities, organizedEntityIndexes))
      .filter(Boolean) as Organized[];

    parsedNestedEntities.forEach((parsedEntity) => {
      let isChanged = false;

      parsedEntity.organizedIndexes.forEach((organizedIndex) => {
        if (!isChanged && !organizedIndexes.has(organizedIndex)) isChanged = true;
        organizedIndexes.add(organizedIndex);
      });

      if (isChanged) nestedEntities.push(parsedEntity);
    });

    return { entity: item, organizedIndexes, nestedEntities };
  }

  function organizeEntitiesTt(entities: ApiMessageEntity[]) {
    const organizedEntityIndexes = new Set<number>();
    const organizedEntities: Organized[] = [];

    entities.forEach((item, index) => {
      if (organizedEntityIndexes.has(index)) return;

      const organizedEntity = organizeEntityTt(item, index, entities, organizedEntityIndexes);
      if (organizedEntity) {
        organizedEntity.organizedIndexes.forEach((organizedIndex) => organizedEntityIndexes.add(organizedIndex));
        organizedEntities.push(organizedEntity);
      }
    });

    return organizedEntities;
  }

  const shape = (list: Organized[], all: ApiMessageEntity[]): unknown =>
    list.map((organized) => [all.indexOf(organized.entity), shape(organized.nestedEntities, all)]);

  it('is the tree of tt for sorted, unsorted and overlapping entities', () => {
    let seed = 12345;
    const random = (limit: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % limit;
    };

    for (let iteration = 0; iteration < 5000; iteration++) {
      const entities = Array.from({ length: 1 + random(9) }, () => bold(random(12), 1 + random(8)));
      if (random(2)) entities.sort((a, b) => a.offset - b.offset || b.length - a.length);

      expect(shape(organizeEntities(entities), entities), JSON.stringify(entities)).toEqual(
        shape(organizeEntitiesTt(entities), entities),
      );
    }
  });

  it('is not an endless recursion for an entity object that is in the list twice', () => {
    const same = bold(0, 10);
    const entities = [same, bold(2, 3), same];

    expect(() => organizeEntities(entities)).not.toThrow();
  });
});
