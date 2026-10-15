// Original test (not in telegram-tt): the reply / quote header of a message for a reply to a text message, to a sticker,
// to a message that is not loaded and for a quote.
import { delegateEvents, render } from 'frameact/dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setGlobal } from '../../../global';

import type { ApiMessage, ApiMessageReplyInfo, ApiPeer, ApiSticker } from '../../../api/types';
import type { TabState } from '../../../global/types';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';

import EmbeddedMessage from './EmbeddedMessage';

const tabId = getCurrentTabId();

const SENDER = {
  id: '100',
  isMin: false,
  type: 'userTypeRegular',
  firstName: 'Ada',
  lastName: 'Lovelace',
  phoneNumber: '',
} as unknown as ApiPeer;

function buildMessage(content: ApiMessage['content'], extra?: Partial<ApiMessage>): ApiMessage {
  return { id: 7, chatId: '100', date: 1, isOutgoing: false, senderId: '100', content, ...extra };
}

const STICKER = {
  mediaType: 'sticker',
  id: '55',
  stickerSetInfo: { shortName: 'set' },
  emoji: '🙂',
  isLottie: false,
  isVideo: false,
  width: 512,
  height: 512,
} as unknown as ApiSticker;

describe('EmbeddedMessage', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;

  beforeAll(() => {
    const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
    setGlobal({ ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: tab } }, { forceOutdated: true });
  });

  // The harness clears the delegated events after each test.
  beforeEach(() => {
    delegateEvents(['click']);
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  async function mount(jsx: () => any) {
    const el = container();
    dispose = render(jsx, el);
    await harness.frame();
    await harness.frame();
    return el;
  }

  it('shows the text of the replied message and the title of its sender', async () => {
    const message = buildMessage({ text: { text: 'Hello there' } });
    const replyInfo: ApiMessageReplyInfo = { type: 'message', replyToMsgId: 7 };
    const el = await mount(() => <EmbeddedMessage message={message} replyInfo={replyInfo} sender={SENDER} />);

    const root = el.querySelector<HTMLElement>('.EmbeddedMessage');
    expect(root).not.toBeNull();
    expect(root!.classList.contains('is-quote')).toBe(false);
    expect(root!.classList.contains('with-thumb')).toBe(false);
    expect(el.querySelector('.embedded-text-wrapper')!.textContent).toContain('Hello there');
    expect(el.querySelector('.embedded-sender')!.textContent).toContain('Ada');
  });

  it('describes a replied sticker by its emoji and kind, without a media preview', async () => {
    const message = buildMessage({ sticker: STICKER });
    const replyInfo: ApiMessageReplyInfo = { type: 'message', replyToMsgId: 7 };
    const el = await mount(() => <EmbeddedMessage message={message} replyInfo={replyInfo} sender={SENDER} />);

    const wrapper = el.querySelector('.embedded-text-wrapper')!;
    // The language pack is not loaded in the test: the description is the key of the "Sticker" string.
    expect(wrapper.textContent).toContain('Sticker');
    // The emoji is rendered as an image with the character as its alt text.
    expect(wrapper.querySelector('img')?.getAttribute('alt') ?? wrapper.textContent).toContain('🙂');
    expect(el.querySelector('.embedded-thumb')).toBeNull();
  });

  it('keeps a stable, empty header for a replied message that is not loaded', async () => {
    const replyInfo: ApiMessageReplyInfo = { type: 'message', replyToMsgId: 7 };
    const el = await mount(() => <EmbeddedMessage replyInfo={replyInfo} />);

    expect(el.querySelector('.embedded-text-wrapper')!.textContent).toBe(' ');
    // The sender subtree keeps its element structure while the peer is unknown (a bare text node would shift scrollTop).
    expect(el.querySelector('.embedded-sender-wrapper .embedded-sender')!.textContent).toBe(' ');
  });

  it('uses the custom text of a message that is not loaded, as the composer does', async () => {
    const el = await mount(() => <EmbeddedMessage customText="Deleted message" title="Reply" />);

    expect(el.querySelector('.embedded-text-wrapper')!.textContent).toBe('Deleted message');
    expect(el.querySelector('.message-title')!.textContent).toContain('Reply');
  });

  it('renders the quoted text with the quote classes', async () => {
    const message = buildMessage({ text: { text: 'The whole message, long' } });
    const replyInfo: ApiMessageReplyInfo = {
      type: 'message',
      replyToMsgId: 7,
      isQuote: true,
      quoteText: { text: 'whole message' },
    };
    const el = await mount(() => <EmbeddedMessage message={message} replyInfo={replyInfo} sender={SENDER} />);

    const root = el.querySelector<HTMLElement>('.EmbeddedMessage')!;
    expect(root.classList.contains('is-quote')).toBe(true);
    const wrapper = el.querySelector('.embedded-text-wrapper')!;
    expect(wrapper.classList.contains('multiline')).toBe(true);
    expect(wrapper.textContent).toBe('whole message');
  });

  it('shows the hidden user name of a reply to a forwarded message and the forward origin', async () => {
    const replyInfo: ApiMessageReplyInfo = {
      type: 'message',
      replyToMsgId: 7,
      replyFrom: {
        date: 1,
        isImported: false,
        hiddenUserName: 'Hidden Person',
      } as unknown as ApiMessageReplyInfo['replyFrom'],
    };
    const message = buildMessage({ text: { text: 'x' } });
    const el = await mount(() => <EmbeddedMessage message={message} replyInfo={replyInfo} />);

    expect(el.querySelector('.embedded-sender')!.textContent).toContain('Hidden Person');
  });

  it('calls the current click handler of the parent', async () => {
    const message = buildMessage({ text: { text: 'Click me' } });
    const calls: string[] = [];
    const el = await mount(() => (
      <EmbeddedMessage message={message} sender={SENDER} onClick={() => calls.push('click')} />
    ));

    el.querySelector<HTMLElement>('.EmbeddedMessage')!.click();
    expect(calls).toEqual(['click']);
  });
});
