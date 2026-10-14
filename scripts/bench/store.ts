// Micro-benchmark of the store compat layer's hot paths (docs/store-architecture.md §4).
//
//   pnpm bench:store                      # DEV build of frameact (NODE_ENV unset)
//   NODE_ENV=production pnpm bench:store
//   BENCH_CHATS=10000 BENCH_MESSAGES_PER_CHAT=5000 pnpm bench:store
//
// The state follows telegram-tt 090e38f: `chats.byId` (ApiChat has no `lastMessage`; the last message is an id in
// `chats.lastMessageIds.all`), `users.byId`, `messages.byChatId[id].{byId, threadsById}`, one tab. Two sizes: the
// in-memory global of a heavy account (2k chats, 5k users, 100 chats x 500 messages), and a cache-sized global (what
// `reduceGlobal` keeps: 200 chats, 500 users, ~30 messages per chat; config GLOBAL_STATE_CACHE_* limits).
// Subscribers model the rendered UI: one memo per chat row (title, unread, mute, the last message's text through
// `lastMessageIds`), one per message of the open chat, one `$TRACK` memo per list. Every operation is a tt reducer
// shape (spread copies along the path, structural sharing elsewhere) followed by `setGlobal(next)`, which here is
// `applyGlobal(prev, next)` — the mirror walk — compared with frameact's own `setState(reconcile(next))`, with tt's
// reducer alone, tt's `deepDiff` (one multitab flush) and a model of tt's `updateContainers` (every mounted
// container's mapStateToProps + shallow compare per setGlobal). Rows time the operation alone; the memos are pulled
// afterwards, untimed ("recomputes" counts how many re-ran).
import { createMemo, createRoot } from 'frameact';
import { $TRACK, createStore, reconcile, type StoreArray, unwrap } from 'frameact/store';
import { cpus } from 'node:os';

import { applyGlobal, type UntypedSetState } from '../../src/global/store/apply.ts';
import { areRecordsShallowEqual } from '../../src/util/areShallowEqual.ts';
import { deepDiff } from '../../src/util/deepDiff.ts';

const CHATS = Number(process.env.BENCH_CHATS ?? 2000);
const USERS = Number(process.env.BENCH_USERS ?? 5000);
const CHATS_WITH_HISTORY = Number(process.env.BENCH_CHATS_WITH_HISTORY ?? 100);
const MESSAGES_PER_CHAT = Number(process.env.BENCH_MESSAGES_PER_CHAT ?? 500);
const CACHE = { chats: 200, users: 500, chatsWithHistory: 200, messagesPerChat: 30 };
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
};
type Chat = {
  id: string;
  type: string;
  title: string;
  unreadCount: number;
  unreadMentionsCount: number;
  isMuted?: boolean;
  isPinned?: boolean;
  accessHash: string;
  photo?: { small: string; big: string };
  color?: number;
  membersCount?: number;
  lastReadInboxMessageId: number;
  lastReadOutboxMessageId: number;
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
  isContact?: boolean;
  status?: { type: string; wasOnline?: number };
  color?: number;
};
type Thread = { listedIds?: number[]; lastViewportIds?: number[] };
type State = {
  isInited: boolean;
  currentUserId?: string;
  users: { byId: Record<string, User>; statusesById: Record<string, unknown> };
  chats: {
    byId: Record<string, Chat>;
    listIds: { active: string[]; archived: string[] };
    orderedPinnedIds: { active: string[] };
    lastMessageIds: { all: Record<string, number> };
    isFullyLoaded: { active?: boolean };
  };
  messages: { byChatId: Record<string, { byId: Record<number, Message>; threadsById: Record<number, Thread> }> };
  byTabId: Record<
    number,
    {
      id: number;
      isLeftColumnShown: boolean;
      messageLists: unknown[];
      notifications: unknown[];
      globalSearch: { query?: string; results: { messageId: number; chatId: string }[] };
    }
  >;
  settings: { byKey: Record<string, unknown> };
  [slice: string]: unknown;
};

function buildState(size: { chats: number; users: number; chatsWithHistory: number; messagesPerChat: number }): State {
  const users: Record<string, User> = {};
  for (let i = 0; i < size.users; i++) {
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
  const lastMessageIds: Record<string, number> = {};
  const byChatId: State['messages']['byChatId'] = {};
  let messageId = 1;
  for (let i = 0; i < size.chats; i++) {
    const id = String(-(1000 + i));
    chats[id] = {
      id,
      type: i % 5 === 0 ? 'chatTypeChannel' : 'chatTypeBasicGroup',
      title: `Chat ${i}`,
      unreadCount: i % 4,
      unreadMentionsCount: 0,
      accessHash: String(i * 104729),
      photo: { small: `s${i}`, big: `b${i}` },
      color: i % 7,
      membersCount: 10 + (i % 90),
      lastReadInboxMessageId: 0,
      lastReadOutboxMessageId: 0,
      settings: {},
    };
    listIds.push(id);
    const count = i < size.chatsWithHistory ? size.messagesPerChat : 1; // every chat keeps at least its last message
    const byId: Record<number, Message> = {};
    const listedIds: number[] = [];
    for (let m = 0; m < count; m++) {
      const mid = messageId++;
      byId[mid] = {
        id: mid,
        chatId: id,
        senderId: String(100000 + ((i + m) % size.users)),
        date: 1_700_000_000 + m,
        isOutgoing: m % 2 === 0,
        content: { text: { text: `message ${m} in chat ${i}`, entities: [] } },
        reactions: { results: [] },
        viewsCount: m,
      };
      listedIds.push(mid);
    }
    lastMessageIds[id] = listedIds[listedIds.length - 1];
    byChatId[id] = { byId, threadsById: { [MAIN_THREAD_ID]: { listedIds, lastViewportIds: listedIds.slice(-30) } } };
  }
  return {
    isInited: true,
    currentUserId: '100000',
    users: { byId: users, statusesById: {} },
    chats: {
      byId: chats,
      listIds: { active: listIds, archived: [] },
      orderedPinnedIds: { active: [] },
      lastMessageIds: { all: lastMessageIds },
      isFullyLoaded: {},
    },
    messages: { byChatId },
    byTabId: {
      [TAB_ID]: {
        id: TAB_ID,
        isLeftColumnShown: true,
        messageLists: [],
        notifications: [],
        globalSearch: { results: [] },
      },
    },
    settings: { byKey: { theme: 'light' } },
    // the real GlobalState has ~110 top-level keys
    ...Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`slice${i}`, { value: i, nested: { flag: false } }])),
  };
}

function countObjects(value: unknown, seen = new Set<object>()): number {
  if (!value || typeof value !== 'object' || seen.has(value)) return 0;
  seen.add(value);
  let n = 1;
  for (const v of Object.values(value as AnyLiteral)) n += countObjects(v, seen);
  return n;
}

/** Objects reachable from `value` that are not in `shared` (the store's own container copies). */
function countOwnObjects(value: unknown, shared: Set<object>, seen = new Set<object>()): number {
  if (!value || typeof value !== 'object' || seen.has(value) || shared.has(value)) return 0;
  seen.add(value);
  let n = 1;
  for (const v of Object.values(value as AnyLiteral)) n += countOwnObjects(v, shared, seen);
  return n;
}

// ---- tt-style reducers (spread copies along the path) --------------------------------------------------------

let nextMessageId = 10_000_000;
let editCounter = 0;
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
      byId: { ...global.chats.byId, [chatId]: { ...chat, unreadCount: chat.unreadCount + 1 } },
      lastMessageIds: {
        ...global.chats.lastMessageIds,
        all: { ...global.chats.lastMessageIds.all, [chatId]: message.id },
      },
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
              content: { ...message.content, text: { text: `edited #${++editCounter}` } },
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

function updateTabState(global: State, partial: Partial<State['byTabId'][number]>): State {
  return { ...global, byTabId: { ...global.byTabId, [TAB_ID]: { ...global.byTabId[TAB_ID], ...partial } } };
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

const timed = <T>(fn: () => T) => {
  const t0 = performance.now();
  const result = fn();
  return { us: (performance.now() - t0) * 1000, result };
};

/** The compat layer in miniature: a committed global and the store mirror. */
function setupCompat() {
  const [state, setStateTyped] = createStore<State>({ isInited: false } as State);
  let writes = 0;
  const setState: UntypedSetState = (...args) => {
    writes++;
    (setStateTyped as unknown as UntypedSetState)(...args);
  };
  let committed = { isInited: false } as State;
  /** Commits `next` and mirrors it; returns the time of the mirror walk alone (µs) and the number of leaf writes. */
  const setGlobal = (next: State) => {
    writes = 0;
    const prev = committed;
    committed = next;
    const t0 = performance.now();
    applyGlobal(setState, prev, next);
    return { us: (performance.now() - t0) * 1000, writes };
  };
  return { state, setGlobal, getGlobal: () => committed, mirror: () => unwrap(state) as unknown as State };
}

/** `$TRACK` of a store array (what `For` reads): one subscription to the array's shape. */
const track = <T>(array: readonly T[]) => (array as unknown as StoreArray<T>)[$TRACK];

/** Rendered-UI model: one memo per chat row, one per message of the open chat, one for each list. */
function subscribe(state: State) {
  let recomputes = 0;
  const memos: (() => unknown)[] = [];
  createRoot(() => {
    for (const id of Object.keys(state.chats.byId)) {
      memos.push(
        createMemo(() => {
          recomputes++;
          const chat = state.chats.byId[id];
          const lastId = state.chats.lastMessageIds.all[id];
          const last = state.messages.byChatId[id]?.byId[lastId];
          return `${chat.title}|${chat.unreadCount}|${chat.isMuted}|${last?.content.text.text}`;
        }),
      );
    }
    memos.push(createMemo(() => (recomputes++, track(state.chats.listIds.active).length)));
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
    memos.push(createMemo(() => (recomputes++, track(open.threadsById[MAIN_THREAD_ID].listedIds!).length)));
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

/** tt's `updateContainers`: every mounted container maps the whole global and shallow-compares; the same rows. */
function ttContainers(global: () => State) {
  const mappers: ((g: State) => AnyLiteral)[] = [];
  for (const id of Object.keys(global().chats.byId)) {
    mappers.push((g) => {
      const chat = g.chats.byId[id];
      const lastId = g.chats.lastMessageIds.all[id];
      return {
        chat,
        lastMessage: g.messages.byChatId[id]?.byId[lastId],
        isSelected: g.currentUserId === id,
        isMuted: chat.isMuted,
        orderedIds: g.chats.listIds.active,
        tab: g.byTabId[TAB_ID].isLeftColumnShown,
      };
    });
  }
  const open = openChatId;
  for (const id of Object.keys(global().messages.byChatId[open].byId)) {
    mappers.push((g) => ({ message: g.messages.byChatId[open].byId[Number(id)], chat: g.chats.byId[open] }));
  }
  const mapped = mappers.map((m) => m(global()));
  return {
    count: mappers.length,
    update() {
      let updated = 0;
      const g = global();
      for (let i = 0; i < mappers.length; i++) {
        const next = mappers[i](g);
        if (!areRecordsShallowEqual(mapped[i], next)) {
          mapped[i] = next;
          updated++;
        }
      }
      return updated;
    },
  };
}

const heapMb = () => {
  (globalThis as AnyLiteral).gc?.();
  return process.memoryUsage().heapUsed / 1024 / 1024;
};

// ---- scenarios ------------------------------------------------------------------------------------------------

const initial = buildState({
  chats: CHATS,
  users: USERS,
  chatsWithHistory: CHATS_WITH_HISTORY,
  messagesPerChat: MESSAGES_PER_CHAT,
});
const totalMessages = Object.values(initial.messages.byChatId).reduce((n, c) => n + Object.keys(c.byId).length, 0);
console.log(
  `store compat-layer bench: ${CHATS} chats, ${USERS} users, ${totalMessages} messages (${CHATS_WITH_HISTORY} chats x ${MESSAGES_PER_CHAT} + last messages), ` +
    `${countObjects(initial)} objects; ${ITERATIONS} iterations, frameact ${process.env.NODE_ENV === 'production' ? 'production' : 'DEV'} build`,
);
console.log(
  `${cpus()[0]?.model ?? 'unknown cpu'}, node ${process.version}${(globalThis as AnyLiteral).gc ? '' : ' (run with NODE_OPTIONS=--expose-gc for memory rows)'}\n`,
);

// memory: the committed global alone vs. with the store mirror on top
{
  const before = heapMb();
  const keep = buildState({
    chats: CHATS,
    users: USERS,
    chatsWithHistory: CHATS_WITH_HISTORY,
    messagesPerChat: MESSAGES_PER_CHAT,
  });
  const withGlobal = heapMb();
  const { setGlobal, mirror } = setupCompat();
  setGlobal(keep);
  const withMirror = heapMb();
  const globalObjects = new Set<object>();
  countObjects(keep, globalObjects);
  rows.push({
    name: `memory: tt global alone (${countObjects(keep)} objects) [MB in writes column]`,
    median: 0,
    p90: 0,
    mean: 0,
    writes: withGlobal - before,
  });
  rows.push({
    name: `memory: + store mirror (containers copied, entities shared) [MB]`,
    median: 0,
    p90: 0,
    mean: 0,
    writes: withMirror - withGlobal,
  });
  rows.push({
    name: `memory: store-owned container copies, not shared with the global [count in writes column]`,
    median: 0,
    p90: 0,
    mean: 0,
    writes: countOwnObjects(mirror(), globalObjects),
  });
}

// cold starts: the cache-sized global (what tt restores at start) and the full master global (`globalUpdate` to a new tab)
{
  const cacheSized = buildState(CACHE);
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) samples.push(setupCompat().setGlobal(structuredClone(cacheSized)).us);
  rows.push({
    name: `cold start: setGlobal(cached global) — ${countObjects(cacheSized)} objects, tt cache limits`,
    ...stats(samples),
  });
  const full: number[] = [];
  for (let i = 0; i < 3; i++) full.push(setupCompat().setGlobal(structuredClone(initial)).us);
  rows.push({ name: `cold start: setGlobal(globalUpdate from the master) — the full state`, ...stats(full) });
}

// the main store, with subscribers
const compat = setupCompat();
compat.setGlobal(structuredClone(initial));
const subs = subscribe(compat.state as unknown as State);
console.log(`subscribed: ${subs.count} memos (chat rows + open message list)\n`);
subs.take();

const run = (next: () => State) => {
  const { us, writes } = compat.setGlobal(next());
  subs.pull();
  return { us, recomputes: subs.take(), writes };
};
measure('apiUpdate new message: byId +1, listedIds, chat.unreadCount, lastMessageIds, list reorder', ITERATIONS, () =>
  run(() => addNewMessage(compat.getGlobal(), openChatId)),
);
measure('apiUpdate new message, chat without an open history', ITERATIONS, () =>
  run(() => addNewMessage(compat.getGlobal(), String(-1050))),
);
measure('edit one subscribed message of the open chat (content.text + isEdited)', ITERATIONS, () => {
  const ids = compat.getGlobal().messages.byChatId[openChatId].threadsById[MAIN_THREAD_ID].listedIds!;
  return run(() =>
    editMessage(compat.getGlobal(), openChatId, ids[editCounter % Math.min(ids.length, MESSAGES_PER_CHAT)]),
  );
});
measure('chat list reorder (new 2k-id array)', ITERATIONS, () => run(() => reorderChatList(compat.getGlobal())));
measure('updateTabState (one tab field)', ITERATIONS, () =>
  run(() =>
    updateTabState(compat.getGlobal(), { isLeftColumnShown: !compat.getGlobal().byTabId[TAB_ID].isLeftColumnShown }),
  ),
);
measure('globalSearch: a new query with 5k results (tab record merged, the results array by reference)', 50, () => {
  const results = Array.from({ length: 5000 }, (_, i) => ({ messageId: i, chatId: openChatId }));
  return run(() => updateTabState(compat.getGlobal(), { globalSearch: { query: `q${editCounter++}`, results } }));
});
measure('globalSearch: a keystroke that keeps the 5k results (same array, new record)', ITERATIONS, () =>
  run(() =>
    updateTabState(compat.getGlobal(), {
      globalSearch: { ...compat.getGlobal().byTabId[TAB_ID].globalSearch, query: `k${editCounter++}` },
    }),
  ),
);
measure('updateUsers: 100 of 5k users changed, rest shared', Math.min(ITERATIONS, 100), () =>
  run(() => updateUsersShared(compat.getGlobal())),
);
measure('replaceUsers: 5k fresh user copies, 100 changed (shallow-equal skip)', Math.min(ITERATIONS, 50), () =>
  run(() => replaceUsersFresh(compat.getGlobal())),
);
measure('reducer + setGlobal: addNewMessage end to end', ITERATIONS, () => {
  const r = timed(() => compat.setGlobal(addNewMessage(compat.getGlobal(), openChatId)));
  subs.pull();
  return { us: r.us, recomputes: subs.take(), writes: r.result.writes };
});

// the engine alternative: setState(reconcile(next)) at the root
{
  const [state, setState] = createStore<State>(structuredClone(initial));
  const raw = unwrap(state) as unknown as State;
  const subsR = subscribe(state as unknown as State);
  subsR.take();
  const runR = (name: string, iterations: number, next: () => State) =>
    measure(`engine reconcile(next) at the root: ${name}`, iterations, () => {
      const n = next();
      const t0 = performance.now();
      setState(reconcile(n, { key: 'id' }));
      const us = (performance.now() - t0) * 1000;
      subsR.pull();
      return { us, recomputes: subsR.take() };
    });
  runR('new message', ITERATIONS, () => addNewMessage(raw, openChatId));
  runR('chat list reorder', ITERATIONS, () => reorderChatList(raw));
  runR('updateUsers 100/5k', Math.min(ITERATIONS, 100), () => updateUsersShared(raw));
}

// what tt pays: the reducer alone, deepDiff for a multitab flush, and updateContainers per setGlobal
{
  let g = structuredClone(initial);
  const containers = ttContainers(() => g);
  measure('tt reducer alone: addNewMessage spread copies (no store)', ITERATIONS, () => {
    const t0 = performance.now();
    g = addNewMessage(g, openChatId);
    return { us: (performance.now() - t0) * 1000 };
  });
  measure(
    `tt updateContainers after a new message: ${containers.count} mapStateToProps + shallow compare`,
    Math.min(ITERATIONS, 100),
    () => {
      g = addNewMessage(g, openChatId);
      const t0 = performance.now();
      const updated = containers.update();
      return { us: (performance.now() - t0) * 1000, recomputes: updated };
    },
  );
  measure('tt updateContainers after updateTabState (one field)', Math.min(ITERATIONS, 100), () => {
    g = updateTabState(g, { isLeftColumnShown: !g.byTabId[TAB_ID].isLeftColumnShown });
    const t0 = performance.now();
    const updated = containers.update();
    return { us: (performance.now() - t0) * 1000, recomputes: updated };
  });
  const before = structuredClone(initial);
  const after = reorderChatList(addNewMessage(before, openChatId));
  measure("tt multitab deepDiff(prevGlobal, global) after one message (what tt's idle flush paid)", 20, () => {
    const t0 = performance.now();
    deepDiff(before, after);
    return { us: (performance.now() - t0) * 1000 };
  });
  const copy = { ...compat.getGlobal() };
  measure(`getGlobal() shallow copy of the root (${Object.keys(copy).length} keys)`, ITERATIONS, () => {
    const t0 = performance.now();
    const n = Object.keys({ ...copy, DEBUG_randomId: 1 }).length;
    return { us: (performance.now() - t0) * 1000, writes: n };
  });
}

// ---- report ---------------------------------------------------------------------------------------------------

const pad = (s: string, n: number) => s.padEnd(n);
console.log(`${pad('scenario', 96)} ${pad('median', 10)} ${pad('p90', 10)} ${pad('mean', 10)} recomputes  writes`);
for (const r of rows) {
  console.log(
    `${pad(r.name, 96)} ${pad(fmt(r.median), 10)} ${pad(fmt(r.p90), 10)} ${pad(fmt(r.mean), 10)} ` +
      `${r.recomputes === undefined ? '' : r.recomputes.toFixed(1).padStart(10)}  ${r.writes === undefined ? '' : r.writes.toFixed(1)}`,
  );
}
