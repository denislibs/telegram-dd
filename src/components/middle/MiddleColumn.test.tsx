// Original test (not in telegram-tt): the shell of an open chat through the store: the header, the message list slide,
// the footer, the switch of the chat (one list at a time), the close of the chat and the Escape key.
import '../../global/actions/all';

import { render } from 'frameact/dom';
import { afterEach, describe, expect, it } from 'vitest';
import { getGlobal, setGlobal } from '../../global';

import type { ApiChat, ApiMessage, ApiUser } from '../../api/types';
import type { GlobalState, TabState } from '../../global/types';
import { MAIN_THREAD_ID } from '../../api/types';

import { container, useDomHarness } from '../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../global/initialState';
import { addChats } from '../../global/reducers/chats';
import { addMessages } from '../../global/reducers/messages';
import { updateTabState } from '../../global/reducers/tabs';
import { updateThreadInfo } from '../../global/reducers/threads';
import { addUsers } from '../../global/reducers/users';
import { getCurrentTabId } from '../../util/establishMultitabRole';
import { cloneDeep } from '../../util/iteratees';

import MiddleColumn from './MiddleColumn';

const tabId = getCurrentTabId();

// jsdom has no ResizeObserver (the footer height is observed with one)
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
const textMessage = (chatId: string, id: number, text: string) =>
  ({
    id,
    chatId,
    date: 1_700_000_000 + id,
    isOutgoing: false,
    senderId: chatId,
    content: { text: { text } },
  }) as ApiMessage;

function seed(openChatId?: string) {
  const tab: TabState = {
    ...cloneDeep(INITIAL_TAB_STATE),
    id: tabId,
    messageLists: openChatId ? [{ chatId: openChatId, threadId: MAIN_THREAD_ID, type: 'thread' }] : [],
  };
  let global: GlobalState = { ...cloneDeep(INITIAL_GLOBAL_STATE), currentUserId: SELF_ID, byTabId: { [tabId]: tab } };
  global = addUsers(global, {
    [SELF_ID]: user(SELF_ID, 'Me'),
    [ANN_ID]: user(ANN_ID, 'Ann'),
    [BOB_ID]: user(BOB_ID, 'Bob'),
  });
  global = addChats(global, { [ANN_ID]: privateChat(ANN_ID), [BOB_ID]: privateChat(BOB_ID) });
  global = addMessages(global, [textMessage(ANN_ID, 1, 'Hello from Ann'), textMessage(BOB_ID, 1, 'Hello from Bob')]);
  global = updateThreadInfo(global, { chatId: ANN_ID, threadId: MAIN_THREAD_ID });
  global = updateThreadInfo(global, { chatId: BOB_ID, threadId: MAIN_THREAD_ID });
  setGlobal(global, { forceOutdated: true });
}

function openList(chatId?: string) {
  setGlobal(
    updateTabState(
      getGlobal(),
      { messageLists: chatId ? [{ chatId, threadId: MAIN_THREAD_ID, type: 'thread' }] : [] },
      tabId,
    ),
  );
}

describe('MiddleColumn', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  const frames = async () => {
    for (let i = 0; i < 4; i++) await harness.frame();
  };

  async function mount() {
    const el = container();
    dispose = render(
      () => <MiddleColumn leftColumnRef={() => undefined} isMobile={false} onPlayerPaneStateChange={() => undefined} />,
      el,
    );
    await frames();
    return el;
  }

  it('renders only its root while no chat is open', async () => {
    seed();
    const el = await mount();
    expect(el.querySelector('#MiddleColumn')).not.toBeNull();
    expect(el.querySelector('.messages-layout')).toBeNull();
    expect(el.querySelector('.MiddleHeader')).toBeNull();
  });

  it('opens a chat: header, one message list in the active slide and a footer next to it', async () => {
    seed(ANN_ID);
    const el = await mount();

    expect(el.querySelector('.messages-layout > .MiddleHeader .fullName')!.textContent).toContain('Ann');
    const slides = el.querySelectorAll('.messages-layout > .Transition > .Transition_slide');
    expect(slides).toHaveLength(1);
    const slide = slides[0];
    expect(slide.querySelectorAll('.MessageList')).toHaveLength(1);
    const footer = slide.querySelector('.middle-column-footer');
    expect(footer).not.toBeNull();
    expect(footer!.previousElementSibling!.classList.contains('MessageList')).toBe(true);
  });

  it('switches the chat: the previous list is disposed and the header follows', async () => {
    seed(ANN_ID);
    const el = await mount();
    const first = el.querySelector('.MessageList')!;

    openList(BOB_ID);
    await frames();

    expect(el.querySelector('.MiddleHeader .fullName')!.textContent).toContain('Bob');
    const lists = el.querySelectorAll('.MessageList');
    expect(lists).toHaveLength(1);
    expect(lists[0]).not.toBe(first);
    expect(first.isConnected).toBe(false);
    expect(el.textContent).not.toContain('Ann');
  });

  it('opens and closes chats repeatedly without keeping lists or slides', async () => {
    seed();
    const el = await mount();

    for (let i = 0; i < 6; i++) {
      openList(i % 2 ? BOB_ID : ANN_ID);
      await frames();
      expect(el.querySelectorAll('.MessageList')).toHaveLength(1);
      expect(el.querySelectorAll('.messages-layout > .Transition > .Transition_slide').length).toBeLessThanOrEqual(1);
    }

    openList();
    await frames();
    expect(el.querySelectorAll('.MessageList')).toHaveLength(0);
  });

  it('closes the chat on Escape', async () => {
    seed(ANN_ID);
    const el = await mount();
    expect(el.querySelector('.MessageList')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await frames();

    expect(getGlobal().byTabId[tabId].messageLists).toHaveLength(0);
    expect(el.querySelector('.MessageList')).toBeNull();
  });

  it('keeps the restriction text of the slide that slides out (it must not follow the new list)', async () => {
    const GROUP_ID = '-1005000';
    seed();
    // a group where the current user cannot write; Bob's chat is a private chat
    let global = addChats(getGlobal(), {
      [GROUP_ID]: {
        id: GROUP_ID,
        title: 'Group',
        type: 'chatTypeSuperGroup',
        unreadCount: 0,
        currentUserBannedRights: { sendMessages: true },
      } as unknown as ApiChat,
    });
    global = addMessages(global, [{ ...textMessage(GROUP_ID, 1, 'Hello group'), senderId: ANN_ID }]);
    global = updateThreadInfo(global, { chatId: GROUP_ID, threadId: MAIN_THREAD_ID });
    global = updateTabState(
      global,
      { messageLists: [{ chatId: GROUP_ID, threadId: MAIN_THREAD_ID, type: 'thread' }] },
      tabId,
    );
    setGlobal(global);
    const el = await mount();
    const restriction = 'Channel.Persmission.Denied.SendMessages.Forever';
    expect(el.querySelector('.messaging-disabled')!.textContent).toContain(restriction);

    // a second list (another chat) slides in over the first one
    setGlobal(
      updateTabState(
        getGlobal(),
        {
          messageLists: [
            { chatId: GROUP_ID, threadId: MAIN_THREAD_ID, type: 'thread' },
            { chatId: BOB_ID, threadId: MAIN_THREAD_ID, type: 'thread' },
          ],
        },
        tabId,
      ),
    );
    await frames();

    const slides = Array.from(el.querySelectorAll('.messages-layout > .Transition > .Transition_slide'));
    expect(slides.length).toBe(2);
    // the first slide (the group's) is leaving: its bar still says what it said
    expect(slides[0].querySelector('.messaging-disabled')!.textContent).toContain(restriction);
    // the new slide is Bob's: no restriction
    expect(slides[1].querySelector('.messaging-disabled')).toBeNull();
  });
});
