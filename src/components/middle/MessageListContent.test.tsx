// Original test (not in telegram-tt): the structure that `MessageListContent` builds from the date groups of `groupMessages`.
// The expectation is written from tt's render loops (`MessageListContent.tsx` of tt@090e38f, `calculateSenderGroups`,
// `renderMessageElement`, the date groups): the order of the children, the container of a sender group (only with
// `withUsers`), `isFirstInGroup` / `isLastInGroup` / `isLastInList`, the avatar of the last bubble of a group (not mine),
// the sender name of the first one, the unread divider before the first unread message, the date headers.
import '../../global/actions/all';

import { createSignal } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlobal, setGlobal } from '../../global';

import type { ApiChat, ApiMessage, ApiUser } from '../../api/types';
import type { GlobalState, TabState } from '../../global/types';
import type { MessageDateGroup } from './helpers/groupMessages';
import { MAIN_THREAD_ID } from '../../api/types';

import { container, useDomHarness } from '../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../global/initialState';
import { addChats } from '../../global/reducers/chats';
import { addMessages, updateChatMessage } from '../../global/reducers/messages';
import { addUsers, updateUser } from '../../global/reducers/users';
import { getCurrentTabId } from '../../util/establishMultitabRole';
import { cloneDeep } from '../../util/iteratees';
import { groupMessages, isAlbum, isDocumentGroup } from './helpers/groupMessages';

import MessageListContent from './MessageListContent';

// The mapper of `Message` is counted through its selectors: a mounted row must not run it again when the list pages in
const selectSenderCalls = vi.hoisted(() => [] as number[]);
vi.mock('../../global/selectors', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../global/selectors')>();
  return {
    ...original,
    selectSender: (
      global: Parameters<typeof original.selectSender>[0],
      message: Parameters<typeof original.selectSender>[1],
    ) => {
      selectSenderCalls.push(message.id);
      return original.selectSender(global, message);
    },
  };
});

// The strings of the language pack are not loaded here: a text is `key{params}`, so the parameters can be checked
vi.mock('../../util/localization', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../util/localization')>();
  const fake = Object.assign(
    (key: string, variables?: Record<string, unknown>) => (variables ? `${key}${JSON.stringify(variables)}` : key),
    { isRtl: false, code: 'en', languageInfo: { langCode: 'en' } },
  );
  return { ...original, getTranslationFn: () => fake };
});

const tabId = getCurrentTabId();
const SELF_ID = '1000';
const ALICE = '2000';
const BOB = '3000';
const GROUP_ID = '-1000000000009';
const PRIVATE_ID = '2000';
const DAY = 24 * 3600;
const T0 = 1_700_000_000 - (1_700_000_000 % DAY) + 3600; // 01:00 UTC of a day

class ResizeObserverStub {
  observe = () => undefined;

  unobserve = () => undefined;

  disconnect = () => undefined;
}
globalThis.ResizeObserver = ResizeObserverStub;
globalThis.IntersectionObserver = class {
  observe = () => undefined;

  unobserve = () => undefined;

  disconnect = () => undefined;

  takeRecords = () => [];
} as unknown as typeof IntersectionObserver;

const user = (id: string, firstName: string) =>
  ({ id, firstName, type: 'userTypeRegular', isMin: false, phoneNumber: '' }) as unknown as ApiUser;
const groupChat = () =>
  ({
    id: GROUP_ID,
    title: 'Group',
    type: 'chatTypeSuperGroup',
    isCreator: false,
    unreadCount: 0,
  }) as unknown as ApiChat;
const privateChat = () => ({ id: PRIVATE_ID, title: 'Alice', type: 'chatTypePrivate', unreadCount: 0 }) as ApiChat;

let nextId = 1;
type Spec = Partial<ApiMessage> & { sender?: string; at?: number; text?: string };
function msg(chatId: string, spec: Spec): ApiMessage {
  const id = spec.id ?? nextId++;
  const { sender = ALICE, at = 0, text = `text ${id}`, ...rest } = spec;
  const isOutgoing = sender === SELF_ID;
  return {
    id,
    chatId,
    date: T0 + at,
    isOutgoing,
    senderId: sender,
    content: { text: { text } },
    ...rest,
  };
}
const service = (chatId: string, spec: Spec) =>
  msg(chatId, { ...spec, content: { action: { type: 'chatAddUser', userIds: [BOB] } } } as Spec);

function seed(chatId: string, messages: ApiMessage[]) {
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
  let global: GlobalState = { ...cloneDeep(INITIAL_GLOBAL_STATE), currentUserId: SELF_ID, byTabId: { [tabId]: tab } };
  global = addUsers(global, { [SELF_ID]: user(SELF_ID, 'Me'), [ALICE]: user(ALICE, 'Alice'), [BOB]: user(BOB, 'Bob') });
  global = addChats(global, { [chatId]: chatId === GROUP_ID ? groupChat() : privateChat() });
  global = addMessages(global, messages);
  setGlobal(global, { forceOutdated: true });
}

// --- the expectation: tt's rules -------------------------------------------------------------------------------------------

type Rules = { withUsers: boolean; unreadDividerBeforeId?: number; isComments?: boolean };

/** The sequence of tokens that tt renders for the date groups (see the header of the file). */
function expectedTokens(dateGroups: MessageDateGroup[], { withUsers, unreadDividerBeforeId }: Rules) {
  const tokens: string[] = [];
  dateGroups.forEach((dateGroup, dateGroupIndex) => {
    tokens.push('D');
    dateGroup.senderGroups.forEach((senderGroup, senderGroupIndex) => {
      const isLastGroup = senderGroupIndex === dateGroup.senderGroups.length - 1;
      const isLastDateGroup = dateGroupIndex === dateGroups.length - 1;
      const isActionOnly =
        senderGroup.length === 1 &&
        !isAlbum(senderGroup[0]) &&
        !isDocumentGroup(senderGroup[0]) &&
        'content' in senderGroup[0] &&
        Boolean(senderGroup[0].content.action) &&
        senderGroup[0].content.action.type !== 'phoneCall';
      if (isActionOnly) {
        const message = senderGroup[0] as ApiMessage;
        if (message.id === unreadDividerBeforeId) tokens.push('|');
        tokens.push(`A${message.id}`);
        return;
      }

      const rows: string[] = [];
      senderGroup.forEach((item, index) => {
        const isFirst = index === 0;
        const isLast = index === senderGroup.length - 1;
        const messages = isAlbum(item) ? [item.mainMessage] : isDocumentGroup(item) ? item.messages : [item];
        messages.forEach((message, docIndex) => {
          const isFirstInGroup = isFirst && docIndex === 0;
          const isLastInGroup = isLast && docIndex === messages.length - 1;
          const isLastInList = isLastInGroup && isLastGroup && isLastDateGroup;
          if (message.id === unreadDividerBeforeId) rows.push('|');
          const isOwn = message.isOutgoing;
          const flags =
            (isFirstInGroup ? 'f' : '') +
            (isLastInGroup ? 'l' : '') +
            (isLastInList ? 'z' : '') +
            (isOwn ? 'o' : '') +
            // the sender name: the first bubble of a group, with users, not mine
            (isFirstInGroup && withUsers && !isOwn && !message.content.photo && !message.content.video ? 'n' : '');
          rows.push(`M${message.id}:${flags}`);
        });
      });

      if (!withUsers) {
        tokens.push(...rows);
        return;
      }

      const last = senderGroup[senderGroup.length - 1];
      const lastMessage = isAlbum(last) ? last.mainMessage : isDocumentGroup(last) ? last.messages.at(-1)! : last;
      const first = senderGroup[0];
      const firstId = isAlbum(first) ? first.mainMessage.id : isDocumentGroup(first) ? first.firstMessageId : first.id;
      const lastId = lastMessage.id;
      const id = firstId === lastId ? String(firstId) : `${firstId}-${lastId}`;
      const avatar = lastMessage.isOutgoing ? '' : `+${lastMessage.senderId}`;
      tokens.push(`G${id}${avatar}(`, ...rows, ')');
    });
  });
  return tokens;
}

/** The same sequence read from the DOM. */
function readTokens(root: Element) {
  const tokens: string[] = [];
  const message = (el: Element) => {
    const classes = el.classList;
    const flags =
      (classes.contains('first-in-group') ? 'f' : '') +
      (classes.contains('last-in-group') ? 'l' : '') +
      (classes.contains('last-in-list') ? 'z' : '') +
      (classes.contains('own') ? 'o' : '') +
      (el.querySelector('.message-title .sender-title') ? 'n' : '');
    return `M${(el as HTMLElement).dataset.messageId}:${flags}`;
  };
  const walk = (parent: Element) => {
    for (const el of Array.from(parent.children)) {
      if (el.classList.contains('sticky-date')) tokens.push('D');
      else if (el.classList.contains('unread-divider')) tokens.push('|');
      else if (el.classList.contains('ActionMessage')) tokens.push(`A${(el as HTMLElement).dataset.messageId}`);
      else if (el.classList.contains('Message')) tokens.push(message(el));
      else if (el.classList.contains('sender-group-container')) {
        const avatar = el.querySelector<HTMLElement>(':scope > [class*="avatarContainer"] .Avatar');
        tokens.push(`G${el.id.replace('message-group-', '')}${avatar ? `+${avatar.dataset.peerId}` : ''}(`);
        walk(el);
        tokens.push(')');
      } else if (el.classList.contains('message-date-group')) walk(el);
    }
  };
  walk(root.querySelector('.messages-container')!);
  return tokens;
}

// --- the harness ------------------------------------------------------------------------------------------------------------

describe('MessageListContent', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    nextId = 1;
    delegateEvents(['click', 'contextmenu', 'mousedown', 'mousemove', 'dblclick']);
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  const frames = async () => {
    for (let i = 0; i < 4; i++) await harness.frame();
  };

  type Options = {
    chatId: string;
    messages: ApiMessage[];
    withUsers: boolean;
    isChannelChat?: boolean;
    firstUnreadId?: number;
  };

  async function mountContent({ chatId, messages, withUsers, isChannelChat, firstUnreadId }: Options) {
    seed(chatId, messages);
    const [getGroups, setGroups] = createSignal<MessageDateGroup[]>([]);
    const regroup = (list: ApiMessage[]) => groupMessages(list, firstUnreadId, undefined, false, withUsers);
    setGroups(regroup(messages));
    const [getIds, setIds] = createSignal(messages.map(({ id }) => id));

    const el = container();
    const scroll = document.createElement('div');
    el.appendChild(scroll);
    const memoUnreadDividerBeforeIdRef = { current: firstUnreadId };
    dispose = render(
      () => (
        <MessageListContent
          chatId={chatId}
          threadId={MAIN_THREAD_ID}
          messageIds={getIds()}
          historyMessageIds={getIds()}
          messageGroups={getGroups()}
          getContainerHeight={() => 800}
          isViewportNewest
          isUnread={false}
          withUsers={withUsers}
          isChannelChat={isChannelChat}
          noAvatars={false}
          containerRef={() => scroll}
          anchorIdRef={{ current: undefined }}
          memoUnreadDividerBeforeIdRef={memoUnreadDividerBeforeIdRef}
          memoFirstUnreadIdRef={{ current: firstUnreadId }}
          isReplacingHistoryRef={{ current: false }}
          type="thread"
          isReady
          hasLinkedChat={undefined}
          isSchedule={false}
          noAppearanceAnimation
          addedMessageIds={[]}
        />
      ),
      scroll,
    );
    await frames();
    return {
      root: scroll,
      groups: getGroups,
      update(list: ApiMessage[]) {
        setGlobal(addMessages(getGlobal(), list));
        setGroups(regroup(list));
        setIds(list.map(({ id }) => id));
      },
    };
  }

  const check = async (options: Options) => {
    const { root, groups } = await mountContent(options);
    expect(readTokens(root)).toEqual(
      expectedTokens(groups(), { withUsers: options.withUsers, unreadDividerBeforeId: options.firstUnreadId }),
    );
    return root;
  };

  it('a group: containers by sender, the avatar on the last bubble, the name on the first, my messages without either', async () => {
    const chatId = GROUP_ID;
    const root = await check({
      chatId,
      withUsers: true,
      isChannelChat: false,
      messages: [
        msg(chatId, { sender: ALICE, at: 0 }),
        msg(chatId, { sender: ALICE, at: 60 }),
        msg(chatId, { sender: ALICE, at: 120 }),
        msg(chatId, { sender: BOB, at: 180 }),
        msg(chatId, { sender: SELF_ID, at: 240 }),
        msg(chatId, { sender: SELF_ID, at: 300 }),
        msg(chatId, { sender: ALICE, at: 360 }),
      ],
    });
    expect(readTokens(root).filter((token) => token.startsWith('G'))).toEqual([
      'G1-3+2000(',
      'G4+3000(',
      'G5-6(',
      'G7+2000(',
    ]);
  });

  it('a group: more than ten minutes between two messages of one sender start a new group', async () => {
    const chatId = GROUP_ID;
    await check({
      chatId,
      withUsers: true,
      messages: [
        msg(chatId, { sender: ALICE, at: 0 }),
        msg(chatId, { sender: ALICE, at: 599 }),
        msg(chatId, { sender: ALICE, at: 599 + 601 }),
      ],
    });
  });

  it('a group: a service message is a row of its own between the containers', async () => {
    const chatId = GROUP_ID;
    const root = await check({
      chatId,
      withUsers: true,
      messages: [
        msg(chatId, { sender: ALICE, at: 0 }),
        service(chatId, { sender: BOB, at: 30 }),
        msg(chatId, { sender: ALICE, at: 60 }),
      ],
    });
    expect(readTokens(root)).toEqual(['D', 'G1+2000(', 'M1:fln', ')', 'A2', 'G3+2000(', 'M3:flzn', ')']);
    expect(readTokens(root).filter((token) => token.startsWith('A'))).toEqual(['A2']);
  });

  it('two days are two date groups with a header each; the last message of the list is the only last-in-list', async () => {
    const chatId = GROUP_ID;
    const root = await check({
      chatId,
      withUsers: true,
      messages: [
        msg(chatId, { sender: ALICE, at: 0 }),
        msg(chatId, { sender: ALICE, at: 60 }),
        msg(chatId, { sender: ALICE, at: DAY }),
        msg(chatId, { sender: BOB, at: DAY + 60 }),
      ],
    });
    expect(root.querySelectorAll('.message-date-group')).toHaveLength(2);
    expect(root.querySelectorAll('.Message.last-in-list')).toHaveLength(1);
    expect(root.querySelector('.last-in-list')!.id).toBe('message-4');
  });

  it('the unread divider goes before the first unread message and splits the group there', async () => {
    const chatId = GROUP_ID;
    const root = await check({
      chatId,
      withUsers: true,
      firstUnreadId: 3,
      messages: [
        msg(chatId, { sender: ALICE, at: 0 }),
        msg(chatId, { sender: ALICE, at: 60 }),
        msg(chatId, { sender: ALICE, at: 120 }),
        msg(chatId, { sender: ALICE, at: 180 }),
      ],
    });
    expect(root.querySelectorAll('.unread-divider')).toHaveLength(1);
    // inside the container of the second group, right before its first message
    expect(root.querySelector('#message-group-3-4 > .unread-divider + #message-3')).not.toBeNull();
  });

  it('a private chat: no containers, no avatars, no names; the flags follow the groups', async () => {
    const chatId = PRIVATE_ID;
    const root = await check({
      chatId,
      withUsers: false,
      messages: [
        msg(chatId, { sender: ALICE, at: 0 }),
        msg(chatId, { sender: ALICE, at: 60 }),
        msg(chatId, { sender: SELF_ID, at: 120 }),
        msg(chatId, { sender: ALICE, at: 180 }),
      ],
    });
    expect(root.querySelectorAll('.sender-group-container')).toHaveLength(0);
    expect(root.querySelectorAll('.Avatar[data-peer-id]')).toHaveLength(0);
    expect(root.querySelectorAll('.message-title .sender-title')).toHaveLength(0);
  });

  it('a channel with the profiles of the authors shown groups like a group; one without does not', async () => {
    const chatId = GROUP_ID;
    const messages = [msg(chatId, { sender: ALICE, at: 0 }), msg(chatId, { sender: ALICE, at: 60 })];
    const withProfiles = await check({ chatId, withUsers: true, isChannelChat: true, messages });
    expect(withProfiles.querySelectorAll('.sender-group-container')).toHaveLength(1);
    dispose?.();
    dispose = undefined;
    nextId = 1;
    const withoutProfiles = await check({
      chatId,
      withUsers: false,
      isChannelChat: true,
      messages: [msg(chatId, { sender: ALICE, at: 0 }), msg(chatId, { sender: ALICE, at: 60 })],
    });
    expect(withoutProfiles.querySelectorAll('.sender-group-container')).toHaveLength(0);
  });

  it('an album is one row with its main message, a document group is a row per document with its own flags', async () => {
    const chatId = GROUP_ID;
    const photo = (id: number) =>
      msg(chatId, {
        id,
        sender: ALICE,
        at: id,
        text: id === 10 ? 'caption' : '',
        isInAlbum: true,
        groupedId: '777',
        content: {
          photo: { id: String(id), mediaType: 'photo', sizes: [], thumbnail: undefined },
          text: id === 10 ? { text: 'caption' } : undefined,
        },
      } as unknown as Spec);
    const doc = (id: number) =>
      msg(chatId, {
        id,
        sender: BOB,
        at: id,
        groupedId: '888',
        content: {
          document: { id: String(id), mediaType: 'document', fileName: `f${id}.txt`, mimeType: 'text/plain', size: 1 },
        },
      } as unknown as Spec);
    const root = await check({
      chatId,
      withUsers: true,
      messages: [photo(10), photo(11), photo(12), doc(13), doc(14), msg(chatId, { id: 15, sender: BOB, at: 20 })],
    });
    // the album: one row (the main message, the others are not rendered)
    expect(root.querySelectorAll('#message-10')).toHaveLength(1);
    expect(root.querySelectorAll('#message-11, #message-12')).toHaveLength(0);
    // the documents: a row each, first / last in the document group
    expect(root.querySelector('#message-13')!.classList.contains('first-in-document-group')).toBe(true);
    expect(root.querySelector('#message-14')!.classList.contains('last-in-document-group')).toBe(true);
  });

  it('a message that arrives from the last sender extends the container: its key and id change, nothing is duplicated', async () => {
    const chatId = GROUP_ID;
    const first = msg(chatId, { sender: ALICE, at: 0 });
    const second = msg(chatId, { sender: ALICE, at: 60 });
    const { root, update } = await mountContent({ chatId, withUsers: true, messages: [first, second] });
    expect(root.querySelector('#message-group-1-2')).not.toBeNull();

    update([first, second, msg(chatId, { sender: ALICE, at: 120 })]);
    await frames();

    expect(root.querySelector('#message-group-1-2')).toBeNull();
    expect(root.querySelectorAll('#message-group-1-3')).toHaveLength(1);
    expect(root.querySelectorAll('.Message')).toHaveLength(3);
    expect(root.querySelectorAll('.Message.last-in-group')).toHaveLength(1);
    expect(root.querySelector('.last-in-list')!.id).toBe('message-3');
    expect(root.querySelectorAll('.Avatar[data-peer-id]')).toHaveLength(1);
  });

  it('the amount of a paid message row follows the album: a part that arrives later changes it (M2)', async () => {
    const chatId = PRIVATE_ID;
    const part = (id: number) =>
      msg(chatId, {
        id,
        sender: SELF_ID,
        at: id,
        text: '',
        isInAlbum: true,
        groupedId: '999',
        paidMessageStars: 5,
        content: { photo: { id: String(id), mediaType: 'photo', sizes: [] } },
      } as unknown as Spec);
    const first = part(20);
    const second = part(21);
    const { root, update } = await mountContent({ chatId, withUsers: false, messages: [first, second] });
    const amountOf = () => root.querySelector('.local-action-message')!.textContent;
    const before = amountOf();
    expect(before).toContain('ActionPaidOneMessageOutgoing');

    update([first, second, part(22)]);
    await frames();

    expect(amountOf()).not.toBe(before);
  });

  it('the title of the sender in the paid-message row follows the store (M2)', async () => {
    const chatId = PRIVATE_ID;
    const incoming = msg(chatId, {
      id: 30,
      sender: ALICE,
      at: 0,
      paidMessageStars: 3,
    });
    const { root } = await mountContent({ chatId, withUsers: false, messages: [incoming] });
    expect(root.querySelector('.local-action-message')!.textContent).toContain('Alice');

    setGlobal(updateUser(getGlobal(), ALICE, { firstName: 'Alicia' }));
    await frames();
    expect(root.querySelector('.local-action-message')!.textContent).toContain('Alicia');
    // (an edit of the message does not remount the row either)
    setGlobal(updateChatMessage(getGlobal(), chatId, 30, { viewsCount: 5 }));
    await frames();
    expect(root.querySelectorAll('.local-action-message')).toHaveLength(1);
  });

  it('keeps the avatar of a sender group (the same element) when the profile of the sender is updated (M6)', async () => {
    const chatId = GROUP_ID;
    const { root } = await mountContent({
      chatId,
      withUsers: true,
      messages: [msg(chatId, { sender: ALICE, at: 0 }), msg(chatId, { sender: ALICE, at: 60 })],
    });
    const avatar = root.querySelector('.sender-group-container .Avatar[data-peer-id]')!;
    expect(avatar).not.toBeNull();

    setGlobal(updateUser(getGlobal(), ALICE, { firstName: 'Alicia', lastName: 'Renamed' }));
    await frames();

    expect(root.querySelector('.sender-group-container .Avatar[data-peer-id]')).toBe(avatar);
  });

  describe('a page-in keeps the rows that are mounted (stable entries)', () => {
    const rowIds = (root: Element) => [...root.querySelectorAll<HTMLElement>('.Message')].map((el) => el.id);

    // MutationObserver records are made even for a write of the same value: a row that was woken shows them
    function watch(root: Element) {
      const records: { id: string; type: string; name?: string | null }[] = [];
      const observer = new MutationObserver((list) => {
        for (const record of list) {
          const row =
            (record.target as Element).closest?.('.Message') ?? record.target.parentElement?.closest('.Message');
          records.push({ id: row?.id ?? '', type: record.type, name: record.attributeName });
        }
      });
      observer.observe(root, { subtree: true, attributes: true, characterData: true, childList: true });
      return { records, stop: () => observer.disconnect() };
    }

    it('does not touch the DOM or the mapper of the mounted rows when older messages are added', async () => {
      const chatId = GROUP_ID;
      const newer = Array.from({ length: 6 }, (_, i) =>
        msg(chatId, { id: 100 + i, sender: i % 2 ? ALICE : BOB, at: 1000 + i * 30 }),
      );
      const { root, update } = await mountContent({ chatId, withUsers: true, messages: newer });
      const mounted = rowIds(root);
      expect(mounted).toHaveLength(6);
      selectSenderCalls.length = 0;
      const watcher = watch(root);

      const older = Array.from({ length: 4 }, (_, i) =>
        msg(chatId, { id: 90 + i, sender: i % 2 ? ALICE : BOB, at: 500 + i * 30 }),
      );
      update([...older, ...newer]);
      await frames();
      watcher.stop();

      expect(rowIds(root)).toHaveLength(10);
      const touched = watcher.records.filter((record) => mounted.includes(record.id) && record.type !== 'childList');
      expect(touched, JSON.stringify(touched.slice(0, 5))).toEqual([]);
      // no mapper run of a mounted row (new rows ask for their sender once or twice each)
      expect(selectSenderCalls.filter((id) => id >= 100)).toEqual([]);
    });

    it('wakes the row of a message that changed, and only it', async () => {
      const chatId = GROUP_ID;
      const list = Array.from({ length: 5 }, (_, i) => msg(chatId, { id: 200 + i, sender: ALICE, at: 2000 + i * 30 }));
      const { root, update } = await mountContent({ chatId, withUsers: true, messages: list });
      selectSenderCalls.length = 0;

      update(
        list.map((message) => (message.id === 202 ? { ...message, content: { text: { text: 'edited' } } } : message)),
      );
      await frames();

      expect(root.querySelector('#message-202')!.textContent).toContain('edited');
      expect(root.querySelector('#message-201')!.textContent).not.toContain('edited');
      expect(selectSenderCalls.filter((id) => id !== 202)).toEqual([]);
    });

    it('a message that is no longer the last one of its group is woken (its position changed)', async () => {
      const chatId = GROUP_ID;
      const first = msg(chatId, { id: 300, sender: ALICE, at: 3000 });
      const { root, update } = await mountContent({ chatId, withUsers: true, messages: [first] });
      expect(root.querySelector('#message-300')!.classList.contains('last-in-group')).toBe(true);

      update([first, msg(chatId, { id: 301, sender: ALICE, at: 3030 })]);
      await frames();

      expect(root.querySelector('#message-300')!.classList.contains('last-in-group')).toBe(false);
      expect(root.querySelector('#message-301')!.classList.contains('last-in-group')).toBe(true);
    });
  });
});
