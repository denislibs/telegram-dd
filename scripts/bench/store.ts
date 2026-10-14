// Micro-benchmark of the store compat layer's hot paths on a realistic state (docs/store-architecture.md §4).
//
//   pnpm bench:store                    # DEV build of frameact (NODE_ENV unset)
//   NODE_ENV=production pnpm bench:store
//
// The state: 2k chats, 5k users, 50k messages (100 chats x 500), a 2k-id chat list, one tab. The subscribers model a
// rendered chat list (one memo per chat row reading title / unread / last message text) and one open message list (500
// memos). Every operation is a telegram-tt reducer shape: spread copies along the written path, structural sharing
// elsewhere, then `setGlobal(next)` = `applyGlobal` (the compat layer), compared with frameact's own
// `setState(reconcile(next))` at the root, and with tt's `deepDiff(prev, next)` (what tt's multitab paid per idle flush).
import { createMemo, createRoot } from 'frameact';
import { $TRACK, createStore, reconcile, type StoreArray, unwrap } from 'frameact/store';
import { cpus } from 'node:os';

import { applyGlobal, createJournal, journalToDiff, type UntypedSetState } from '../../src/global/store/apply.ts';
import { deepDiff } from '../../src/util/deepDiff.ts';

const CHATS = 2000;
const USERS = 5000;
const CHATS_WITH_HISTORY = 100;
const MESSAGES_PER_CHAT = 500;
const MAIN_THREAD_ID = -1;
const TAB_ID = 1;
const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 300);

type Message = {
  id: number;
  chatId: string;
  senderId: string;
  date: number;
  isOutgoing: boolean;
  isEdited?: boolean;
  content: { text: { text: string; entities?: unknown[] } };
  reactions?: { results: unknown[] };
  viewsCount?: number;
  forwardInfo?: unknown;
  replyInfo?: unknown;
  isPinned?: boolean;
};
type Chat = {
  id: string;
  type: string;
  title: string;
  unreadCount: number;
  unreadMentionsCount: number;
  lastMessage?: Message;
  isMuted?: boolean;
  isPinned?: boolean;
  draftDate?: number;
  accessHash: string;
  photo?: { small: string; big: string };
  color?: number;
  isVerified?: boolean;
  membersCount?: number;
  lastReadInboxMessageId: number;
  lastReadOutboxMessageId: number;
  folderId?: number;
  settings?: { isAutoArchived?: boolean };
};
type User = {
  id: string;
  type: string;
  firstName: string;
  lastName: string;
  usernames?: { username: string; isActive: boolean }[];
  phoneNumber: string;
  accessHash: string;
  avatarPhotoId?: string;
  isPremium?: boolean;
  isContact?: boolean;
  status?: { type: string; wasOnline?: number };
  color?: number;
};
type State = {
  isInited: boolean;
  currentUserId?: string;
  users: { byId: Record<string, User>; statusesById: Record<string, unknown> };
  chats: {
    byId: Record<string, Chat>;
    listIds: { active: string[]; archived: string[] };
    orderedPinnedIds: { active: string[] };
    isFullyLoaded: { active?: boolean };
  };
  messages: {
    byChatId: Record<
      string,
      {
        byId: Record<number, Message>;
        threadsById: Record<number, { listedIds?: number[]; lastViewportIds?: number[]; threadInfo?: unknown }>;
      }
    >;
  };
  byTabId: Record<
    number,
    { id: number; isLeftColumnShown: boolean; messageLists: unknown[]; notifications: unknown[] }
  >;
  settings: { byKey: Record<string, unknown> };
  [slice: string]: unknown;
};

function buildState(): State {
  const users: Record<string, User> = {};
  for (let i = 0; i < USERS; i++) {
    const id = String(100000 + i);
    users[id] = {
      id,
      type: 'userTypeRegular',
      firstName: `User ${i}`,
      lastName: 'Lastname',
      usernames: [{ username: `user${i}`, isActive: true }],
      phoneNumber: `+1555${String(i).padStart(7, '0')}`,
      accessHash: String(i * 7919),
      isContact: i % 3 === 0,
      status: { type: 'userStatusOffline', wasOnline: 1_700_000_000 + i },
      color: i % 7,
    };
  }
  const chats: Record<string, Chat> = {};
  const listIds: string[] = [];
  const byChatId: State['messages']['byChatId'] = {};
  let messageId = 1;
  for (let i = 0; i < CHATS; i++) {
    const id = String(-(1000 + i));
    const lastMessage: Message = {
      id: messageId++,
      chatId: id,
      senderId: String(100000 + (i % USERS)),
      date: 1_700_000_000 + i,
      isOutgoing: false,
      content: { text: { text: `last message of ${i}` } },
    };
    chats[id] = {
      id,
      type: i % 5 === 0 ? 'chatTypeChannel' : 'chatTypeBasicGroup',
      title: `Chat ${i}`,
      unreadCount: i % 4,
      unreadMentionsCount: 0,
      lastMessage,
      accessHash: String(i * 104729),
      photo: { small: `s${i}`, big: `b${i}` },
      color: i % 7,
      membersCount: 10 + (i % 90),
      lastReadInboxMessageId: lastMessage.id,
      lastReadOutboxMessageId: lastMessage.id,
      settings: {},
    };
    listIds.push(id);
    if (i < CHATS_WITH_HISTORY) {
      const byId: Record<number, Message> = {};
      const listedIds: number[] = [];
      for (let m = 0; m < MESSAGES_PER_CHAT; m++) {
        const mid = messageId++;
        byId[mid] = {
          id: mid,
          chatId: id,
          senderId: String(100000 + ((i + m) % USERS)),
          date: 1_700_000_000 + m,
          isOutgoing: m % 2 === 0,
          content: { text: { text: `message ${m} in chat ${i}`, entities: [] } },
          reactions: { results: [] },
          viewsCount: m,
        };
        listedIds.push(mid);
      }
      byChatId[id] = { byId, threadsById: { [MAIN_THREAD_ID]: { listedIds, lastViewportIds: listedIds.slice(-30) } } };
    }
  }
  return {
    isInited: true,
    currentUserId: '100000',
    users: { byId: users, statusesById: {} },
    chats: {
      byId: chats,
      listIds: { active: listIds, archived: [] },
      orderedPinnedIds: { active: [] },
      isFullyLoaded: {},
    },
    messages: { byChatId },
    byTabId: { [TAB_ID]: { id: TAB_ID, isLeftColumnShown: true, messageLists: [], notifications: [] } },
    settings: { byKey: { theme: 'light' } },
    // 60 more top-level slices, as the real GlobalState has ~110 keys
    ...Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`slice${i}`, { value: i }])),
  };
}

// ---- tt-style reducers (spread copies along the path) --------------------------------------------------------

let nextMessageId = 10_000_000;
const openChatId = String(-1000);

function addNewMessage(global: State, chatId: string): State {
  const message: Message = {
    id: nextMessageId++,
    chatId,
    senderId: '100001',
    date: Date.now() / 1000,
    isOutgoing: false,
    content: { text: { text: 'a new message arrived' } },
  };
  const chatMessages = global.messages.byChatId[chatId];
  const thread = chatMessages.threadsById[MAIN_THREAD_ID];
  const chat = global.chats.byId[chatId];
  const listIds = global.chats.listIds.active;
  return {
    ...global,
    messages: {
      ...global.messages,
      byChatId: {
        ...global.messages.byChatId,
        [chatId]: {
          ...chatMessages,
          byId: { ...chatMessages.byId, [message.id]: message },
          threadsById: {
            ...chatMessages.threadsById,
            [MAIN_THREAD_ID]: { ...thread, listedIds: [...(thread.listedIds || []), message.id] },
          },
        },
      },
    },
    chats: {
      ...global.chats,
      byId: { ...global.chats.byId, [chatId]: { ...chat, lastMessage: message, unreadCount: chat.unreadCount + 1 } },
      listIds: { ...global.chats.listIds, active: [chatId, ...listIds.filter((id) => id !== chatId)] },
    },
  };
}

function editMessage(global: State, chatId: string, messageId: number): State {
  const chatMessages = global.messages.byChatId[chatId];
  const message = chatMessages.byId[messageId];
  return {
    ...global,
    messages: {
      ...global.messages,
      byChatId: {
        ...global.messages.byChatId,
        [chatId]: {
          ...chatMessages,
          byId: {
            ...chatMessages.byId,
            [messageId]: {
              ...message,
              isEdited: true,
              content: { ...message.content, text: { text: `edited ${Date.now()}` } },
            },
          },
        },
      },
    },
  };
}

function reorderChatList(global: State): State {
  const active = global.chats.listIds.active;
  const last = active[active.length - 1];
  return {
    ...global,
    chats: { ...global.chats, listIds: { ...global.chats.listIds, active: [last, ...active.slice(0, -1)] } },
  };
}

/** `replaceUsers` after a fetch: every user object is a fresh copy, 100 of them differ (statuses). */
function replaceUsersFresh(global: State): State {
  const byId: Record<string, User> = {};
  let i = 0;
  for (const id of Object.keys(global.users.byId)) {
    const user = global.users.byId[id];
    byId[id] = i++ % 50 === 0 ? { ...user, status: { type: 'userStatusOnline', wasOnline: Date.now() } } : { ...user };
  }
  return { ...global, users: { ...global.users, byId } };
}

/** `updateUsers` with 100 changed users, the rest shared. */
function updateUsersShared(global: State): State {
  const byId = { ...global.users.byId };
  const ids = Object.keys(byId);
  for (let i = 0; i < 100; i++) {
    const id = ids[i * 50];
    byId[id] = { ...byId[id], status: { type: 'userStatusOnline', wasOnline: Date.now() } };
  }
  return { ...global, users: { ...global.users, byId } };
}

function updateTabState(global: State): State {
  return {
    ...global,
    byTabId: {
      ...global.byTabId,
      [TAB_ID]: { ...global.byTabId[TAB_ID], isLeftColumnShown: !global.byTabId[TAB_ID].isLeftColumnShown },
    },
  };
}

// ---- harness --------------------------------------------------------------------------------------------------

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { median: at(0.5), p90: at(0.9), mean };
}

const fmt = (us: number) => (us >= 1000 ? `${(us / 1000).toFixed(2)} ms` : `${us.toFixed(1)} µs`);

interface Row {
  name: string;
  median: number;
  p90: number;
  mean: number;
  recomputes?: number;
  writes?: number;
}
const rows: Row[] = [];

/** `op` times its own hot region (`us`); what follows it (pulling the memos, like a frame would) is not timed. */
function measure(name: string, iterations: number, op: () => { us: number; recomputes?: number; writes?: number }) {
  const samples: number[] = [];
  let recomputes = 0;
  let writes = 0;
  for (let i = 0; i < Math.min(10, iterations); i++) op(); // warm-up
  for (let i = 0; i < iterations; i++) {
    const r = op();
    samples.push(r.us);
    recomputes += r.recomputes ?? 0;
    writes += r.writes ?? 0;
  }
  const s = stats(samples);
  rows.push({ name, ...s, recomputes: recomputes / iterations, writes: writes / iterations });
}

function setupCompat() {
  const [state, setStateTyped] = createStore<State>({ isInited: false } as State);
  let writes = 0;
  const setState: UntypedSetState = (...args) => {
    writes++;
    (setStateTyped as unknown as UntypedSetState)(...args);
  };
  const raw = unwrap(state) as unknown as State;
  const journal = { current: createJournal() };
  /** Applies `next` and returns the time of the apply alone (µs) and the number of leaf writes. */
  const setGlobal = (next: State) => {
    writes = 0;
    const t0 = performance.now();
    applyGlobal(setState, raw, next, journal.current);
    return { us: (performance.now() - t0) * 1000, writes };
  };
  const timed = <T>(fn: () => T) => {
    const t0 = performance.now();
    const result = fn();
    return { us: (performance.now() - t0) * 1000, result };
  };
  return { state, raw, setGlobal, journal, setStateTyped, timed };
}

/** `$TRACK` of a store array (what `For` reads): one subscription to the array's shape. */
const track = <T>(array: readonly T[]) => (array as unknown as StoreArray<T>)[$TRACK];

/** Rendered-UI model: one memo per chat row, one per message of the open chat, one for the list order. */
function subscribe(state: State) {
  let recomputes = 0;
  const memos: (() => unknown)[] = [];
  createRoot(() => {
    for (const id of Object.keys(state.chats.byId)) {
      memos.push(
        createMemo(() => {
          recomputes++;
          const chat = state.chats.byId[id];
          return `${chat.title}|${chat.unreadCount}|${chat.lastMessage?.content.text.text}|${chat.isMuted}`;
        }),
      );
    }
    memos.push(
      createMemo(() => {
        recomputes++;
        return track(state.chats.listIds.active).length;
      }),
    );
    const open = state.messages.byChatId[openChatId];
    for (const id of Object.keys(open.byId)) {
      memos.push(
        createMemo(() => {
          recomputes++;
          const m = open.byId[Number(id)];
          return `${m.content.text.text}|${m.isEdited}|${m.reactions?.results.length}`;
        }),
      );
    }
    memos.push(
      createMemo(() => {
        recomputes++;
        return track(open.threadsById[MAIN_THREAD_ID].listedIds!).length;
      }),
    );
  });
  const pull = () => {
    for (const m of memos) m();
  };
  pull();
  return {
    pull,
    take: () => {
      const n = recomputes;
      recomputes = 0;
      return n;
    },
    count: memos.length,
  };
}

// ---- scenarios ------------------------------------------------------------------------------------------------

const initial = buildState();
const totalMessages = CHATS_WITH_HISTORY * MESSAGES_PER_CHAT + CHATS;
console.log(
  `store compat-layer bench: ${CHATS} chats, ${USERS} users, ${totalMessages} messages (${CHATS_WITH_HISTORY} chats x ${MESSAGES_PER_CHAT}), ` +
    `${ITERATIONS} iterations, frameact ${process.env.NODE_ENV === 'production' ? 'production' : 'DEV'} build`,
);
console.log(`${cpus()[0]?.model ?? 'unknown cpu'}, node ${process.version}\n`);

// 1. cold init: the whole cached global into an empty store (once; the median of 5)
{
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    const { setGlobal } = setupCompat();
    const next = structuredClone(initial);
    samples.push(setGlobal(next).us);
  }
  rows.push({ name: 'setGlobal(cachedGlobal) into an empty store (cold init)', ...stats(samples) });
}

// the main store, with subscribers
const compat = setupCompat();
compat.setGlobal(structuredClone(initial));
const subs = subscribe(compat.state as unknown as State);
console.log(`subscribed: ${subs.count} memos (chat rows + open message list)\n`);
subs.take();

measure('apiUpdate new message (byId + listedIds + chat.lastMessage + list reorder)', ITERATIONS, () => {
  const { us, writes } = compat.setGlobal(addNewMessage(compat.raw, openChatId));
  subs.pull();
  return { us, recomputes: subs.take(), writes };
});
measure('apiUpdate new message, chat without subscribed history', ITERATIONS, () => {
  const { us, writes } = compat.setGlobal(addNewMessage(compat.raw, String(-1050)));
  subs.pull();
  return { us, recomputes: subs.take(), writes };
});
measure('edit one message of the open chat (content.text + isEdited)', ITERATIONS, () => {
  const ids = compat.raw.messages.byChatId[openChatId].threadsById[MAIN_THREAD_ID].listedIds!;
  const { us, writes } = compat.setGlobal(
    editMessage(compat.raw, openChatId, ids[ids.length - 1 - (ITERATIONS % ids.length)]),
  );
  subs.pull();
  return { us, recomputes: subs.take(), writes };
});
measure('chat list reorder (new 2k-id array)', ITERATIONS, () => {
  const { us, writes } = compat.setGlobal(reorderChatList(compat.raw));
  subs.pull();
  return { us, recomputes: subs.take(), writes };
});
measure('updateTabState (one tab field)', ITERATIONS, () => {
  const { us, writes } = compat.setGlobal(updateTabState(compat.raw));
  subs.pull();
  return { us, recomputes: subs.take(), writes };
});
measure('updateUsers: 100 of 5k users changed, rest shared', Math.min(ITERATIONS, 100), () => {
  const { us, writes } = compat.setGlobal(updateUsersShared(compat.raw));
  subs.pull();
  return { us, recomputes: subs.take(), writes };
});
measure('replaceUsers: 5k fresh user copies, 100 changed (worst case: no sharing)', Math.min(ITERATIONS, 50), () => {
  const { us, writes } = compat.setGlobal(replaceUsersFresh(compat.raw));
  subs.pull();
  return { us, recomputes: subs.take(), writes };
});
measure('journalToDiff after a new-message batch (the multitab diff)', ITERATIONS, () => {
  compat.journal.current = createJournal();
  compat.setGlobal(addNewMessage(compat.raw, openChatId));
  return compat.timed(() => journalToDiff(compat.journal.current));
});
measure('reducer + setGlobal: addNewMessage end to end (what an apiUpdate costs)', ITERATIONS, () => {
  const r = compat.timed(() => compat.setGlobal(addNewMessage(compat.raw, openChatId)));
  subs.pull();
  return { us: r.us, recomputes: subs.take(), writes: r.result.writes };
});

// 2. the engine alternative: setState(reconcile(next)) at the root (no journal)
{
  const [state, setState] = createStore<State>(structuredClone(initial));
  const raw = unwrap(state) as unknown as State;
  const subsR = subscribe(state as unknown as State);
  subsR.take();
  measure('engine reconcile(next) at the root: new message', ITERATIONS, () => {
    const next = addNewMessage(raw, openChatId);
    const t0 = performance.now();
    setState(reconcile(next, { key: 'id' }));
    const us = (performance.now() - t0) * 1000;
    subsR.pull();
    return { us, recomputes: subsR.take() };
  });
  measure('engine reconcile(next) at the root: chat list reorder', ITERATIONS, () => {
    const next = reorderChatList(raw);
    const t0 = performance.now();
    setState(reconcile(next, { key: 'id' }));
    const us = (performance.now() - t0) * 1000;
    subsR.pull();
    return { us, recomputes: subsR.take() };
  });
  measure('engine reconcile(next) at the root: updateUsers 100/5k', Math.min(ITERATIONS, 100), () => {
    const next = updateUsersShared(raw);
    const t0 = performance.now();
    setState(reconcile(next, { key: 'id' }));
    const us = (performance.now() - t0) * 1000;
    subsR.pull();
    return { us, recomputes: subsR.take() };
  });
}

// 3. what tt pays: the reducer alone (spread copies), and tt's deepDiff for a multitab flush
{
  let g = structuredClone(initial);
  measure('tt reducer alone: addNewMessage spread copies (no store)', ITERATIONS, () => {
    const t0 = performance.now();
    g = addNewMessage(g, openChatId);
    return { us: (performance.now() - t0) * 1000 };
  });
  const before = structuredClone(initial);
  let after = addNewMessage(before, openChatId);
  after = reorderChatList(after);
  measure("tt multitab deepDiff(prevGlobal, global) after one message (what tt's idle flush paid)", 20, () => {
    const t0 = performance.now();
    deepDiff(before, after);
    return { us: (performance.now() - t0) * 1000 };
  });
  const copy = { ...compat.raw };
  measure('DEV getGlobal() shallow copy of the root (~70 keys here, ~110 in tt)', ITERATIONS, () => {
    const t0 = performance.now();
    const n = Object.keys({ ...copy, DEBUG_randomId: 1 }).length;
    return { us: (performance.now() - t0) * 1000, writes: n };
  });
}

// ---- report ---------------------------------------------------------------------------------------------------

const pad = (s: string, n: number) => s.padEnd(n);
console.log(`${pad('scenario', 86)} ${pad('median', 10)} ${pad('p90', 10)} ${pad('mean', 10)} recomputes  writes`);
for (const r of rows) {
  console.log(
    `${pad(r.name, 86)} ${pad(fmt(r.median), 10)} ${pad(fmt(r.p90), 10)} ${pad(fmt(r.mean), 10)} ` +
      `${r.recomputes === undefined ? '' : r.recomputes.toFixed(1).padStart(10)}  ${r.writes === undefined ? '' : r.writes.toFixed(1)}`,
  );
}
