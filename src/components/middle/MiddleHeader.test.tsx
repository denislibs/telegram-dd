// Original test (not in telegram-tt): the header of an open chat through the store: title, status, typing, the back
// button, the slide of a second message list and the switch of the chat.
import '../../global/actions/all';

import { render } from 'frameact/dom';
import { afterEach, describe, expect, it } from 'vitest';
import { getGlobal, setGlobal } from '../../global';

import type { ApiChat, ApiTypingStatus, ApiUser } from '../../api/types';
import type { GlobalState, TabState } from '../../global/types';
import type { MessageListType, ThreadId } from '../../types';
import { MAIN_THREAD_ID } from '../../api/types';

import { container, useDomHarness } from '../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../global/initialState';
import { addChats } from '../../global/reducers/chats';
import { addMessages } from '../../global/reducers/messages';
import { updateTabState } from '../../global/reducers/tabs';
import { replaceThreadLocalStateParam, updateThreadInfo } from '../../global/reducers/threads';
import { addUsers } from '../../global/reducers/users';
import { getCurrentTabId } from '../../util/establishMultitabRole';
import { cloneDeep } from '../../util/iteratees';

import MiddleHeader from './MiddleHeader';

const tabId = getCurrentTabId();

// jsdom has no ResizeObserver (the full name title observes its size with one)
class ResizeObserverStub {
  observe = () => undefined;

  unobserve = () => undefined;

  disconnect = () => undefined;
}
globalThis.ResizeObserver = ResizeObserverStub;
const SELF_ID = '1000';
const ANN_ID = '2000';
const BOB_ID = '3000';

const user = (id: string, firstName: string) =>
  ({ id, firstName, type: 'userTypeRegular', isMin: false, phoneNumber: '' }) as unknown as ApiUser;
const privateChat = (id: string) => ({ id, title: `Chat ${id}`, type: 'chatTypePrivate', unreadCount: 0 }) as ApiChat;

function seed(messageLists: TabState['messageLists']) {
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId, messageLists };
  let global: GlobalState = { ...cloneDeep(INITIAL_GLOBAL_STATE), currentUserId: SELF_ID, byTabId: { [tabId]: tab } };
  global = addUsers(global, {
    [SELF_ID]: user(SELF_ID, 'Me'),
    [ANN_ID]: user(ANN_ID, 'Ann'),
    [BOB_ID]: user(BOB_ID, 'Bob'),
  });
  global = addChats(global, { [ANN_ID]: privateChat(ANN_ID), [BOB_ID]: privateChat(BOB_ID) });
  // the messages of the chats are loaded: the status line is the status, not "Updating"
  global = addMessages(global, [
    { id: 1, chatId: ANN_ID, date: 1_700_000_000, isOutgoing: false, content: { text: { text: 'hi' } } },
    { id: 1, chatId: BOB_ID, date: 1_700_000_000, isOutgoing: false, content: { text: { text: 'hi' } } },
  ]);
  // the thread must exist for its local state (typing) to be stored
  global = updateThreadInfo(global, { chatId: ANN_ID, threadId: MAIN_THREAD_ID });
  global = updateThreadInfo(global, { chatId: BOB_ID, threadId: MAIN_THREAD_ID });
  setGlobal(global, { forceOutdated: true });
}

const noop = () => undefined;

function Harness(props: {
  chatId: string;
  threadId?: ThreadId;
  messageListType?: MessageListType;
  isMobile?: boolean;
}) {
  return (
    <MiddleHeader
      chatId={props.chatId}
      threadId={props.threadId ?? MAIN_THREAD_ID}
      messageListType={props.messageListType ?? 'thread'}
      isMobile={props.isMobile}
      getCurrentPinnedIndex={() => 0}
      getLoadingPinnedId={() => undefined}
      onFocusPinnedMessage={noop}
    />
  );
}

describe('MiddleHeader', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  const frames = async () => {
    await harness.frame();
    await harness.frame();
    await harness.frame();
  };

  async function mount(props: Parameters<typeof Harness>[0]) {
    const el = container();
    dispose = render(() => <Harness {...props} />, el);
    await frames();
    return el;
  }

  it('shows the title of the chat and no back button on a wide screen', async () => {
    seed([{ chatId: ANN_ID, threadId: MAIN_THREAD_ID, type: 'thread' }]);
    const el = await mount({ chatId: ANN_ID });

    expect(el.querySelector('.MiddleHeader')).not.toBeNull();
    expect(el.querySelector('.chat-info-wrapper .ChatInfo')).not.toBeNull();
    expect(el.querySelector('.fullName')!.textContent).toContain('Ann');
    expect(el.querySelector('.header-tools .HeaderActions')).not.toBeNull();
  });

  it('shows what the other party types, and the status again after it stops', async () => {
    seed([{ chatId: ANN_ID, threadId: MAIN_THREAD_ID, type: 'thread' }]);
    const el = await mount({ chatId: ANN_ID });
    expect(el.querySelector('.ChatInfo .info')!.innerHTML).not.toMatch(/typing/i);
    expect(el.querySelector('.ChatInfo .status')).not.toBeNull();

    const typing: Record<string, ApiTypingStatus> = { [ANN_ID]: { type: 'typing', timestamp: Date.now() } };
    setGlobal(replaceThreadLocalStateParam(getGlobal(), ANN_ID, MAIN_THREAD_ID, 'typingStatusByPeerId', typing));
    await frames();
    expect(el.querySelector('.ChatInfo .info')!.innerHTML).toMatch(/typing/i);

    setGlobal(replaceThreadLocalStateParam(getGlobal(), ANN_ID, MAIN_THREAD_ID, 'typingStatusByPeerId', undefined));
    await frames();
    expect(el.querySelector('.ChatInfo .info')!.innerHTML).not.toMatch(/typing/i);
  });

  it('follows the chat: no title of the previous chat remains', async () => {
    seed([{ chatId: ANN_ID, threadId: MAIN_THREAD_ID, type: 'thread' }]);
    const el = container();
    const { createSignal } = await import('frameact');
    const [chatId, setChatId] = createSignal(ANN_ID);
    dispose = render(() => <Harness chatId={chatId()} />, el);
    await frames();
    expect(el.querySelector('.fullName')!.textContent).toContain('Ann');

    setGlobal(
      updateTabState(
        getGlobal(),
        { messageLists: [{ chatId: BOB_ID, threadId: MAIN_THREAD_ID, type: 'thread' }] },
        tabId,
      ),
    );
    setChatId(BOB_ID);
    await frames();

    const titles = Array.from(el.querySelectorAll('.fullName')).map((node) => node.textContent);
    expect(titles).toHaveLength(1);
    expect(titles[0]).toContain('Bob');
    expect(el.textContent).not.toContain('Ann');
  });

  it('keeps the chat info in the slide that leaves while a second message list slides in', async () => {
    seed([{ chatId: ANN_ID, threadId: MAIN_THREAD_ID, type: 'thread' }]);
    const el = container();
    const { createSignal } = await import('frameact');
    const [messageListType, setMessageListType] = createSignal<MessageListType>('thread');
    dispose = render(() => <Harness chatId={ANN_ID} messageListType={messageListType()} />, el);
    await frames();
    expect(el.querySelectorAll('.Transition_slide')).toHaveLength(1);

    setGlobal(
      updateTabState(
        getGlobal(),
        {
          messageLists: [
            { chatId: ANN_ID, threadId: MAIN_THREAD_ID, type: 'thread' },
            { chatId: ANN_ID, threadId: MAIN_THREAD_ID, type: 'pinned' },
          ],
        },
        tabId,
      ),
    );
    setMessageListType('pinned');
    await frames();

    const slides = Array.from(el.querySelectorAll('.Transition_slide'));
    expect(slides).toHaveLength(2);
    // the slide of the first list still shows the chat, the new one a back button and a title
    expect(slides[0].querySelector('.fullName')!.textContent).toContain('Ann');
    expect(slides[0].querySelector('h3.fullName')).not.toBeNull();
    expect(slides[1].querySelector('.chat-info-wrapper')).toBeNull();
    expect(slides[1].querySelector('h3')!.textContent).not.toContain('Ann');
    const back = slides[1].querySelector('.back-button button')!;
    expect(back.getAttribute('aria-label')).toBe('Back');
  });
});
