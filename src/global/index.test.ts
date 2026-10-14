import 'fake-indexeddb/auto';
import './actions/apiUpdaters/twoFaSettings';

import { beginHeavyAnimation, createEffect, createMemo, createRoot, flushSync, frameMutation } from 'frameact';
import { unwrap } from 'frameact/store';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ApiUpdate } from '../api/types';
import type { GlobalState, TabState } from './types';

import { DEBUG } from '../config';
import { MAIN_IDB_STORE } from '../util/browser/idb';
import { getCurrentTabId } from '../util/establishMultitabRole';
import { cloneDeep, pick } from '../util/iteratees';
import { updateTabState } from './reducers/tabs';
import { selectTabState } from './selectors/tabs';
import {
  addActionHandler,
  addCallback,
  execAfterActions,
  getActions,
  getGlobal,
  getPromiseActions,
  removeCallback,
  setGlobal,
  useGlobal,
  withGlobal,
} from './index';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from './initialState';

const tabId = getCurrentTabId();
const actions = getActions() as unknown as Record<string, (payload?: unknown, options?: AnyLiteral) => void>;
const register = addActionHandler as unknown as (name: string, handler: (...args: any[]) => unknown) => void;
const tick = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

function resetGlobal() {
  const initial = cloneDeep(INITIAL_GLOBAL_STATE);
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
  setGlobal({ ...initial, byTabId: { [tabId]: tab } }, { forceOutdated: true });
}

const chat = (id: string, title = id) => ({ id, title, type: 'chatTypePrivate', unreadCount: 0 }) as any;

beforeAll(() => {
  resetGlobal();
});

afterEach(async () => {
  await tick();
  resetGlobal();
  await tick();
});

describe('tt action semantics on the frameact store', () => {
  it('runs a ported tt handler unchanged: apiUpdate → twoFaSettings written in place', () => {
    const twoFa = getGlobal().twoFaSettings;
    actions.apiUpdate({ '@type': 'updateTwoFaStateWaitCode', length: 6 } satisfies ApiUpdate);
    expect(getGlobal().twoFaSettings.waitingEmailCodeLength).toBe(6);
    expect(getGlobal().twoFaSettings.isLoading).toBe(false);
    expect(unwrap(useGlobal()).twoFaSettings).toBe(twoFa); // merged in place, identity kept
  });

  it('queues a nested action after the current handler and runs execAfterActions after the cascade', () => {
    const log: string[] = [];
    register('test:outer', (global: GlobalState) => {
      log.push('outer:start');
      actions['test:inner']();
      log.push('outer:end');
      execAfterActions(() => log.push('after'));
      return { ...global, isSyncing: true };
    });
    register('test:inner', (global: GlobalState) => {
      log.push(`inner sees isSyncing=${String(global.isSyncing)}`);
      return { ...global, isSynced: true };
    });

    actions['test:outer']();

    expect(log).toEqual(['outer:start', 'outer:end', 'inner sees isSyncing=true', 'after']);
    expect(getGlobal().isSynced).toBe(true);
  });

  it('runs every handler of a name in registration order, each seeing the previous result', () => {
    register('test:multi', (global: GlobalState) => ({ ...global, isSyncing: true }));
    register('test:multi', (global: GlobalState) => ({ ...global, isSynced: global.isSyncing === true }));
    actions['test:multi']();
    expect(pick(getGlobal(), ['isSyncing', 'isSynced'])).toEqual({ isSyncing: true, isSynced: true });
  });

  it('awaits async handlers through getPromiseActions', async () => {
    register('test:async', async () => {
      await tick();
      setGlobal({ ...getGlobal(), isSynced: true });
    });
    const promise = (getPromiseActions() as unknown as Record<string, () => Promise<void>>)['test:async']();
    expect(getGlobal().isSynced).toBeFalsy();
    await promise;
    expect(getGlobal().isSynced).toBe(true);
  });

  it.skipIf(!DEBUG)('DEV: refuses an outdated global unless forceOutdated is set', async () => {
    const stale = getGlobal();
    setGlobal({ ...getGlobal(), isSyncing: true });
    expect(() => setGlobal({ ...stale, isSynced: true })).toThrow(/outdated/);
    expect(getGlobal().isSynced).toBeFalsy();
    setGlobal({ ...stale, isSynced: true }, { forceOutdated: true });
    expect(getGlobal().isSynced).toBe(true);
    // a global taken in a previous tick is outdated too
    const g = getGlobal();
    await tick();
    expect(() => setGlobal({ ...g })).toThrow(/outdated/);
  });
});

describe('store callbacks (cache / multitab feed)', () => {
  it('runs once per tick with the composed diff of every setGlobal', async () => {
    const calls: AnyLiteral[] = [];
    const cb = (_global: GlobalState, diff?: AnyLiteral) => calls.push(diff);
    addCallback(cb);
    try {
      setGlobal({ ...getGlobal(), isSyncing: true });
      setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, byId: { a: chat('a') } } });
      setGlobal(updateTabState(getGlobal(), { isLeftColumnShown: false }, tabId));
      expect(calls).toEqual([]);
      await tick();
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({
        isSyncing: true,
        chats: { byId: { a: chat('a') } },
        byTabId: { [tabId]: { isLeftColumnShown: false } },
      });
    } finally {
      removeCallback(cb);
    }
  });

  it('waits for a heavy animation unless the write is forced (forceOnHeavyAnimation / forceSyncOnIOs)', async () => {
    const calls: AnyLiteral[] = [];
    const cb = (_global: GlobalState, diff?: AnyLiteral) => calls.push(diff);
    addCallback(cb);
    const end = beginHeavyAnimation(10_000, true);
    try {
      setGlobal({ ...getGlobal(), isSyncing: true });
      await tick();
      expect(calls).toEqual([]);

      setGlobal({ ...getGlobal(), isSynced: true }, { forceOnHeavyAnimation: true });
      await tick();
      expect(calls).toEqual([{ isSyncing: true, isSynced: true }]);

      setGlobal({ ...getGlobal(), isFetchingDifference: true }, { forceSyncOnIOs: true });
      expect(calls).toHaveLength(2); // synchronously, before the tick
      expect(calls[1]).toEqual({ isFetchingDifference: true });
    } finally {
      end();
      removeCallback(cb);
    }
  });

  it('round-trips a cached global through IndexedDB back into the store', async () => {
    setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, byId: { a: chat('a'), b: chat('b') } } });
    setGlobal(updateTabState(getGlobal(), { isLeftColumnShown: false }, tabId));
    const cached = pick(getGlobal(), ['chats', 'byTabId', 'isSyncing']);
    await MAIN_IDB_STORE.set('tt-global-state-test', cached); // raw objects: structured clone works
    const snapshot = structuredClone(cached);

    resetGlobal();
    expect(getGlobal().chats.byId).toEqual({});

    const loaded = await MAIN_IDB_STORE.get<typeof cached>('tt-global-state-test');
    setGlobal({ ...getGlobal(), ...loaded }, { forceOutdated: true });
    expect(pick(getGlobal(), ['chats', 'byTabId', 'isSyncing'])).toEqual(snapshot);
  });
});

describe('fine-grained reads over the tracked global', () => {
  it('a reducer that spread-copies the path wakes only the readers of the changed leaf', () => {
    setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, byId: { a: chat('a'), b: chat('b') } } });
    const runs = { a: 0, b: 0, keys: 0 };
    createRoot((dispose) => {
      const global = useGlobal();
      const titleA = createMemo(() => (runs.a++, global.chats.byId.a.title));
      const titleB = createMemo(() => (runs.b++, global.chats.byId.b.title));
      const count = createMemo(() => (runs.keys++, Object.keys(global.chats.byId).length));
      expect([titleA(), titleB(), count()]).toEqual(['a', 'b', 2]);

      register('test:renameB', (g: GlobalState, _a: unknown, title: string) => ({
        ...g,
        chats: { ...g.chats, byId: { ...g.chats.byId, b: { ...g.chats.byId.b, title } } },
      }));
      actions['test:renameB']('B!');

      expect(titleB()).toBe('B!');
      expect(titleA()).toBe('a');
      expect(count()).toBe(2);
      expect(runs).toEqual({ a: 1, b: 2, keys: 1 });
      dispose();
    });
  });

  it('withGlobal: the mapper re-runs on its own leaves only; fields of returned store objects bypass it', () => {
    setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, byId: { a: chat('a'), b: chat('b') } } });
    let mapperRuns = 0;
    createRoot((dispose) => {
      const ownProps = { chatId: 'a', title: 'own title wins' };
      const props = withGlobal(ownProps, (global, { chatId }) => {
        mapperRuns++;
        const c = global.chats.byId[chatId];
        return { chat: c, isSelected: global.currentUserId === chatId, title: c?.title };
      });
      const titleViaChat = createMemo(() => props.chat.title);
      const selected = createMemo(() => props.isSelected);
      expect([titleViaChat(), selected(), props.title]).toEqual(['a', false, 'own title wins']);
      expect(mapperRuns).toBe(1);

      // a field the mapper did not read: the leaf wakes the reader directly, the mapper stays
      setGlobal({
        ...getGlobal(),
        chats: { ...getGlobal().chats, byId: { ...getGlobal().chats.byId, a: { ...chat('a'), unreadCount: 5 } } },
      });
      expect(mapperRuns).toBe(1);

      // a field the mapper read (title): mapper re-runs, mapped record is shallow-equal except `title`
      setGlobal({
        ...getGlobal(),
        chats: {
          ...getGlobal().chats,
          byId: { ...getGlobal().chats.byId, a: { ...getGlobal().chats.byId.a, title: 'A2' } },
        },
      });
      expect(titleViaChat()).toBe('A2');
      expect(mapperRuns).toBe(2);

      // another chat: nothing
      setGlobal({
        ...getGlobal(),
        chats: { ...getGlobal().chats, byId: { ...getGlobal().chats.byId, b: { ...chat('b'), title: 'B2' } } },
      });
      expect(mapperRuns).toBe(2);

      setGlobal({ ...getGlobal(), currentUserId: 'a' });
      expect(selected()).toBe(true);
      expect(mapperRuns).toBe(3);
      dispose();
    });
  });

  it('tab state: selectTabState over the proxy tracks the tab object, updateTabState merges into it', () => {
    createRoot((dispose) => {
      const global = useGlobal();
      let runs = 0;
      const shown = createMemo(() => (runs++, selectTabState(global, tabId).isLeftColumnShown));
      expect(shown()).toBe(true);
      const tabBefore = unwrap(selectTabState(global, tabId));
      setGlobal(updateTabState(getGlobal(), { isLeftColumnShown: false }, tabId));
      setGlobal(updateTabState(getGlobal(), { isChatInfoShown: true }, tabId));
      expect(shown()).toBe(false);
      expect(runs).toBe(2);
      expect(unwrap(selectTabState(global, tabId))).toBe(tabBefore);
      dispose();
    });
  });

  it('a store-driven frame effect parks during a heavy animation; forceOnHeavyAnimation writes through', () => {
    const applied: unknown[] = [];
    // non-blocking: only store-caused runs wait (a blocking animation parks every frame effect, first runs included)
    const end = beginHeavyAnimation(10_000, false);
    try {
      createRoot((dispose) => {
        createEffect(
          () => useGlobal().isSyncing,
          (value) => void applied.push(value),
          frameMutation,
        );
        flushSync();
        expect(applied).toEqual([undefined]);

        setGlobal({ ...getGlobal(), isSyncing: true });
        flushSync();
        expect(applied).toEqual([undefined]); // parked: the store is the only reason it is dirty

        setGlobal({ ...getGlobal(), isSyncing: false }, { forceOnHeavyAnimation: true });
        flushSync();
        expect(applied).toEqual([undefined, false]); // the ungated write released it with the current state
        dispose();
      });
    } finally {
      end();
    }
  });
});

describe('ordering with the DOM-free scheduler', () => {
  it('actions called from a callback run as their own cascade', async () => {
    const order: string[] = [];
    register('test:fromCallback', () => void order.push('action'));
    const cb = vi.fn(() => {
      order.push('callback');
      if (order.length === 1) actions['test:fromCallback']();
    });
    addCallback(cb);
    try {
      setGlobal({ ...getGlobal(), isSyncing: true });
      await tick();
      expect(order).toEqual(['callback', 'action']);
    } finally {
      removeCallback(cb);
    }
  });
});
