// Original test (not in telegram-tt): a service message through the store: the text of a pin action, the classes of the
// row, the focus class and the unread reaction attribute follow the tab state.
import '../../../global/actions/all';

import { render } from 'frameact/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGlobal, setGlobal, useGlobal } from '../../../global';

import type { ApiChat, ApiMessage, ApiUser } from '../../../api/types';
import type { GlobalState, TabState } from '../../../global/types';
import { MAIN_THREAD_ID } from '../../../api/types';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { addChats } from '../../../global/reducers/chats';
import { addMessages } from '../../../global/reducers/messages';
import { updateTabState } from '../../../global/reducers/tabs';
import { updateThreadInfo, updateThreadReadState } from '../../../global/reducers/threads';
import { addUsers } from '../../../global/reducers/users';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';

import ActionMessage from './ActionMessage';

const tabId = getCurrentTabId();
const SELF_ID = '1000';
const PEER_ID = '2000';

const user = (id: string, firstName: string) =>
  ({ id, firstName, type: 'userTypeRegular', isMin: false, phoneNumber: '' }) as unknown as ApiUser;
const privateChat = (id: string) => ({ id, title: `Chat ${id}`, type: 'chatTypePrivate', unreadCount: 0 }) as ApiChat;

const textMessage = (id: number, text: string) =>
  ({
    id,
    chatId: PEER_ID,
    date: 1_700_000_000 + id,
    isOutgoing: false,
    senderId: PEER_ID,
    content: { text: { text } },
  }) as ApiMessage;

const pinMessage = (id: number, replyTo: number) =>
  ({
    id,
    chatId: PEER_ID,
    date: 1_700_000_000 + id,
    isOutgoing: false,
    senderId: PEER_ID,
    replyInfo: { type: 'message', replyToMsgId: replyTo },
    content: { action: { type: 'pinMessage' } },
  }) as unknown as ApiMessage;

function seed() {
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
  let global: GlobalState = { ...cloneDeep(INITIAL_GLOBAL_STATE), currentUserId: SELF_ID, byTabId: { [tabId]: tab } };
  global = addUsers(global, { [SELF_ID]: user(SELF_ID, 'Me'), [PEER_ID]: user(PEER_ID, 'Ann') });
  global = addChats(global, { [PEER_ID]: privateChat(PEER_ID) });
  global = addMessages(global, [textMessage(5, 'The pinned words'), pinMessage(6, 5)]);
  global = updateThreadInfo(global, { chatId: PEER_ID, threadId: MAIN_THREAD_ID });
  setGlobal(global, { forceOutdated: true });
}

function Harness(props: { messageId: number; isLastInList?: boolean }) {
  const global = useGlobal();
  return (
    <ActionMessage
      message={global.messages.byChatId[PEER_ID].byId[props.messageId]}
      threadId={MAIN_THREAD_ID}
      appearanceOrder={0}
      isJustAdded={false}
      isLastInList={props.isLastInList}
    />
  );
}

describe('ActionMessage', () => {
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

  async function mount(messageId: number, isLastInList?: boolean) {
    const el = container();
    dispose = render(() => <Harness messageId={messageId} isLastInList={isLastInList} />, el);
    await frames();
    return el;
  }

  it('renders the text of a pin action of a message that is loaded, as a single-line service row', async () => {
    seed();
    const el = await mount(6);

    const row = el.querySelector<HTMLElement>('.ActionMessage')!;
    expect(row.id).toBe('message-6');
    expect(row.dataset.messageId).toBe('6');
    expect(row.classList.contains('message-list-item')).toBe(true);
    expect(row.className).toMatch(/singleLine/);
    expect(row.classList.contains('focused')).toBe(false);
    expect(row.classList.contains('last-in-list')).toBe(false);
    // no language pack in the harness: the text is the key of the pin text, not the "pinned message not found" one
    expect(row.querySelector('[role="button"]')!.textContent).toBe('ActionPinnedText');
  });

  it('marks the last row of the list', async () => {
    seed();
    const el = await mount(6, true);
    expect(el.querySelector('.ActionMessage')!.classList.contains('last-in-list')).toBe(true);
  });

  it('toggles the focused class with the focused message of the tab, and not for a highlight-less focus', async () => {
    seed();
    const el = await mount(6);
    const row = el.querySelector<HTMLElement>('.ActionMessage')!;
    expect(row.classList.contains('focused')).toBe(false);

    setGlobal(
      updateTabState(
        getGlobal(),
        { focusedMessage: { chatId: PEER_ID, threadId: MAIN_THREAD_ID, messageId: 6 } },
        tabId,
      ),
    );
    await frames();
    expect(row.classList.contains('focused')).toBe(true);

    setGlobal(
      updateTabState(
        getGlobal(),
        { focusedMessage: { chatId: PEER_ID, threadId: MAIN_THREAD_ID, messageId: 6, noHighlight: true } },
        tabId,
      ),
    );
    await frames();
    expect(row.classList.contains('focused')).toBe(false);

    setGlobal(updateTabState(getGlobal(), { focusedMessage: undefined }, tabId));
    await frames();
    expect(row.classList.contains('focused')).toBe(false);
  });

  it('sets and clears the unread reaction attribute with the thread read state (a row below the viewport)', async () => {
    seed();
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 100_000,
      bottom: 100_020,
      left: 0,
      right: 100,
      width: 100,
      height: 20,
      x: 0,
      y: 100_000,
      toJSON: () => ({}),
    });
    try {
      const el = await mount(6);
      const row = el.querySelector<HTMLElement>('.ActionMessage')!;
      expect(row.hasAttribute('data-has-unread-reaction')).toBe(false);

      setGlobal(updateThreadReadState(getGlobal(), PEER_ID, MAIN_THREAD_ID, { unreadReactions: [6] }));
      await frames();
      expect(row.getAttribute('data-has-unread-reaction')).toBe('true');

      setGlobal(updateThreadReadState(getGlobal(), PEER_ID, MAIN_THREAD_ID, { unreadReactions: [] }));
      await frames();
      expect(row.hasAttribute('data-has-unread-reaction')).toBe(false);
    } finally {
      rect.mockRestore();
    }
  });

  it('animates an unread reaction of a row that is in the viewport (the measure effect), which marks it read', async () => {
    seed();
    const el = await mount(6);
    const row = el.querySelector<HTMLElement>('.ActionMessage')!;

    setGlobal(updateThreadReadState(getGlobal(), PEER_ID, MAIN_THREAD_ID, { unreadReactions: [6] }));
    await frames();
    // `animateUnreadReaction` removed the id from the unread list: the attribute is gone again
    expect(getGlobal().messages.byChatId[PEER_ID].threadsById[MAIN_THREAD_ID].readState?.unreadReactions).toEqual([]);
    expect(row.hasAttribute('data-has-unread-reaction')).toBe(false);
  });

  it('renders nothing for a phone call action', async () => {
    seed();
    setGlobal(
      addMessages(getGlobal(), [
        { ...pinMessage(7, 5), content: { action: { type: 'phoneCall' } } } as unknown as ApiMessage,
      ]),
    );
    const el = await mount(7);
    expect(el.querySelector('.ActionMessage')).toBeNull();
  });

  it('hides the buttons of a request when it expires, without any update of the message', async () => {
    // a fixed clock and a fake timer: the expiry is exactly ten seconds away and nothing waits on a real one
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: new Date('2030-01-01T00:00:00Z') });
    try {
      seed();
      const period = 3600;
      setGlobal({ ...getGlobal(), appConfig: { ...getGlobal().appConfig, noForwardsRequestExpirePeriod: period } });
      const date = Math.floor(Date.now() / 1000) - period + 10;
      setGlobal(
        addMessages(getGlobal(), [
          {
            ...pinMessage(8, 5),
            date,
            replyInfo: undefined,
            content: { action: { type: 'noForwardsRequest', isExpired: false, isEnabled: true } },
          } as unknown as ApiMessage,
        ]),
      );
      const el = await mount(8);
      expect(el.querySelector('[role="group"]')).not.toBeNull();

      // just before the expiry the buttons are still there
      vi.advanceTimersByTime(9_000);
      await frames();
      expect(el.querySelector('[role="group"]')).not.toBeNull();

      // the timer of the component fires at the expiry
      vi.advanceTimersByTime(2_000);
      await frames();
      expect(el.querySelector('[role="group"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
