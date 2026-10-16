// Original test (not in telegram-tt): `useDraft` against a fake action layer. Typing saves a draft after the debounce,
// switching the chat saves the draft of the chat that is left and restores the one of the chat that is entered, and
// clearing the input (a sent message) clears the draft. The fake `saveDraft`/`clearDraft` write the drafts the way the
// real actions do (they feed the `draft` the hook reads back).
import { createEffect, createMemo, createRoot, createSignal, flushSync, untrack } from 'frameact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiDraft, ApiFormattedText, ApiInputRichMessage } from '../../../../api/types';

import { buildRichMessageFromFormatted } from '../../../ui/textInput/richText';
import useDraft, { type ComposerScope } from './useDraft';

const { actions } = vi.hoisted(() => ({
  actions: {
    saveDraft: vi.fn(),
    clearDraft: vi.fn(),
    loadCustomEmojis: vi.fn(),
  },
}));

vi.mock('../../../../global', () => ({ getActions: () => actions }));
vi.mock('../../../../hooks/window/useBackgroundMode', () => ({ default: () => undefined }));
vi.mock('../../../../hooks/window/useBeforeUnload', () => ({ default: () => undefined }));

const THREAD = -1;
const rich = (text: string) => buildRichMessageFromFormatted({ text });

function setup(initialDrafts: Record<string, ApiDraft> = {}) {
  const [chatId, setChatId] = createSignal('A');
  const [drafts, setDrafts] = createSignal<Record<string, ApiDraft | undefined>>(initialDrafts);
  const [richMessage, setRichMessage] = createSignal<ApiInputRichMessage>(rich(''));

  // The real actions write the draft into the global, which the hook reads back through `draft`.
  actions.saveDraft.mockImplementation(({ chatId: id, text }: { chatId: string; text?: ApiFormattedText }) => {
    setDrafts((current) => ({ ...current, [id]: { text } }));
  });
  actions.clearDraft.mockImplementation(({ chatId: id }: { chatId: string }) => {
    setDrafts((current) => ({ ...current, [id]: undefined }));
  });

  let dispose!: () => void;
  createRoot((disposeRoot) => {
    dispose = disposeRoot;
    const draft = createMemo(() => drafts()[chatId()]);
    let scope: ComposerScope = {
      chatId: untrack(chatId),
      threadId: THREAD,
      type: 'thread',
      isEditing: false,
      isDisabled: false,
    };
    const { saveFor, restoreFor } = useDraft({
      draft,
      chatId,
      threadId: THREAD,
      richMessage,
      replaceRichMessage: (value) => setRichMessage(value ?? rich('')),
      editedMessage: undefined,
      getScope: () => scope,
      syncChat: () => syncChat(),
    });
    // The owner of the chat change is the composer: save the chat being left, reset the input, restore the new chat.
    const syncChat = () => {
      if (chatId() === scope.chatId) return;
      const leftScope = scope;
      const snapshot = untrack(richMessage);
      scope = { ...scope, chatId: chatId() };
      saveFor(leftScope, snapshot);
      setRichMessage(rich(''));
      restoreFor();
    };
    createEffect(() => chatId(), syncChat);
  });

  const settle = () => {
    flushSync();
    flushSync();
  };

  return { chatId, setChatId, drafts, richMessage, setRichMessage, settle, dispose };
}

describe('useDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    actions.saveDraft.mockReset();
    actions.clearDraft.mockReset();
    actions.loadCustomEmojis.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves the typed text after the debounce, and not before', () => {
    const t = setup();
    t.settle();

    t.setRichMessage(rich('hello'));
    t.settle();
    vi.advanceTimersByTime(9000);
    t.settle();
    expect(actions.saveDraft).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2000);
    t.settle();
    expect(actions.saveDraft).toHaveBeenCalledTimes(1);
    expect(actions.saveDraft.mock.calls[0][0]).toMatchObject({
      chatId: 'A',
      threadId: THREAD,
      text: { text: 'hello' },
    });
    t.dispose();
  });

  it('keeps the draft of the chat that is left and restores the draft of the chat that is entered', () => {
    const t = setup({ B: { text: { text: 'draft of B' } } });
    t.settle();

    t.setRichMessage(rich('typed in A'));
    t.settle();
    expect(actions.saveDraft).not.toHaveBeenCalled(); // still inside the debounce

    t.setChatId('B');
    t.settle();

    // The draft of A is saved at once, with the text of A (not the text restored for B) and under A's id.
    const saveCalls = actions.saveDraft.mock.calls.map(([payload]) => payload);
    expect(saveCalls.some((payload) => payload.chatId === 'A' && payload.text?.text === 'typed in A')).toBe(true);
    expect(saveCalls.some((payload) => payload.chatId === 'B')).toBe(false);
    // The editor shows the draft of B.
    expect(t.richMessage()).toEqual(rich('draft of B'));
    expect(t.drafts().A?.text?.text).toBe('typed in A');

    // Restoring is not a user edit: nothing is saved for B after the debounce.
    actions.saveDraft.mockClear();
    vi.advanceTimersByTime(20000);
    t.settle();
    expect(actions.saveDraft).not.toHaveBeenCalled();
    expect(actions.clearDraft).not.toHaveBeenCalled();

    // And switching back restores A.
    t.setChatId('A');
    t.settle();
    expect(t.richMessage()).toEqual(rich('typed in A'));
    t.dispose();
  });

  it('clears the draft when the input is emptied (a message was sent)', () => {
    const t = setup({ A: { text: { text: 'to send' } } });
    t.settle();
    expect(t.richMessage()).toEqual(rich('to send')); // restored on mount

    t.setRichMessage(rich(''));
    t.settle();

    expect(actions.clearDraft).toHaveBeenCalledTimes(1);
    expect(actions.clearDraft.mock.calls[0][0]).toMatchObject({
      chatId: 'A',
      threadId: THREAD,
      shouldKeepReply: true,
      shouldKeepSuggestedPost: true,
    });
    expect(t.drafts().A).toBeUndefined();
    t.dispose();
  });

  it('saves a draft that is waiting for its debounce when the composer goes away, and releases the timer', () => {
    const t = setup();
    t.settle();

    t.setRichMessage(rich('typed, then closed'));
    t.settle();
    expect(actions.saveDraft).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    t.dispose();
    t.settle();

    // The timer would keep the closed composer (and its whole editor) alive until it fired
    expect(vi.getTimerCount()).toBe(0);
    expect(actions.saveDraft).toHaveBeenCalledTimes(1);
    expect(actions.saveDraft.mock.calls[0][0]).toMatchObject({ chatId: 'A', text: { text: 'typed, then closed' } });
  });
});
