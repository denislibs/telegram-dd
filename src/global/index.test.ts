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
    const mirrorTwoFa = unwrap(useGlobal().twoFaSettings);
    actions.apiUpdate({ '@type': 'updateTwoFaStateWaitCode', length: 6 } satisfies ApiUpdate);
    expect(getGlobal().twoFaSettings.waitingEmailCodeLength).toBe(6);
    expect(getGlobal().twoFaSettings.isLoading).toBe(false);
    expect(twoFa.waitingEmailCodeLength).toBeUndefined(); // tt value semantics: the captured object is a snapshot
    expect(unwrap(useGlobal().twoFaSettings)).toBe(mirrorTwoFa); // the store's container, merged in place
    expect(useGlobal().twoFaSettings.waitingEmailCodeLength).toBe(6);
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
  it('runs once per tick with the committed global (the object setGlobal received)', async () => {
    const calls: GlobalState[] = [];
    const cb = (global: GlobalState) => calls.push(global);
    addCallback(cb);
    try {
      setGlobal({ ...getGlobal(), isSyncing: true });
      setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, byId: { a: chat('a') } } });
      const last = updateTabState(getGlobal(), { isLeftColumnShown: false }, tabId);
      setGlobal(last);
      expect(calls).toEqual([]);
      await tick();
      expect(calls).toHaveLength(1);
      expect(calls[0]).toBe(last);
      expect(calls[0].chats.byId.a).toEqual(chat('a'));
    } finally {
      removeCallback(cb);
    }
  });

  it('waits for a heavy animation unless the write is forced (forceOnHeavyAnimation / forceSyncOnIOs)', async () => {
    const calls: GlobalState[] = [];
    const cb = (global: GlobalState) => calls.push(global);
    addCallback(cb);
    const end = beginHeavyAnimation(10_000, true);
    try {
      setGlobal({ ...getGlobal(), isSyncing: true });
      await tick();
      expect(calls).toEqual([]);

      setGlobal({ ...getGlobal(), isSynced: true }, { forceOnHeavyAnimation: true });
      await tick();
      expect(calls).toHaveLength(1);
      expect(pick(calls[0], ['isSyncing', 'isSynced'])).toEqual({ isSyncing: true, isSynced: true });

      setGlobal({ ...getGlobal(), isFetchingDifference: true }, { forceSyncOnIOs: true });
      expect(calls).toHaveLength(2); // synchronously, before the tick
      expect(calls[1].isFetchingDifference).toBe(true);
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

  it('withGlobal: the mapper re-runs when an entity it returned changes (tt granularity), not for other chats', () => {
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

      // the entity is replaced (a new tt object): the mapper that read `byId[a]` re-runs, as tt's container did
      setGlobal({
        ...getGlobal(),
        chats: { ...getGlobal().chats, byId: { ...getGlobal().chats.byId, a: { ...chat('a'), unreadCount: 5 } } },
      });
      expect(props.chat.unreadCount).toBe(5); // (memos are lazy: the pull is what re-runs the mapper)
      expect(mapperRuns).toBe(2);

      setGlobal({
        ...getGlobal(),
        chats: {
          ...getGlobal().chats,
          byId: { ...getGlobal().chats.byId, a: { ...getGlobal().chats.byId.a, title: 'A2' } },
        },
      });
      expect(titleViaChat()).toBe('A2');
      expect(mapperRuns).toBe(3);

      // another chat, an unrelated tab write: nothing
      setGlobal({
        ...getGlobal(),
        chats: { ...getGlobal().chats, byId: { ...getGlobal().chats.byId, b: { ...chat('b'), title: 'B2' } } },
      });
      setGlobal(updateTabState(getGlobal(), { isLeftColumnShown: false }, tabId));
      expect(mapperRuns).toBe(3);

      setGlobal({ ...getGlobal(), currentUserId: 'a' });
      expect(selected()).toBe(true);
      expect(mapperRuns).toBe(4);
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

describe("I3: withGlobal behaves like tt's container", () => {
  it('a throwing mapper is reported and the previous props stay', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, byId: { a: chat('a') } } });
      createRoot((dispose) => {
        const props = withGlobal({ chatId: 'a' }, (global, { chatId }) => ({ title: global.chats.byId[chatId].title }));
        const title = createMemo(() => props.title);
        expect(title()).toBe('a');
        setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, byId: {} } }); // the mapper throws on `undefined.title`
        expect(title()).toBe('a');
        expect(errors).toHaveBeenCalled();
        dispose();
      });
    } finally {
      errors.mockRestore();
    }
  });

  it('an inactive container is not mapped, on the first run included; stickToFirst sticks to the first value', () => {
    let runs = 0;
    createRoot((dispose) => {
      const inactive = withGlobal(
        {},
        () => (runs++, { count: 1 }),
        () => false,
      );
      expect(inactive.count).toBeUndefined();
      expect(runs).toBe(0);

      setGlobal({ ...getGlobal(), currentUserId: 'u1' });
      const stuck = withGlobal(
        {},
        (global) => ({ user: global.currentUserId }),
        (global, _own, stickToFirst) => stickToFirst(global.currentUserId),
      );
      expect(stuck.user).toBe('u1');
      setGlobal({ ...getGlobal(), currentUserId: 'u2' }); // another value: the container is inactive and keeps u1
      expect(stuck.user).toBe('u1');
      dispose();
    });
  });

  it('an own prop present with undefined wins over the mapped value, as {...mapped, ...own} did', () => {
    createRoot((dispose) => {
      const props = withGlobal({ title: undefined as string | undefined, other: 1 }, () => ({
        title: 'mapped',
        extra: 2,
      }));
      expect(props.title).toBeUndefined();
      expect(props.extra).toBe(2);
      expect(props.other).toBe(1);
      expect(Object.keys(props).sort()).toEqual(['extra', 'other', 'title']);
      expect('title' in props).toBe(true);
      dispose();
    });
  });
});

describe('C2: callbacks get the committed immutable global, so prevGlobal consumers work as in tt', () => {
  it('a ui/settings.ts-style callback sees the theme change exactly once', async () => {
    const changes: string[] = [];
    let prevGlobal = getGlobal();
    const cb = (global: GlobalState) => {
      if (global.sharedState.settings.theme !== prevGlobal.sharedState.settings.theme) {
        changes.push(global.sharedState.settings.theme);
      }
      prevGlobal = global;
    };
    addCallback(cb);
    try {
      const g = getGlobal();
      setGlobal({ ...g, sharedState: { ...g.sharedState, settings: { ...g.sharedState.settings, theme: 'dark' } } });
      await tick();
      setGlobal({ ...getGlobal(), isSyncing: true });
      await tick();
      expect(changes).toEqual(['dark']);
    } finally {
      removeCallback(cb);
    }
  });

  it('an intervals.ts-style callback sees the master role flip; a sharedStateConnector-style identity check works', async () => {
    const roles: boolean[] = [];
    let prevGlobal = getGlobal();
    let lastSharedState = prevGlobal.sharedState;
    const sharedChanges: number[] = [];
    const cb = (global: GlobalState) => {
      const wasMaster = Boolean(selectTabState(prevGlobal, tabId)?.isMasterTab);
      const isMaster = Boolean(selectTabState(global, tabId)?.isMasterTab);
      if (wasMaster !== isMaster) roles.push(isMaster);
      prevGlobal = global;
      if (global.sharedState !== lastSharedState) {
        sharedChanges.push(1);
        lastSharedState = global.sharedState;
      }
    };
    addCallback(cb);
    try {
      setGlobal(updateTabState(getGlobal(), { isMasterTab: true }, tabId));
      await tick();
      setGlobal(updateTabState(getGlobal(), { isLeftColumnShown: false }, tabId));
      await tick();
      setGlobal(updateTabState(getGlobal(), { isMasterTab: false }, tabId));
      await tick();
      expect(roles).toEqual([true, false]);
      expect(sharedChanges).toEqual([]);
    } finally {
      removeCallback(cb);
    }
  });
});

describe('I2: tt code that mutates the global it got from getGlobal() behaves the same in DEV and production', () => {
  it('global.x = …; setGlobal(global) (init.ts) reaches the store', () => {
    const global = getGlobal();
    global.isCacheApiSupported = true;
    setGlobal(global);
    expect(useGlobal().isCacheApiSupported).toBe(true);
    expect(getGlobal().isCacheApiSupported).toBe(true);
  });
});

describe('M4: getPromiseActions returns a promise for a synchronous action too', () => {
  it('awaits and .then() work', async () => {
    register('test:syncAction', () => undefined);
    const promise = (getPromiseActions() as unknown as Record<string, () => Promise<void>>)['test:syncAction']();
    expect(promise).toBeInstanceOf(Promise);
    await promise.then(() => undefined);
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
