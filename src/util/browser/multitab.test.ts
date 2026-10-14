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
// the store callbacks run at tick end; tt's `broadcastDiffOnIdle` flushes on `onFullyIdle`, which is tick end under jsdom
const tick = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
/** tt's DEBUG stamp travels in the diff as in tt (the receiver overwrites it); the assertions ignore it. */
const withoutStamp = (diff: AnyLiteral) => {
  const { DEBUG_randomId: _stamp, ...rest } = diff;
  return rest;
};

function resetGlobal() {
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId, isMasterTab: true };
  setGlobal({ ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: tab } }, { forceOutdated: true });
}

const chat = (id: string, title = id) => ({ id, title, type: 'chatTypePrivate', unreadCount: 0 }) as any;
const setChat = (c: AnyLiteral) =>
  setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, byId: { ...getGlobal().chats.byId, [c.id]: c } } });

describe('multitab (tt code unchanged): the master broadcasts deepDiff(previous, current), a tab applies deepMerge', () => {
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

  it('sends the full global once, then the diff of each idle flush; a peer reconstructs the state', async () => {
    setGlobal({ ...getGlobal(), isSyncing: true });
    await tick();
    expect(received.map((m) => m.type)).toEqual(['globalUpdate']);
    let peerGlobal = received[0].global as GlobalState;
    expect(peerGlobal.isSyncing).toBe(true);
    expect('byTabId' in peerGlobal).toBe(true);
    received.length = 0;

    // a cascade of tt-style writes in one tick
    setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, byId: { a: chat('a'), b: chat('b') } } });
    setChat({ ...chat('a'), title: 'A2' });
    setGlobal(updateTabState(getGlobal(), { isLeftColumnShown: false }, tabId));
    await tick();

    expect(received.map((m) => m.type)).toEqual(['globalDiffUpdate']);
    expect(withoutStamp(received[0].diff)).toEqual({
      chats: { byId: { a: { ...chat('a'), title: 'A2' }, b: chat('b') } },
      byTabId: { [tabId]: { isLeftColumnShown: false } },
    });
    peerGlobal = deepMerge(peerGlobal, received[0].diff);
    expect(peerGlobal.chats.byId).toEqual(getGlobal().chats.byId);
    expect(peerGlobal.byTabId[tabId].isLeftColumnShown).toBe(false);

    // another tick: a deletion and an entity replacement
    setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, byId: { a: { ...chat('a', 'A3'), lastMessageId: 1 } } } });
    await tick();
    expect(received).toHaveLength(2);
    expect(withoutStamp(received[1].diff)).toEqual({ chats: { byId: { a: { title: 'A3', lastMessageId: 1 }, b: { __delete: true } } } });
    peerGlobal = deepMerge(peerGlobal, received[1].diff);
    expect(peerGlobal.chats.byId).toEqual(getGlobal().chats.byId);
  });

  it('applies an incoming globalDiffUpdate into the store and never echoes it (currentGlobal === global)', async () => {
    setChat(chat('a'));
    await tick();
    received.length = 0;
    const before = getGlobal().chats.byId;

    multitab.handleMessage({
      data: {
        type: 'globalDiffUpdate',
        diff: { chats: { byId: { a: { title: 'from master' }, c: chat('c') } }, isSynced: true },
      },
    });

    expect(getGlobal().chats.byId.a.title).toBe('from master');
    expect(getGlobal().chats.byId.c).toEqual(chat('c'));
    expect(getGlobal().isSynced).toBe(true);
    expect(before.a.title).toBe('a'); // the previous global is an untouched snapshot
    await tick();
    expect(received).toEqual([]);

    // a local write afterwards goes out on its own
    setGlobal({ ...getGlobal(), isFetchingDifference: true });
    await tick();
    expect(received.map((m) => withoutStamp(m.diff))).toEqual([{ isFetchingDifference: true }]);
  });

  it("I1: a local write followed by a newer value from the master before the flush sends the master's value", async () => {
    setChat({ ...chat('a'), unreadCount: 3 });
    await tick();
    received.length = 0;

    // local optimistic write (slave side), then the master's newer value arrives before the idle flush
    setChat({ ...getGlobal().chats.byId.a, unreadCount: 0 });
    multitab.handleMessage({ data: { type: 'globalDiffUpdate', diff: { chats: { byId: { a: { unreadCount: 7 } } } } } });
    await tick();

    // tt diffs final states (and skips the callback run whose global it just applied): the stale local `0` never
    // reaches the other tabs; either nothing or the master's own value goes out, and the tabs agree on 7
    const sent = received.map((m) => withoutStamp(m.diff));
    expect(sent.length).toBeLessThanOrEqual(1);
    expect(JSON.stringify(sent)).not.toContain('"unreadCount":0');
    if (sent.length) expect(sent[0]).toEqual({ chats: { byId: { a: { unreadCount: 7 } } } });
    expect(getGlobal().chats.byId.a.unreadCount).toBe(7);
  });

  it('a requestGlobal from another tab is answered by the master with the full global', () => {
    peer.postMessage({ type: 'requestGlobal', appVersion: APP_VERSION });
    expect(received.map((m) => m.type)).toEqual(['globalUpdate']);
    expect((received[0].global as GlobalState).chats.byId.a).toBeTruthy();
  });
});
