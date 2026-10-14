// T3 (docs/plans/2026-10-14-store.md): tt's cache.ts (imports only differ) round-trips the committed global through
// IndexedDB (`fake-indexeddb`): setupCaching() -> a write -> the 5 s throttle -> loadCache() -> setGlobal() -> the
// cached slices equal the original ones and the store mirror equals the committed global. The passcode path writes the
// lock-screen version plus the vault snapshot (a mocked `getDek`).
import 'fake-indexeddb/auto';

import { unwrap } from 'frameact/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiChat, ApiMessage, ApiUser } from '../api/types';
import type { GlobalState, TabState } from './types';
import { MAIN_THREAD_ID } from '../api/types';

import { IS_SCREEN_LOCKED_CACHE_KEY } from '../config';
import { MAIN_IDB_STORE } from '../util/browser/idb';
import { getCurrentTabId } from '../util/establishMultitabRole';
import { cloneDeep } from '../util/iteratees';
import { getGlobalStateCacheKey } from '../util/multiaccount';
import { getDek, writeGlobalsVaultForSlot } from '../util/passcode';
import { addChats, replaceChatListIds, updateChatLastMessageId } from './reducers/chats';
import { addMessages, updateMessageStore } from './reducers/messages';
import { updateUsers } from './reducers/users';
import { buildBenchGlobal, medianMs } from './store/benchState';
import { clearCaching, loadCache, serializeGlobal, setupCaching } from './cache';
import { getGlobal, setGlobal, useGlobal } from './index';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from './initialState';
import { initGlobalOrDropCache } from './safeInit';

vi.mock('../util/sessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../util/sessions')>()),
  hasStoredSession: () => true,
}));
vi.mock('../util/passcode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../util/passcode')>()),
  getDek: vi.fn(() => undefined),
  writeGlobalsVaultForSlot: vi.fn(() => Promise.resolve()),
}));

const tabId = getCurrentTabId();
const CACHE_KEY = getGlobalStateCacheKey(undefined);

const chat = (id: string, extra: Partial<ApiChat> = {}) =>
  ({ id, title: `Chat ${id}`, type: 'chatTypePrivate', unreadCount: 0, ...extra }) as ApiChat;
const user = (id: string) => ({ id, type: 'userTypeRegular', firstName: `User ${id}`, isMin: false }) as ApiUser;
const message = (chatId: string, id: number, text: string) =>
  ({ id, chatId, date: 1000 + id, isOutgoing: false, content: { text: { text } } }) as ApiMessage;

function seed(): GlobalState {
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
  let global: GlobalState = {
    ...cloneDeep(INITIAL_GLOBAL_STATE),
    byTabId: { [tabId]: tab },
    isInited: true,
    currentUserId: '1',
  };
  global = addChats(global, { '100': chat('100'), '200': chat('200', { title: 'Second' }) });
  global = replaceChatListIds(global, 'active', ['100', '200']);
  global = updateUsers(global, { '1': user('1'), '2': user('2') });
  global = addMessages(global, [message('100', 1, 'first'), message('100', 2, 'second')]);
  global = updateMessageStore(global, '100', {
    threadsById: { [MAIN_THREAD_ID]: { localState: { listedIds: [1, 2] }, readState: {}, threadInfo: undefined } },
  } as never);
  global = updateChatLastMessageId(global, '100', 2);
  return global;
}

const sorted = (value: unknown) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );

/**
 * Advance the 5 s cache throttle (fake setInterval/Date): the first interval tick runs the write, the second finds
 * nothing pending and clears the interval (the throttle lives in a module closure, so it must end clean). Then the
 * IndexedDB write settles on real timers.
 */
async function flushThrottle() {
  await vi.advanceTimersByTimeAsync(5000);
  await vi.advanceTimersByTimeAsync(5000);
  vi.useRealTimers();
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearCaching();
  await MAIN_IDB_STORE.clear();
  setGlobal(
    { ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: seed().byTabId[tabId] } },
    { forceOutdated: true },
  );
});

describe('cache.ts on the store: the real round trip', () => {
  it('setupCaching -> a write -> the 5 s throttle -> loadCache -> setGlobal restores the cached slices', async () => {
    setGlobal(seed(), { forceOutdated: true });
    setupCaching();
    // the callback runs at tick end after a write; the throttle fires 5 s later and writes through onFullyIdle
    setGlobal({
      ...getGlobal(),
      chats: { ...getGlobal().chats, byId: { ...getGlobal().chats.byId, '300': chat('300') } },
    });
    await vi.advanceTimersByTimeAsync(0);
    await flushThrottle();
    await vi.waitFor(async () => expect(await MAIN_IDB_STORE.get(CACHE_KEY)).toBeDefined());
    // stop caching before the next writes: the throttle lives in a module closure and must not be re-armed on real timers
    clearCaching();

    const written = getGlobal();
    const cache = await loadCache(cloneDeep(INITIAL_GLOBAL_STATE));
    expect(cache).toBeDefined();
    // the cached slices equal the originals (reduceGlobal trims lists, never changes the entities it keeps)
    expect(sorted(cache!.chats.byId)).toBe(sorted(written.chats.byId));
    expect(sorted(cache!.chats.listIds)).toBe(sorted(written.chats.listIds));
    expect(sorted(cache!.users.byId)).toBe(sorted(written.users.byId));
    // reduceGlobal keeps the messages around the viewport / the last ones; those it keeps are the same entities
    const cachedMessages = cache!.messages.byChatId['100'].byId;
    expect(Object.keys(cachedMessages)).toContain('2');
    Object.values(cachedMessages).forEach((cached) => {
      expect(sorted(cached)).toBe(sorted(written.messages.byChatId['100'].byId[cached.id]));
    });
    expect(cache!.currentUserId).toBe('1');

    // util/init.ts does setGlobal(cache): the mirror gets the cached tree and equals the committed global
    setGlobal({ ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: written.byTabId }, { forceOutdated: true });
    expect(getGlobal().chats.byId).toEqual({});
    setGlobal({ ...cache!, byTabId: written.byTabId }, { forceOutdated: true });
    const { DEBUG_randomId, ...committed } = getGlobal() as GlobalState & { DEBUG_randomId?: number };
    expect(sorted(unwrap(useGlobal()))).toBe(sorted(committed));
    expect(useGlobal().chats.byId['200'].title).toBe('Second');
    expect(useGlobal().messages.byChatId['100'].byId[2].content.text?.text).toBe('second');
  });

  it('does not write while caching is off, and clearCaching() stops the callback', async () => {
    setGlobal(seed(), { forceOutdated: true });
    setupCaching();
    clearCaching();
    setGlobal({ ...getGlobal(), isSyncing: true });
    await vi.advanceTimersByTimeAsync(0);
    await flushThrottle();
    expect(await MAIN_IDB_STORE.get(CACHE_KEY)).toBeUndefined();
  });

  it('passcode on: the lock-screen snapshot is cached and the full one goes to the encrypted vault (mocked getDek)', async () => {
    vi.mocked(getDek).mockReturnValue({} as CryptoKey);
    localStorage.setItem(IS_SCREEN_LOCKED_CACHE_KEY, 'false');
    const global = seed();
    setGlobal(
      { ...global, passcode: { ...global.passcode, hasPasscode: true, isScreenLocked: false } },
      { forceOutdated: true },
    );
    setupCaching();
    setGlobal({ ...getGlobal(), isSyncing: true });
    await vi.advanceTimersByTimeAsync(0);
    await flushThrottle();
    await vi.waitFor(() => expect(writeGlobalsVaultForSlot).toHaveBeenCalled());

    // the vault got the serialized full global ...
    const [, serialized] = vi.mocked(writeGlobalsVaultForSlot).mock.calls[0];
    expect(serialized).toBe(serializeGlobal(getGlobal()));
    expect(JSON.parse(serialized).chats.byId['100'].title).toBe('Chat 100');
    // ... and the plaintext cache holds no chats (clearGlobalForLockScreen)
    await vi.waitFor(async () => expect(await MAIN_IDB_STORE.get(CACHE_KEY)).toBeDefined());
    const plain = (await MAIN_IDB_STORE.get<GlobalState>(CACHE_KEY))!;
    expect(plain.chats.byId).toEqual({});
    expect(plain.passcode.hasPasscode).toBe(true);
  });
});

describe('a corrupted cache never blocks the start (appsec 2 and 6)', () => {
  const put = (value: unknown) => MAIN_IDB_STORE.set(CACHE_KEY, value);

  it('loadCache falls back to a fresh state when the cache is {} (tt throws and leaves a white screen)', async () => {
    await put({});
    await expect(loadCache(cloneDeep(INITIAL_GLOBAL_STATE))).resolves.toBeUndefined();
    expect(await MAIN_IDB_STORE.get(CACHE_KEY)).toBeUndefined(); // the bad cache is dropped, not retried on every reload
  });

  /* eslint-disable no-null/no-null -- corrupted records written on purpose */
  it.each([
    ['null', null],
    ['a string', 'garbage'],
    ['no sharedState', { chats: {} }],
    ['passcode: null', { sharedState: cloneDeep(INITIAL_GLOBAL_STATE).sharedState, passcode: null }],
  ])('loadCache survives a cache that is %s', async (_name, value) => {
    /* eslint-enable no-null/no-null */
    await put(value);
    // never throws (null is just an empty cache: the start goes on from the initial state)
    await expect(loadCache(cloneDeep(INITIAL_GLOBAL_STATE))).resolves.not.toBeInstanceOf(Error);
  });

  it('a cyclic cache (structured clone keeps cycles) is dropped by initGlobalOrDropCache and the app starts fresh', async () => {
    const cyclic = cloneDeep(INITIAL_GLOBAL_STATE) as any;
    cyclic.settings.byKey.self = cyclic.settings; // refused by the mirror walk: a cycle
    await put(cyclic);
    // jsdom has no Web Locks; the passcode boot step takes one
    vi.stubGlobal(
      'navigator',
      Object.create(navigator, { locks: { value: { request: (_n: string, cb: () => unknown) => cb() } } }),
    );
    setGlobal({ isInited: false } as GlobalState, { forceOutdated: true }); // as at boot: no byTabId yet
    expect('byTabId' in getGlobal()).toBe(false);

    await initGlobalOrDropCache();

    expect('byTabId' in getGlobal()).toBe(true);
    expect(await MAIN_IDB_STORE.get(CACHE_KEY)).toBeUndefined();
    expect('self' in getGlobal().settings.byKey).toBe(false);
    expect('self' in useGlobal().settings.byKey).toBe(false);
  });
});

// T3.3: `BENCH_CACHE=1 pnpm exec vitest run src/global/cache.test.ts` prints what reduceGlobal costs on the bench state
// of docs/store-architecture.md §4 (2 000 chats, 5 000 users, 100 chats x 500 messages). It is tt's code over plain
// objects, so the number is tt's, not the store's. Skipped otherwise.
describe.skipIf(!process.env.BENCH_CACHE)('reduceGlobal on the §4 bench state', () => {
  it('prints the median cost', () => {
    setGlobal(buildBenchGlobal(), { forceOutdated: true });

    const serialized = serializeGlobal(getGlobal());
    const reduced = JSON.parse(serialized);
    const serializeMs = medianMs(() => serializeGlobal(getGlobal()));
    const stringifyMs = medianMs(() => JSON.stringify(reduced));
    // eslint-disable-next-line no-console
    console.info(
      `[bench] serializeGlobal ${serializeMs.toFixed(2)} ms = reduceGlobal ~${(serializeMs - stringifyMs).toFixed(2)} ms` +
        ` + JSON.stringify ${stringifyMs.toFixed(2)} ms (${(serialized.length / 1024).toFixed(0)} KiB cached)`,
    );
    expect(serializeMs).toBeGreaterThan(0);
  });
});
