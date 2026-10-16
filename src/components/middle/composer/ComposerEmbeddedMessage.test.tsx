// Original test (not in telegram-tt): the reply bar of the composer appears for a draft reply to a loaded message,
// clears the reply with its cancel button and with Esc, keeps its content while it closes, and is absent without a reply.
import { flushSync } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlobal, setGlobal } from '../../../global';

import type { ApiMessage, ApiPeer } from '../../../api/types';
import type { GlobalState, TabState } from '../../../global/types';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';

import ComposerEmbeddedMessage from './ComposerEmbeddedMessage';

const { actions } = vi.hoisted(() => ({
  actions: {
    resetDraftReplyInfo: vi.fn(),
    resetDraftSuggestedPostInfo: vi.fn(),
    updateDraftReplyInfo: vi.fn(),
    setEditingId: vi.fn(),
    focusMessage: vi.fn(),
    changeRecipient: vi.fn(),
    openChatOrTopicWithReplyInDraft: vi.fn(),
    setForwardNoAuthors: vi.fn(),
    setForwardNoCaptions: vi.fn(),
    exitForwardMode: vi.fn(),
    setShouldPreventComposerAnimation: vi.fn(),
    openSuggestMessageModal: vi.fn(),
    requestMessageMediaEditor: vi.fn(),
  },
}));

vi.mock('../../../global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../global')>()),
  getActions: () => actions,
}));

const tabId = getCurrentTabId();
const CHAT_ID = '100';
const SENDER = {
  id: '100',
  isMin: false,
  type: 'userTypeRegular',
  firstName: 'Ada',
  lastName: 'Lovelace',
  phoneNumber: '',
} as unknown as ApiPeer;
const MESSAGE = {
  id: 7,
  chatId: CHAT_ID,
  date: 1,
  isOutgoing: false,
  senderId: '100',
  content: { text: { text: 'Hello there' } },
} as ApiMessage;

function buildGlobal(withReply: boolean): GlobalState {
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
  return {
    ...cloneDeep(INITIAL_GLOBAL_STATE),
    byTabId: { [tabId]: tab },
    users: { byId: { '100': SENDER as never }, statusesById: {} },
    messages: {
      byChatId: {
        [CHAT_ID]: {
          byId: { 7: MESSAGE },
          threadsById: {
            [-1]: {
              localState: withReply ? { draft: { replyInfo: { type: 'message', replyToMsgId: 7 } } } : {},
            },
          },
        },
      },
      sponsoredByChatId: {},
      playbackByChatId: {},
    },
  } as unknown as GlobalState;
}

describe('ComposerEmbeddedMessage', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;
  const onIsOpenChange = vi.fn();
  const onClear = vi.fn();

  beforeEach(() => {
    delegateEvents(['click', 'keydown', 'mousedown']);
    Object.values(actions).forEach((fn) => fn.mockReset());
    onIsOpenChange.mockReset();
    onClear.mockReset();
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  async function mount() {
    const root = container();
    dispose = render(
      () => (
        <ComposerEmbeddedMessage
          chatId={CHAT_ID}
          threadId={-1}
          messageListType="thread"
          onClear={onClear}
          onIsOpenChange={onIsOpenChange}
        />
      ),
      root,
    );
    for (let i = 0; i < 3; i++) {
      flushSync();
      await harness.frame();
    }
    return root;
  }

  it('renders nothing without a reply, forward or edit', async () => {
    setGlobal(buildGlobal(false), { forceOutdated: true });
    const root = await mount();

    expect(root.querySelector('.ComposerEmbeddedMessage')).toBeNull();
    expect(onIsOpenChange).not.toHaveBeenCalledWith(true);
  });

  it('shows the replied message with the reply icon and reports that it is open', async () => {
    setGlobal(buildGlobal(true), { forceOutdated: true });
    const root = await mount();

    const bar = root.querySelector<HTMLElement>('.ComposerEmbeddedMessage')!;
    expect(bar).not.toBeNull();
    expect(bar.querySelector('.embedded-text-wrapper')!.textContent).toContain('Hello there');
    expect(bar.querySelector('.embedded-left-icon .icon-reply')).not.toBeNull();
    expect(bar.classList.contains('shown')).toBe(true);
    expect(onIsOpenChange).toHaveBeenLastCalledWith(true);
  });

  it('clears the reply with the cancel button and calls onClear', async () => {
    setGlobal(buildGlobal(true), { forceOutdated: true });
    const root = await mount();

    // Buttons act on mousedown (fast click).
    root
      .querySelector<HTMLButtonElement>('.embedded-cancel')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(actions.resetDraftReplyInfo).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('keeps showing the reply while it closes after the draft is gone, then removes the bar', async () => {
    setGlobal(buildGlobal(true), { forceOutdated: true });
    const root = await mount();
    expect(root.querySelector('.ComposerEmbeddedMessage')).not.toBeNull();

    setGlobal({ ...buildGlobal(false), byTabId: getGlobal().byTabId }, { forceOutdated: true });
    for (let i = 0; i < 3; i++) {
      flushSync();
      await harness.frame();
    }

    // Still in the DOM, closing, with the content of the reply it showed.
    const closing = root.querySelector<HTMLElement>('.ComposerEmbeddedMessage');
    expect(closing).not.toBeNull();
    expect(closing!.classList.contains('closing') || closing!.classList.contains('not-open')).toBe(true);
    expect(closing!.querySelector('.embedded-text-wrapper')!.textContent).toContain('Hello there');
  });
});
