// Original test (not in telegram-tt): the accessor contract of the message hooks (porting guide §4.2).
import { createSignal, flushSync } from 'frameact';
import { render } from 'frameact/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiMessage } from '../../../../api/types';
import type { ChatTranslatedMessages } from '../../../../types';

import { container, useDomHarness } from '../../../../lib/kit/testing/dom';
import { flushMicrotasks } from '../../../../lib/kit/testing/micro';
import useDetectChatLanguage from './useDetectChatLanguage';
import useFluidBackgroundFilter from './useFluidBackgroundFilter';
import useInnerHandlers from './useInnerHandlers';
import useMessageTranslation from './useMessageTranslation';
import useOuterHandlers from './useOuterHandlers';
import useOverlayPosition from './useOverlayPosition';

import useTextLanguage from '../../../../hooks/useTextLanguage';

const actions = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>);
const detectLanguage = vi.hoisted(() => vi.fn());

vi.mock('../../../../global', () => ({
  getActions: () => new Proxy(actions, { get: (target, key: string) => (target[key] ||= vi.fn()) }),
}));
vi.mock('../../../../util/languageDetection', () => ({ detectLanguage }));

const harness = useDomHarness();
const callsOf = (name: string) => actions[name]?.mock.calls.length ?? 0;

const message = (id: number, text: string, extra: Partial<ApiMessage> = {}) => ({
  id,
  chatId: '1',
  date: 1,
  isOutgoing: false,
  content: { text: { text } },
  ...extra,
});

function mountHook(setup: () => void) {
  const dispose = render(() => {
    setup();
    return <div />;
  }, container());
  flushSync();
  return dispose;
}

beforeEach(() => {
  for (const key of Object.keys(actions)) delete actions[key];
  detectLanguage.mockReset();
  document.querySelectorAll('.svg-definitions').forEach((node) => node.remove());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTextLanguage', () => {
  it('detects the language of the text, waits for a ready list, ignores a disabled hook and a stale answer', async () => {
    const resolvers: Array<(language: string | undefined) => void> = [];
    detectLanguage.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    const [text, setText] = createSignal<string | undefined>('hello');
    const [isDisabled, setIsDisabled] = createSignal(true);
    const [isReady, setIsReady] = createSignal(false);
    let language!: () => string | undefined;
    const dispose = mountHook(() => {
      language = useTextLanguage(text, isDisabled, isReady);
    });

    expect(detectLanguage).not.toHaveBeenCalled();
    setIsDisabled(false);
    flushSync();
    expect(detectLanguage).not.toHaveBeenCalled(); // the list is not ready yet

    setIsReady(true);
    flushSync();
    expect(detectLanguage).toHaveBeenCalledWith('hello');

    // the text changes before the first answer comes: the first answer is dropped
    setText('hallo');
    flushSync();
    expect(detectLanguage).toHaveBeenCalledWith('hallo');
    resolvers[0]('en');
    await flushMicrotasks();
    expect(language()).toBeUndefined();
    resolvers[1]('de');
    await flushMicrotasks();
    expect(language()).toBe('de');

    // an empty text resets the language
    setText(undefined);
    flushSync();
    expect(language()).toBeUndefined();
    dispose();
  });

  it('a detector that fails leaves the language undefined without an unhandled rejection', async () => {
    detectLanguage.mockRejectedValue(new Error('worker is gone'));
    let language!: () => string | undefined;
    const dispose = mountHook(() => {
      language = useTextLanguage('hello');
    });
    await flushMicrotasks();
    expect(language()).toBeUndefined();
    dispose();
  });
});

describe('useDetectChatLanguage', () => {
  it('reports the most frequent language of a chat once enough messages are processed, and waits for the list', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    const [isReady, setIsReady] = createSignal(false);
    const disposers: Array<() => void> = [];
    for (let id = 1; id <= 9; id++) {
      const [language] = createSignal<string | undefined>(id === 9 ? undefined : 'ru');
      disposers.push(
        mountHook(() => {
          useDetectChatLanguage(message(id, `text number ${id}`), language, false, isReady);
        }),
      );
    }

    vi.advanceTimersByTime(2000);
    expect(callsOf('updateChatDetectedLanguage')).toBe(0);

    setIsReady(true);
    flushSync();
    vi.advanceTimersByTime(2000);
    expect(actions.updateChatDetectedLanguage).toHaveBeenCalledWith({ chatId: '1', detectedLanguage: 'ru' });
    disposers.forEach((dispose) => dispose());
  });
});

describe('useMessageTranslation', () => {
  it('requests the translation of a message, then follows the translation in the chat state', () => {
    const [translations, setTranslations] = createSignal<ChatTranslatedMessages | undefined>(undefined);
    let result!: ReturnType<typeof useMessageTranslation>;
    const dispose = mountHook(() => {
      result = useMessageTranslation(translations, '1', 7, 'de');
    });

    expect(actions.markMessagesTranslationPending).toHaveBeenCalledWith({
      chatId: '1',
      messageIds: [7],
      toLanguageCode: 'de',
      tone: undefined,
    });
    expect(actions.translateMessages).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: '1', toLanguageCode: 'de' }),
    );
    expect(result.translatedText()).toBeUndefined();
    expect(result.isPending()).toBeUndefined();

    setTranslations({
      byLangCode: { de_neutral: { 7: { isPending: false, text: { text: 'Hallo' } } } },
    });
    flushSync();
    expect(result.translatedText()).toEqual({ text: 'Hallo' });
    expect(result.isPending()).toBe(false);
    // the result of the request is not requested again
    expect(actions.markMessagesTranslationPending).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('without a message or a chat it is not pending and has nothing to show', () => {
    let result!: ReturnType<typeof useMessageTranslation>;
    const dispose = mountHook(() => {
      result = useMessageTranslation(undefined, '1', undefined, 'de');
    });
    expect(result.isPending()).toBe(false);
    expect(result.translatedText()).toBeUndefined();
    expect(callsOf('markMessagesTranslationPending')).toBe(0);
    dispose();
  });
});

describe('useFluidBackgroundFilter', () => {
  it('shares one svg filter per color and removes it with its last user', () => {
    const [color, setColor] = createSignal<string | undefined>('#aabbcc');
    let first!: () => string | undefined;
    let second!: () => string | undefined;
    const disposeFirst = mountHook(() => {
      first = useFluidBackgroundFilter(color);
    });
    const disposeSecond = mountHook(() => {
      second = useFluidBackgroundFilter('#aabbcc', true);
    });
    return harness.frame().then(async () => {
      await harness.frame();
      expect(first()).toBe('filter: url(#fluid-background-filter-aabbcc);');
      expect(second()).toBe('url(#fluid-background-filter-aabbcc)');
      const filters = document.querySelectorAll('filter#fluid-background-filter-aabbcc');
      expect(filters).toHaveLength(1);
      expect(filters[0].namespaceURI).toBe('http://www.w3.org/2000/svg');

      disposeSecond();
      await harness.frame();
      expect(document.querySelectorAll('filter#fluid-background-filter-aabbcc')).toHaveLength(1);

      setColor(undefined);
      flushSync();
      expect(first()).toBeUndefined();
      await harness.frame();
      expect(document.querySelectorAll('filter#fluid-background-filter-aabbcc')).toHaveLength(0);
      disposeFirst();
    });
  });
});

describe('useInnerHandlers', () => {
  it('reads the message at click time', () => {
    const [current, setCurrent] = createSignal(
      message(5, 'a', { replyInfo: { type: 'message', replyToMsgId: 2 } as ApiMessage['replyInfo'] }),
    );
    let handlers!: ReturnType<typeof useInnerHandlers>;
    const dispose = mountHook(() => {
      handlers = useInnerHandlers({
        lang: ((key: string) => key) as never,
        selectMessage: () => {},
        message: current,
        chatId: '1',
        threadId: -1,
        isInDocumentGroup: false,
      });
    });

    handlers.handleReplyClick();
    expect(actions.focusMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ chatId: '1', messageId: 2, replyMessageId: 5 }),
    );

    setCurrent(message(6, 'b', { replyInfo: { type: 'message', replyToMsgId: 3 } as ApiMessage['replyInfo'] }));
    handlers.handleReplyClick();
    expect(actions.focusMessage).toHaveBeenLastCalledWith(expect.objectContaining({ messageId: 3, replyMessageId: 6 }));

    handlers.handleForward();
    expect(actions.openForwardMenu).toHaveBeenLastCalledWith({ fromChatId: '1', messageIds: [6] });
    dispose();
  });

  it('a reply to a private chat shows a notification instead of focusing', () => {
    let handlers!: ReturnType<typeof useInnerHandlers>;
    const dispose = mountHook(() => {
      handlers = useInnerHandlers({
        lang: ((key: string) => key) as never,
        selectMessage: () => {},
        message: message(5, 'a', { replyInfo: { type: 'message', replyToMsgId: 2 } as ApiMessage['replyInfo'] }),
        chatId: '1',
        threadId: -1,
        isInDocumentGroup: false,
        isReplyPrivate: () => true,
      });
    });
    handlers.handleReplyClick();
    expect(actions.showNotification).toHaveBeenCalledWith({ message: 'ReplyPrivate' });
    expect(callsOf('focusMessage')).toBe(0);
    dispose();
  });
});

describe('useOuterHandlers', () => {
  function mountOuter(options: {
    isInSelectMode?: () => boolean;
    isProtected?: () => boolean;
    canReply?: () => boolean;
  }) {
    const selectMessage = vi.fn();
    const onContextMenu = vi.fn();
    let handlers!: ReturnType<typeof useOuterHandlers>;
    const dispose = mountHook(() => {
      handlers = useOuterHandlers(
        selectMessage,
        () => undefined,
        9,
        options.isInSelectMode ?? (() => false),
        options.canReply ?? (() => true),
        options.isProtected ?? (() => false),
        onContextMenu,
        vi.fn(),
        '1',
        () => false,
        () => undefined,
        () => false,
      );
    });
    return { handlers, selectMessage, onContextMenu, dispose };
  }

  it('a click selects the message only in the select mode; the mode is read when the event arrives', () => {
    const [isInSelectMode, setIsInSelectMode] = createSignal(false);
    const { handlers, selectMessage, dispose } = mountOuter({ isInSelectMode });
    const event = { stopPropagation: vi.fn() } as never;

    handlers.handleClick(event);
    expect(selectMessage).not.toHaveBeenCalled();
    setIsInSelectMode(true);
    handlers.handleClick(event);
    expect(selectMessage).toHaveBeenCalledWith(event);
    dispose();
  });

  it('a double click replies; the context menu is delegated, or stopped for a protected message in the select mode', () => {
    const [isInSelectMode, setIsInSelectMode] = createSignal(false);
    const { handlers, onContextMenu, dispose } = mountOuter({ isInSelectMode, isProtected: () => true });

    handlers.handleDoubleClick();
    expect(actions.updateDraftReplyInfo).toHaveBeenCalledWith(expect.objectContaining({ replyToMsgId: 9 }));

    const event = new MouseEvent('contextmenu', { cancelable: true }) as never;
    handlers.handleContextMenu(event);
    expect(onContextMenu).toHaveBeenCalledWith(event);

    setIsInSelectMode(true);
    const stopped = new MouseEvent('contextmenu', { cancelable: true });
    handlers.handleContextMenu(stopped);
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(stopped.defaultPrevented).toBe(true);
    dispose();
  });

  it('sends the default reaction of the message', () => {
    const { handlers, dispose } = mountOuter({});
    handlers.handleSendQuickReaction({ stopPropagation: vi.fn() });
    expect(actions.sendDefaultReaction).toHaveBeenCalledWith({ chatId: '1', messageId: 9 });
    dispose();
  });
});

describe('useOverlayPosition', () => {
  const rect = (values: Partial<DOMRect>) => () =>
    ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, ...values }) as DOMRect;

  it('places the overlay next to the anchor in the mutate phase, mirrored or not, and does nothing while disabled', async () => {
    const list = container();
    list.className = 'MessageList';
    const anchor = document.createElement('div');
    const overlay = document.createElement('div');
    list.append(anchor, overlay);
    anchor.getBoundingClientRect = rect({ top: 100, height: 20, bottom: 120, left: 50, right: 80 });
    overlay.getBoundingClientRect = rect({ height: 40 });
    const [isDisabled, setIsDisabled] = createSignal(true);
    const [isMirrored, setIsMirrored] = createSignal(false);

    const dispose = mountHook(() => {
      useOverlayPosition({ anchorRef: () => anchor, overlayRef: () => overlay, isMirrored, isDisabled });
    });
    await harness.frame();
    await harness.frame();
    expect(overlay.style.top).toBe('');

    setIsDisabled(false);
    flushSync();
    await harness.frame();
    await harness.frame();
    expect(overlay.style.top).toBe('90px'); // the center of the anchor minus half of the overlay
    expect(overlay.style.right).toBe(`${window.innerWidth - 80 - 16}px`);
    expect(overlay.style.left).toBe('');

    // the position follows the scroll of the message list
    anchor.getBoundingClientRect = rect({ top: 200, height: 20, bottom: 220, left: 50, right: 80 });
    setIsMirrored(true);
    list.dispatchEvent(new Event('scroll'));
    await harness.frame();
    await harness.frame();
    expect(overlay.style.top).toBe('190px');
    expect(overlay.style.left).toBe('34px');
    dispose();
  });
});
