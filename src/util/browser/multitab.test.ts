import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getGlobal, setGlobal } from '../../global';

import type { GlobalState, TabState } from '../../global/types';

import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../global/initialState';
import { updateTabState } from '../../global/reducers/tabs';
import { deepMerge } from '../deepMerge';
import { getCurrentTabId } from '../establishMultitabRole';
import { cloneDeep } from '../iteratees';

/**
 * A BroadcastChannel that delivers synchronously to the other instances of the same name in this process (never to
 * the sender), with a structured clone of the message — what a browser does, minus the task hop.
 */
class FakeBroadcastChannel {
  static byName = new Map<string, Set<FakeBroadcastChannel>>();
  listeners = new Set<(event: { data: unknown }) => void>();

  constructor(public name: string) {
    let set = FakeBroadcastChannel.byName.get(name);
    if (!set) FakeBroadcastChannel.byName.set(name, (set = new Set()));
    set.add(this);
  }
  postMessage(message: unknown) {
    const data = structuredClone(message);
    for (const other of FakeBroadcastChannel.byName.get(this.name)!) {
      if (other !== this) other.listeners.forEach((listener) => listener({ data }));
    }
  }
  addEventListener(_type: 'message', listener: (event: { data: unknown }) => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: (event: { data: unknown }) => void) {
    this.listeners.delete(listener);
  }
  close() {
    FakeBroadcastChannel.byName.get(this.name)?.delete(this);
  }
}

vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

const tabId = getCurrentTabId();
const tick = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

function resetGlobal() {
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId, isMasterTab: true };
  setGlobal({ ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: tab } }, { forceOutdated: true });
}

const chat = (id: string, title = id) => ({ id, title, type: 'chatTypePrivate', unreadCount: 0 }) as any;

describe('multitab: the master tab broadcasts the store diffs, a tab applies them with deepMerge', () => {
  let multitab: typeof import('./multitab');
  let peer: FakeBroadcastChannel;
  const received: AnyLiteral[] = [];

  beforeAll(async () => {
    resetGlobal();
    multitab = await import('./multitab');
    const { DATA_BROADCAST_CHANNEL_NAME } = await import('../multiaccount');
    peer = new FakeBroadcastChannel(DATA_BROADCAST_CHANNEL_NAME);
    peer.addEventListener('message', ({ data }) => received.push(data as AnyLiteral));
    await multitab.requestGlobal(APP_VERSION); // no other tab answers: resolves at once, the tab owns its global
    multitab.subscribeToMultitabBroadcastChannel();
    received.length = 0; // (the peer saw our own `requestGlobal`)
  });

  afterEach(async () => {
    await tick();
    received.length = 0;
  });

  it('sends the full global once, then one tt-format diff per callback run; a peer reconstructs the state', async () => {
    setGlobal({ ...getGlobal(), isSyncing: true });
    await tick();
    expect(received.map((m) => m.type)).toEqual(['globalUpdate']);
    let peerGlobal = received[0].global as GlobalState;
    expect(peerGlobal.isSyncing).toBe(true);
    expect('byTabId' in peerGlobal).toBe(true);
    received.length = 0;

    // a cascade of tt-style writes in one tick
    setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, byId: { a: chat('a'), b: chat('b') } } });
    setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, byId: { ...getGlobal().chats.byId, a: { ...chat('a'), title: 'A2' } } } });
    setGlobal(updateTabState(getGlobal(), { isLeftColumnShown: false }, tabId));
    await tick();

    expect(received.map((m) => m.type)).toEqual(['globalDiffUpdate']);
    const diff = received[0].diff;
    expect(diff).toEqual({
      chats: { byId: { a: { ...chat('a'), title: 'A2' }, b: chat('b') } },
      byTabId: { [tabId]: { isLeftColumnShown: false } },
    });
    peerGlobal = deepMerge(peerGlobal, diff);
    expect(peerGlobal.chats.byId).toEqual(getGlobal().chats.byId);
    expect(peerGlobal.byTabId[tabId].isLeftColumnShown).toBe(false);

    // a second tick: a deletion and an entity replacement travel as their own diff
    setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, byId: { a: { ...chat('a', 'A3'), lastMessage: { id: 1 } } } } });
    await tick();
    expect(received).toHaveLength(2);
    peerGlobal = deepMerge(peerGlobal, received[1].diff);
    expect(peerGlobal.chats.byId).toEqual(getGlobal().chats.byId);
  });

  it('applies an incoming globalDiffUpdate into the store (the non-master path)', async () => {
    setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, byId: { a: chat('a') } } });
    await tick();
    received.length = 0;
    const before = structuredClone(getGlobal().chats.byId);

    multitab.handleMessage({
      data: {
        type: 'globalDiffUpdate',
        diff: { chats: { byId: { a: { title: 'from master' }, c: chat('c') } }, isSynced: true },
      },
    });

    expect(getGlobal().chats.byId.a.title).toBe('from master');
    expect(getGlobal().chats.byId.c).toEqual(chat('c'));
    expect(getGlobal().isSynced).toBe(true);
    expect(before.a.title).toBe('a');
    // a received diff is never echoed back (tt: `currentGlobal === global`; here: `fromRemote` writes are journaled apart)
    await tick();
    expect(received).toEqual([]);

    // but a local write in the same tick still goes out, on its own
    multitab.handleMessage({ data: { type: 'globalDiffUpdate', diff: { isSyncing: true } } });
    setGlobal({ ...getGlobal(), isFetchingDifference: true });
    await tick();
    expect(received.map((m) => m.diff)).toEqual([{ isFetchingDifference: true }]);
  });

  it('a requestGlobal from another tab is answered by the master with the full global', () => {
    peer.postMessage({ type: 'requestGlobal', appVersion: APP_VERSION });
    expect(received.map((m) => m.type)).toEqual(['globalUpdate']);
    expect((received[0].global as GlobalState).chats.byId.a).toBeTruthy();
  });
});
