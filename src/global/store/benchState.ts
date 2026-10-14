// The state of docs/store-architecture.md §4 built with real tt shapes (2 000 chats, 5 000 users, 100 chats x 500
// messages), for the opt-in timing tests (`BENCH_CACHE=1`, `BENCH_STATE=1`); not imported by anything else.
import type { ApiChat, ApiMessage, ApiUser } from '../../api/types';
import type { GlobalState, TabState } from '../types';
import { MAIN_THREAD_ID } from '../../api/types';

import { getCurrentTabId } from '../../util/establishMultitabRole';
import { cloneDeep } from '../../util/iteratees';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../initialState';

export function buildBenchGlobal(): GlobalState {
  const tabId = getCurrentTabId();
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
  const base: GlobalState = {
    ...cloneDeep(INITIAL_GLOBAL_STATE),
    byTabId: { [tabId]: tab },
    isInited: true,
    currentUserId: '1',
  };

  const chats: Record<string, ApiChat> = {};
  const users: Record<string, ApiUser> = {};
  const lastMessageIds: Record<string, number> = {};
  const byChatId: GlobalState['messages']['byChatId'] = {};
  for (let i = 0; i < 2000; i++) {
    const id = String(1000 + i);
    chats[id] = { id, title: `Chat ${id}`, type: 'chatTypePrivate', unreadCount: i % 7 } as ApiChat;
    lastMessageIds[id] = 500;
  }
  for (let i = 0; i < 5000; i++) {
    users[String(i)] = { id: String(i), type: 'userTypeRegular', firstName: `User ${i}`, isMin: false } as ApiUser;
  }
  for (let c = 0; c < 100; c++) {
    const chatId = String(1000 + c);
    const byId: Record<number, ApiMessage> = {};
    const ids: number[] = [];
    for (let m = 1; m <= 500; m++) {
      byId[m] = {
        id: m,
        chatId,
        date: 1000 + m,
        isOutgoing: false,
        content: { text: { text: `message ${m} of ${chatId}` } },
      };
      ids.push(m);
    }
    byChatId[chatId] = {
      byId,
      ephemeralById: {},
      anchoredById: {},
      summaryById: {},
      threadsById: { [MAIN_THREAD_ID]: { localState: { listedIds: ids }, readState: {} } },
    } as never;
  }

  return {
    ...base,
    chats: {
      ...base.chats,
      byId: chats,
      listIds: { active: Object.keys(chats) },
      lastMessageIds: { all: lastMessageIds },
    },
    users: { ...base.users, byId: users },
    messages: { ...base.messages, byChatId },
  };
}

/** Median of `n` runs of `fn`, in ms. */
export function medianMs(fn: () => unknown, n = 15) {
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return samples.sort((a, b) => a - b)[Math.floor(n / 2)];
}
