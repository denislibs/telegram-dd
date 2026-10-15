// Original test (not in telegram-tt): the text-message branch of `Message` through the store.
import '../../../global/actions/all';

import { delegateEvents, render } from 'frameact/dom';
import { enableStrict, setHandler } from 'frameact/stricterdom';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getGlobal, setGlobal, useGlobal } from '../../../global';

import type { ApiChat, ApiMessage, ApiUser } from '../../../api/types';
import type { GlobalState, TabState } from '../../../global/types';
import { MAIN_THREAD_ID } from '../../../api/types';

import { MESSAGE_APPEARANCE_DELAY } from '../../../config';
import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { addChats } from '../../../global/reducers/chats';
import { addMessages, updateChatMessage } from '../../../global/reducers/messages';
import { updateTabState } from '../../../global/reducers/tabs';
import { addUsers } from '../../../global/reducers/users';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';

import Message from './Message';

const tabId = getCurrentTabId();
const SELF_ID = '1000';
const PEER_ID = '2000';

const user = (id: string, firstName: string) =>
  ({ id, firstName, type: 'userTypeRegular', isMin: false, phoneNumber: '' }) as unknown as ApiUser;
const privateChat = (id: string) => ({ id, title: `Chat ${id}`, type: 'chatTypePrivate', unreadCount: 0 }) as ApiChat;
const groupChat = (id: string) =>
  ({ id, title: `Group ${id}`, type: 'chatTypeSuperGroup', isCreator: false, unreadCount: 0 }) as unknown as ApiChat;
const message = (chatId: string, id: number, text: string, extra: Partial<ApiMessage> = {}) =>
  ({
    id,
    chatId,
    date: 1_700_000_000 + id,
    isOutgoing: false,
    senderId: PEER_ID,
    content: { text: { text } },
    ...extra,
  }) as ApiMessage;

function seed(messages: ApiMessage[], chats: ApiChat[]) {
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
  let global: GlobalState = { ...cloneDeep(INITIAL_GLOBAL_STATE), currentUserId: SELF_ID, byTabId: { [tabId]: tab } };
  global = addUsers(global, { [SELF_ID]: user(SELF_ID, 'Me'), [PEER_ID]: user(PEER_ID, 'Peer') });
  global = addChats(global, Object.fromEntries(chats.map((chat) => [chat.id, chat])));
  global = addMessages(global, messages);
  setGlobal(global, { forceOutdated: true });
}

type Overrides = Partial<{
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  withSenderName: boolean;
  isLastInList: boolean;
  appearanceOrder: number;
  isJustAdded: boolean;
  onMessageUnmount: (messageId: number) => void;
}>;

function Harness(props: { chatId: string; messageId: number; overrides?: Overrides }) {
  const global = useGlobal();
  return (
    <Message
      message={global.messages.byChatId[props.chatId].byId[props.messageId]}
      threadId={MAIN_THREAD_ID}
      messageListType="thread"
      noComments={false}
      noReplies={false}
      appearanceOrder={props.overrides?.appearanceOrder ?? 0}
      isJustAdded={props.overrides?.isJustAdded ?? false}
      onMessageUnmount={props.overrides?.onMessageUnmount}
      isFirstInGroup={props.overrides?.isFirstInGroup ?? true}
      isLastInGroup={props.overrides?.isLastInGroup ?? true}
      isFirstInDocumentGroup={false}
      isLastInDocumentGroup={false}
      isLastInList={props.overrides?.isLastInList ?? false}
      withSenderName={props.overrides?.withSenderName}
    />
  );
}

describe('Message (text)', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;

  // The phase checker is on, as in the dev server: a layout read outside a measure phase or a DOM write outside a mutate phase
  // (in this component or one of its hooks) is a bug.
  const violations: string[] = [];
  beforeAll(() => {
    enableStrict();
    setHandler((...args: unknown[]) => violations.push(args.map(String).join(' ')));
  });

  // The harness clears the delegated listeners after each test.
  beforeEach(() => {
    delegateEvents(['click', 'contextmenu', 'mousedown', 'mousemove', 'dblclick']);
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    // (the harness appends and clears the containers of <body> outside a frame)
    expect(violations.filter((text) => !text.includes('of <body'))).toEqual([]);
    violations.length = 0;
  });

  async function mount(chatId: string, messageId: number, overrides?: Overrides) {
    const el = container();
    dispose = render(() => <Harness chatId={chatId} messageId={messageId} overrides={overrides} />, el);
    await harness.frame();
    await harness.frame();
    return el;
  }

  const frames = async () => {
    await harness.frame();
    await harness.frame();
  };

  it('renders the other-party bubble: tree, classes, text and time', async () => {
    seed([message(PEER_ID, 10, 'Hello world')], [privateChat(PEER_ID)]);
    const el = await mount(PEER_ID, 10);

    const bubble = el.querySelector<HTMLElement>('.Message')!;
    expect(bubble.id).toBe('message-10');
    expect(bubble.dataset.messageId).toBe('10');
    expect(bubble.classList.contains('message-list-item')).toBe(true);
    expect(bubble.classList.contains('own')).toBe(false);
    expect(bubble.classList.contains('first-in-group')).toBe(true);
    expect(bubble.classList.contains('last-in-group')).toBe(true);
    expect(bubble.classList.contains('allow-selection')).toBe(true);
    expect(bubble.querySelector('.bottom-marker')!.getAttribute('data-message-id')).toBe('10');
    expect(bubble.querySelector('.message-content.text')).not.toBeNull();
    expect(bubble.querySelector('.text-content')!.textContent).toContain('Hello world');
    expect(bubble.querySelector('.message-time')!.textContent.trim()).toMatch(/^\d{1,2}:\d{2}/);
    // a tail on the last message of a group, none on the others
    expect(bubble.querySelector('.svg-appendix')).not.toBeNull();
  });

  it('marks first/last in group and the last message in the list', async () => {
    seed([message(PEER_ID, 11, 'mid')], [privateChat(PEER_ID)]);
    const el = await mount(PEER_ID, 11, { isFirstInGroup: false, isLastInGroup: false, isLastInList: false });
    const bubble = el.querySelector<HTMLElement>('.Message')!;
    expect(bubble.classList.contains('first-in-group')).toBe(false);
    expect(bubble.classList.contains('last-in-group')).toBe(false);
    expect(bubble.classList.contains('last-in-list')).toBe(false);
    expect(bubble.querySelector('.svg-appendix')).toBeNull();
  });

  it('renders an own message with the outgoing status and no sender name', async () => {
    seed(
      [
        message(PEER_ID, 12, 'Mine', {
          isOutgoing: true,
          senderId: SELF_ID,
          sendingState: 'messageSendingStatePending',
        }),
      ],
      [privateChat(PEER_ID)],
    );
    const el = await mount(PEER_ID, 12);
    const bubble = el.querySelector<HTMLElement>('.Message')!;
    expect(bubble.classList.contains('own')).toBe(true);
    expect(bubble.querySelector('.text-content')!.classList.contains('with-outgoing-icon')).toBe(true);
    const status = bubble.querySelector('.MessageOutgoingStatus')!;
    expect(status).not.toBeNull();
    expect(status.querySelector('.icon-message-pending')).not.toBeNull();
    expect(bubble.querySelector('.message-title')).toBeNull();
  });

  it('shows the sender name of a group message', async () => {
    seed([message('-100', 20, 'in a group')], [groupChat('-100')]);
    const el = await mount('-100', 20, { withSenderName: true });
    const title = el.querySelector('.message-title');
    expect(title).not.toBeNull();
    expect(title!.querySelector('.sender-title')!.textContent).toContain('Peer');
    expect(el.querySelector('.message-title-name-container.interactive')).not.toBeNull();
  });

  it('shows the author title next to the sender name and updates it in place', async () => {
    seed([message('-100', 21, 'in a group', { postAuthorTitle: 'Boss' })], [groupChat('-100')]);
    const el = await mount('-100', 21, { withSenderName: true });
    const meta = el.querySelector('.message-title-meta')!;
    expect(meta.querySelector('.admin-title')!.textContent).toBe('Boss');

    setGlobal(updateChatMessage(getGlobal(), '-100', 21, { postAuthorTitle: 'Chief' }));
    await frames();
    expect(el.querySelector('.message-title-meta')).toBe(meta);
    expect(meta.querySelector('.admin-title')!.textContent).toBe('Chief');
  });

  it('renders the reply header', async () => {
    seed(
      [
        message(PEER_ID, 30, 'the original'),
        message(PEER_ID, 31, 'the reply', {
          replyInfo: { type: 'message', replyToMsgId: 30 } as ApiMessage['replyInfo'],
        }),
      ],
      [privateChat(PEER_ID)],
    );
    const el = await mount(PEER_ID, 31);
    const bubble = el.querySelector<HTMLElement>('.Message')!;
    expect(bubble.classList.contains('has-reply')).toBe(true);
    expect(bubble.querySelector('.message-subheader')).not.toBeNull();
    expect(bubble.querySelector('.EmbeddedMessage')).not.toBeNull();
    expect(bubble.querySelector('.content-inner')!.classList.contains('with-subheader')).toBe(true);
  });

  it('renders the forwarded header', async () => {
    seed(
      [
        message(PEER_ID, 40, 'forwarded text', {
          forwardInfo: { date: 1_699_999_000, hiddenUserName: 'Hidden Name' } as ApiMessage['forwardInfo'],
        }),
      ],
      [privateChat(PEER_ID)],
    );
    const el = await mount(PEER_ID, 40);
    expect(el.querySelector('.content-inner')!.classList.contains('forwarded-message')).toBe(true);
    expect(el.querySelector('.forward-title-container')).not.toBeNull();
    expect(el.querySelector('.message-title-name-container.sender-hidden .sender-title')!.textContent).toContain(
      'Hidden Name',
    );
  });

  it('renders the forwarded header of a known sender with his avatar', async () => {
    seed(
      [
        message(PEER_ID, 41, 'forwarded from a user', {
          forwardInfo: { date: 1_699_999_000, fromId: PEER_ID } as ApiMessage['forwardInfo'],
        }),
      ],
      [privateChat(PEER_ID)],
    );
    const el = await mount(PEER_ID, 41);
    const name = el.querySelector('.message-title-name-container.interactive')!;
    expect(name).not.toBeNull();
    expect(name.querySelector('.forward-avatar')).not.toBeNull();
    expect(name.querySelector('.sender-title')!.textContent).toContain('Peer');
    expect(el.querySelector('.message-content')!.classList.contains('is-forwarded')).toBe(true);
  });

  it('shows the edited mark', async () => {
    seed([message(PEER_ID, 50, 'edited text', { isEdited: true, editDate: 1_700_000_100 })], [privateChat(PEER_ID)]);
    const el = await mount(PEER_ID, 50);
    expect(el.querySelector('.Message')!.classList.contains('was-edited')).toBe(true);
    expect(el.querySelector('.message-time')!.textContent.trim().length).toBeGreaterThan(5);
  });

  it('updates the text and the edited state in place, without recreating the bubble', async () => {
    seed([message(PEER_ID, 60, 'before')], [privateChat(PEER_ID)]);
    const el = await mount(PEER_ID, 60);
    const bubble = el.querySelector<HTMLElement>('.Message')!;
    const content = bubble.querySelector('.message-content')!;
    const textContent = bubble.querySelector('.text-content')!;
    expect(textContent.textContent).toContain('before');
    expect(bubble.classList.contains('was-edited')).toBe(false);

    setGlobal(
      updateChatMessage(getGlobal(), PEER_ID, 60, {
        content: { text: { text: 'after the edit' } },
        isEdited: true,
        editDate: 1_700_000_200,
      }),
    );
    await frames();

    expect(el.querySelector('.Message')).toBe(bubble);
    expect(bubble.querySelector('.message-content')).toBe(content);
    expect(bubble.querySelector('.text-content')).toBe(textContent);
    expect(textContent.textContent).toContain('after the edit');
    expect(textContent.textContent).not.toContain('before');
    expect(bubble.classList.contains('was-edited')).toBe(true);
  });

  it('shows the views and flags the bottom marker for the view counter', async () => {
    seed([message(PEER_ID, 70, 'channel post', { viewsCount: 1200 })], [privateChat(PEER_ID)]);
    const el = await mount(PEER_ID, 70);
    expect(el.querySelector('.Message')!.classList.contains('has-views')).toBe(true);
    expect(el.querySelector('.message-views')).not.toBeNull();
    expect(el.querySelector<HTMLElement>('.bottom-marker')!.dataset.shouldUpdateViews).toBe('true');
  });

  it('plays the appearance animation: the bubble opens after the order delay', async () => {
    seed([message(PEER_ID, 80, 'animated')], [privateChat(PEER_ID)]);
    const el = await mount(PEER_ID, 80, { appearanceOrder: 3 });
    const bubble = el.querySelector<HTMLElement>('.Message')!;
    expect(bubble.classList.contains('open')).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 3 * MESSAGE_APPEARANCE_DELAY + 30));
    await frames();
    await frames();
    expect(bubble.classList.contains('open')).toBe(true);
    expect(el.querySelector('.Message')).toBe(bubble);
  });

  it('a just added message opens at once', async () => {
    seed([message(PEER_ID, 81, 'fresh', { isOutgoing: true, senderId: SELF_ID })], [privateChat(PEER_ID)]);
    const el = await mount(PEER_ID, 81, { appearanceOrder: 1, isJustAdded: true });
    const bubble = el.querySelector<HTMLElement>('.Message')!;
    expect(bubble.classList.contains('is-just-added')).toBe(true);
    await frames();
    expect(bubble.classList.contains('open')).toBe(true);
  });

  it('follows the select mode of the tab', async () => {
    seed([message(PEER_ID, 90, 'select me')], [privateChat(PEER_ID)]);
    const el = await mount(PEER_ID, 90);
    const bubble = el.querySelector<HTMLElement>('.Message')!;
    expect(bubble.classList.contains('is-in-selection-mode')).toBe(false);
    expect(bubble.querySelector('.message-select-control-icon')).toBeNull();

    setGlobal(updateTabState(getGlobal(), { selectedMessages: { chatId: PEER_ID, messageIds: [90] } }, tabId));
    await frames();
    expect(bubble.classList.contains('is-in-selection-mode')).toBe(true);
    expect(bubble.classList.contains('is-selected')).toBe(true);
    expect(bubble.querySelector('.message-select-control-icon')).not.toBeNull();
    expect(el.querySelector('.Message')).toBe(bubble);

    setGlobal(updateTabState(getGlobal(), { selectedMessages: undefined }, tabId));
    await frames();
    expect(bubble.classList.contains('is-in-selection-mode')).toBe(false);
    expect(bubble.classList.contains('is-selected')).toBe(false);
  });

  it('opens the context menu state on a right click', async () => {
    seed([message(PEER_ID, 100, 'menu')], [privateChat(PEER_ID)]);
    const el = await mount(PEER_ID, 100);
    const bubble = el.querySelector<HTMLElement>('.Message')!;
    expect(bubble.classList.contains('has-menu-open')).toBe(false);
    expect(bubble.querySelector('.message-action-buttons-container')).not.toBeNull();

    bubble
      .querySelector('.text-content')!
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 6 }));
    await frames();
    expect(bubble.classList.contains('has-menu-open')).toBe(true);
    // the action buttons are hidden while the menu is shown
    expect(bubble.querySelector('.message-action-buttons-container')).toBeNull();
  });

  it('reports the unmount of the row by the id of the message', async () => {
    seed([message(PEER_ID, 110, 'bye')], [privateChat(PEER_ID)]);
    const unmounted: number[] = [];
    await mount(PEER_ID, 110, { onMessageUnmount: (id) => unmounted.push(id) });
    expect(unmounted).toEqual([]);
    dispose?.();
    dispose = undefined;
    expect(unmounted).toEqual([110]);
  });

  it('shows the quick reaction button near the pointer and hides it when the pointer leaves', async () => {
    seed([message(PEER_ID, 120, 'react to me')], [privateChat(PEER_ID)]);
    setGlobal({
      ...getGlobal(),
      config: { ...getGlobal().config, defaultReaction: { type: 'emoji', emoticon: '👍' } } as GlobalState['config'],
    });
    const el = await mount(PEER_ID, 120);
    const bubble = el.querySelector<HTMLElement>('.Message')!;
    const button = bubble.querySelector<HTMLElement>('.quick-reaction')!;
    expect(button).not.toBeNull();
    expect(button.classList.contains('visible')).toBe(false);

    // jsdom has no layout: the button is at (0, 0), so is the pointer
    bubble.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0, clientY: 0 }));
    await frames();
    expect(button.classList.contains('visible')).toBe(true);

    bubble.dispatchEvent(new MouseEvent('mouseleave'));
    await frames();
    expect(button.classList.contains('visible')).toBe(false);
  });

  it('plays the delete animation of a deleted message', async () => {
    seed([message(PEER_ID, 130, 'to be deleted')], [privateChat(PEER_ID)]);
    const el = await mount(PEER_ID, 130);
    const bubble = el.querySelector<HTMLElement>('.Message')!;
    expect(bubble.classList.contains('is-deleting')).toBe(false);

    setGlobal(updateChatMessage(getGlobal(), PEER_ID, 130, { isDeleting: true }));
    await frames();
    // the snap effect is a deferred feature (`animateSnap` is a stub): the plain delete animation plays
    expect(bubble.classList.contains('is-deleting') || bubble.classList.contains('is-dissolving')).toBe(true);
  });
});
