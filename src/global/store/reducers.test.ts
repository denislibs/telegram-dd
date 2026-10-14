// T1.4 (docs/plans/2026-10-14-store.md): the mirror property test over tt's *real* reducers. A random sequence of
// updateChat / addChats / addMessages / updateChatMessage / deleteChatMessages / updateListedIds / replaceTabThreadParam /
// updateTabState / updateUser(s) / replaceChatListIds / updateChatLastMessageId steps goes through the real
// `setGlobal`; after every step the store mirror equals the committed global (by JSON) and the snapshots taken earlier
// are untouched (tt's value semantics).
import { unwrap } from 'frameact/store';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ApiChat, ApiMessage, ApiUser } from '../../api/types';
import type { GlobalState, TabState } from '../types';
import { MAIN_THREAD_ID } from '../../api/types';

import { getCurrentTabId } from '../../util/establishMultitabRole';
import { cloneDeep } from '../../util/iteratees';
import { getGlobal, setGlobal, useGlobal } from '../index';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../initialState';
import { addChats, replaceChatListIds, updateChat, updateChatLastMessageId } from '../reducers/chats';
import { addMessages, deleteChatMessages, updateChatMessage, updateListedIds } from '../reducers/messages';
import { updateTabState } from '../reducers/tabs';
import { replaceTabThreadParam } from '../reducers/threads';
import { updateUser, updateUsers } from '../reducers/users';

const tabId = getCurrentTabId();

const chat = (id: string, extra: Partial<ApiChat> = {}) =>
  ({ id, title: `Chat ${id}`, type: 'chatTypePrivate', unreadCount: 0, ...extra }) as ApiChat;
const user = (id: string, extra: Partial<ApiUser> = {}) =>
  ({ id, type: 'userTypeRegular', firstName: `User ${id}`, isMin: false, ...extra }) as ApiUser;
const message = (chatId: string, id: number, text: string) =>
  ({ id, chatId, date: 1, isOutgoing: false, content: { text: { text } } }) as ApiMessage;

function reset() {
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
  setGlobal({ ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: tab } }, { forceOutdated: true });
}

/** The committed global without the DEV stamp (it is never mirrored). */
const committed = () => {
  const { DEBUG_randomId, ...rest } = getGlobal() as GlobalState & { DEBUG_randomId?: number };
  return rest;
};
const mirror = () => {
  const { DEBUG_randomId, ...rest } = unwrap(useGlobal()) as GlobalState & { DEBUG_randomId?: number };
  return rest;
};

/** JSON with sorted keys (the mirror's root starts as `{ isInited: false }`, so key order differs). */
const json = (value: unknown) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );

/** The first path where two JSON-able values differ ('' when equal), for a readable failure. */
function firstDiff(a: any, b: any, path = ''): string {
  if (json(a) === json(b)) return '';
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[key], b[key], `${path}.${key}`);
      if (d) return d;
    }
  }
  return `${path}: ${String(json(a)).slice(0, 80)} vs ${String(json(b)).slice(0, 80)}`;
}

describe('T1 property: random real reducers keep the store mirror equal to the committed global', () => {
  beforeEach(reset);

  it('the mirror equals the committed global after every step; earlier snapshots are never mutated', () => {
    let seed = 20261014;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const chatIds = ['100', '101', '102', '103'];
    const userIds = ['1', '2', '3'];
    let counter = 0;

    for (let round = 0; round < 12; round++) {
      reset();
      const snapshots: { ref: GlobalState; text: string }[] = [];

      for (let step = 0; step < 150; step++) {
        const global = getGlobal();
        const chatId = chatIds[rnd(chatIds.length)];
        const userId = userIds[rnd(userIds.length)];
        const messageId = 1 + rnd(8);
        let next: GlobalState;

        switch (rnd(13)) {
          case 0:
            next = addChats(global, { [chatId]: chat(chatId, { unreadCount: rnd(5) }) });
            break;
          case 1:
            next = updateChat(global, chatId, { title: `T${counter++}`, unreadCount: rnd(9) });
            break;
          case 2:
            next = updateChat(global, chatId, { isMuted: Boolean(rnd(2)) }, true);
            break;
          case 3:
            next = replaceChatListIds(
              global,
              'active',
              chatIds.filter(() => rnd(2) === 0),
            );
            break;
          case 4:
            next = updateChatLastMessageId(global, chatId, messageId);
            break;
          case 5:
            next = addMessages(global, [message(chatId, messageId, `m${counter++}`)]);
            break;
          case 6:
            next = updateChatMessage(global, chatId, messageId, { isEdited: true, editDate: counter++ });
            break;
          case 7:
            next = deleteChatMessages(global, chatId, [messageId]);
            break;
          case 8:
            next = updateListedIds(global, chatId, MAIN_THREAD_ID, [messageId, messageId + 1]);
            break;
          case 9:
            next = replaceTabThreadParam(
              global,
              chatId,
              MAIN_THREAD_ID,
              'viewportIds',
              rnd(3) ? [messageId, messageId + 1] : undefined,
              tabId,
            );
            break;
          case 10:
            next = updateTabState(
              global,
              rnd(2)
                ? { isLeftColumnShown: Boolean(rnd(2)) }
                : ({
                    activeReactions: rnd(2)
                      ? { [`${chatId}/${messageId}`]: { reaction: { type: 'emoji', emoticon: 'x' } } }
                      : {},
                  } as Partial<TabState>),
              tabId,
            );
            break;
          case 11:
            next = updateUser(global, userId, user(userId, { firstName: `U${counter++}` }));
            break;
          default:
            next = updateUsers(global, { [userId]: user(userId, { lastName: `L${counter++}` }) });
        }

        setGlobal(next, { forceOutdated: true });

        if (step % 30 === 0) {
          snapshots.push({ ref: committed(), text: json(committed()) });
        }
        expect(firstDiff(mirror(), committed())).toBe('');
      }

      snapshots.forEach(({ ref, text }) => expect(json(ref)).toBe(text));
      // the steps really changed the state (not a vacuous comparison of two untouched globals)
      expect(Object.keys(getGlobal().chats.byId).length).toBeGreaterThan(0);
      expect(Object.keys(getGlobal().messages.byChatId).length).toBeGreaterThan(0);
      expect(Object.keys(getGlobal().users.byId).length).toBeGreaterThan(0);
    }
  });
});
