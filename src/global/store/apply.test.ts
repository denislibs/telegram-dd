import { createMemo, createRoot } from 'frameact';
import { $TRACK, createStore, unwrap } from 'frameact/store';
import { describe, expect, it } from 'vitest';

import { deepMerge } from '../../util/deepMerge';
import { omit } from '../../util/iteratees';
import { applyGlobal, createJournal, DELETE_MARK, journalToDiff, mergeDiffs, type UntypedSetState } from './apply';

type Chat = { id: string; title: string; unread: number; lastMessage?: { id: number; text: string } };
type State = {
  isInited: boolean;
  chats: { byId: Record<string, Chat>; listIds: { active: string[] }; isFullyLoaded?: boolean };
  messages: { byChatId: Record<string, { byId: Record<number, { id: number; text: string }> }> };
  byTabId: Record<number, { id: number; notifications: { localId: string }[]; isLeftColumnShown?: boolean }>;
  DEBUG_randomId?: number;
};

function fixture(): State {
  return {
    isInited: true,
    chats: {
      byId: {
        a: { id: 'a', title: 'A', unread: 0 },
        b: { id: 'b', title: 'B', unread: 2, lastMessage: { id: 10, text: 'hi' } },
      },
      listIds: { active: ['a', 'b'] },
    },
    messages: { byChatId: { b: { byId: { 10: { id: 10, text: 'hi' } } } } },
    byTabId: { 1: { id: 1, notifications: [{ localId: 'n1' }] } },
  };
}

function setup() {
  const [state, setStateTyped] = createStore<State>(fixture());
  const writes: unknown[][] = [];
  const setState: UntypedSetState = (...args) => {
    writes.push(args);
    (setStateTyped as unknown as UntypedSetState)(...args);
  };
  const raw = unwrap(state) as unknown as State;
  const journal = createJournal();
  const apply = (next: State) => applyGlobal(setState, raw, next, journal);
  return { state, raw, writes, journal, apply };
}

/** tt-style reducers over the raw tree (spread copies along the path). */
const updateChat = (g: State, id: string, update: Partial<Chat>): State => ({
  ...g,
  chats: { ...g.chats, byId: { ...g.chats.byId, [id]: { ...g.chats.byId[id], ...update } } },
});

describe('applyGlobal: tt immutable update → in-place store writes', () => {
  it('writes only the changed leaf and keeps every identity on the path', () => {
    const { state, raw, writes, apply } = setup();
    const byIdBefore = raw.chats.byId;
    const proxyA = state.chats.byId.a;
    const runs = { a: 0, b: 0 };
    createRoot(() => {
      const titleA = createMemo(() => {
        runs.a++;
        return state.chats.byId.a.title;
      });
      const titleB = createMemo(() => {
        runs.b++;
        return state.chats.byId.b.title;
      });
      titleA();
      titleB();

      expect(apply(updateChat(raw, 'a', { title: 'A2' }))).toBe(true);

      expect(writes).toEqual([['chats', 'byId', 'a', 'title', 'A2']]);
      expect(titleA()).toBe('A2');
      expect(titleB()).toBe('B');
      expect(runs).toEqual({ a: 2, b: 1 });
    });
    expect(raw.chats.byId).toBe(byIdBefore);
    expect(state.chats.byId.a).toBe(proxyA);
  });

  it('is a no-op for the same root and for a copy with identical content', () => {
    const { raw, writes, apply } = setup();
    expect(apply(raw)).toBe(false);
    expect(apply({ ...raw, chats: { ...raw.chats, listIds: { active: [...raw.chats.listIds.active] } } })).toBe(false);
    expect(writes).toEqual([]);
  });

  it('deletes keys that the next global lacks (omit) and keys set to undefined, and journals them', () => {
    const { raw, journal, apply } = setup();
    apply({ ...raw, chats: { ...raw.chats, byId: omit(raw.chats.byId, ['a']) } });
    expect('a' in raw.chats.byId).toBe(false);
    apply({ ...raw, chats: { ...raw.chats, isFullyLoaded: true } });
    apply({ ...raw, chats: { ...raw.chats, isFullyLoaded: undefined } });
    expect('isFullyLoaded' in raw.chats).toBe(false);
    expect(journalToDiff(journal)).toEqual({ chats: { byId: { a: DELETE_MARK }, isFullyLoaded: DELETE_MARK } });
  });

  it('adds a new entity as one write and journals the whole value', () => {
    const { raw, writes, journal, apply } = setup();
    const chat: Chat = { id: 'c', title: 'C', unread: 1 };
    apply({ ...raw, chats: { ...raw.chats, byId: { ...raw.chats.byId, c: chat } } });
    expect(writes).toEqual([['chats', 'byId', 'c', chat]]);
    expect(raw.chats.byId.c).toBe(chat); // the store owns the object now
    expect(journalToDiff(journal)).toEqual({ chats: { byId: { c: chat } } });
  });

  it('treats arrays as values: replaced whole when the content differs, untouched otherwise', () => {
    const { state, raw, writes, apply } = setup();
    let shapeRuns = 0;
    createRoot(() => {
      const ids = createMemo(() => {
        shapeRuns++;
        return state.chats.listIds.active[$TRACK].join(',');
      });
      expect(ids()).toBe('a,b');
      apply({ ...raw, chats: { ...raw.chats, listIds: { active: ['a', 'b'] } } });
      expect(writes).toEqual([]);
      apply({ ...raw, chats: { ...raw.chats, listIds: { active: ['b', 'a'] } } });
      expect(writes).toEqual([['chats', 'listIds', 'active', ['b', 'a']]]);
      expect(ids()).toBe('b,a');
      expect(shapeRuns).toBe(2);
    });
  });

  it('replaces an object whose id differs instead of merging into the old one (aliases stay intact)', () => {
    const { raw, writes, apply } = setup();
    const oldMessage = raw.chats.byId.b.lastMessage!;
    expect(raw.messages.byChatId.b.byId[10]).not.toBe(oldMessage); // (the fixture has separate objects; alias them)
    raw.chats.byId.b.lastMessage = raw.messages.byChatId.b.byId[10];
    const aliased = raw.chats.byId.b.lastMessage;

    const next = { id: 11, text: 'new' };
    apply(updateChat(raw, 'b', { lastMessage: next }));

    expect(writes).toEqual([['chats', 'byId', 'b', 'lastMessage', next]]);
    expect(raw.chats.byId.b.lastMessage).toBe(next);
    expect(raw.messages.byChatId.b.byId[10]).toBe(aliased);
    expect(aliased).toEqual({ id: 10, text: 'hi' });
  });

  it('merges a same-id entity field by field', () => {
    const { raw, writes, apply } = setup();
    const lm = raw.chats.byId.b.lastMessage!;
    apply(updateChat(raw, 'b', { lastMessage: { ...lm, text: 'edited' } }));
    expect(writes).toEqual([['chats', 'byId', 'b', 'lastMessage', 'text', 'edited']]);
    expect(raw.chats.byId.b.lastMessage).toBe(lm);
  });

  it('unwraps store proxies found in the next global', () => {
    const { state, raw, writes, apply } = setup();
    const proxyA = state.chats.byId.a;
    // a component handed the proxy to an action, which stored it elsewhere
    apply({ ...raw, chats: { ...raw.chats, byId: { ...raw.chats.byId, a: proxyA } } });
    expect(writes).toEqual([]); // the same raw object
    apply({ ...raw, chats: { ...raw.chats, byId: { ...raw.chats.byId, copy: proxyA } } });
    expect(raw.chats.byId.copy).toBe(unwrap(proxyA));
  });

  it('never stores the DEV stamp (DEBUG_randomId)', () => {
    const { raw, writes, apply } = setup();
    apply({ ...raw, DEBUG_randomId: 0.5, isInited: false });
    expect(writes).toEqual([['isInited', false]]);
    expect('DEBUG_randomId' in raw).toBe(false);
  });

  it('writes into byTabId in place: updateTabState keeps the tab object', () => {
    const { raw, writes, apply } = setup();
    const tab = raw.byTabId[1];
    apply({ ...raw, byTabId: { ...raw.byTabId, 1: { ...tab, isLeftColumnShown: true } } });
    expect(writes).toEqual([['byTabId', '1', 'isLeftColumnShown', true]]);
    expect(raw.byTabId[1]).toBe(tab);
  });
});

describe('journal: tt deepDiff format, round-trips through deepMerge', () => {
  it('composes a batch of writes into one diff that deepMerge applies to the old snapshot', () => {
    const { raw, journal, apply } = setup();
    const before = structuredClone(raw);

    apply(updateChat(raw, 'a', { title: 'A2', unread: 5 }));
    apply({ ...raw, chats: { ...raw.chats, byId: omit(raw.chats.byId, ['b']), listIds: { active: ['a'] } } });
    apply({ ...raw, chats: { ...raw.chats, byId: { ...raw.chats.byId, c: { id: 'c', title: 'C', unread: 0 } } } });
    apply(updateChat(raw, 'c', { title: 'C2' })); // a partial write into an object journaled whole: nothing extra
    apply({
      ...raw,
      byTabId: {
        ...raw.byTabId,
        1: { ...raw.byTabId[1], notifications: [...raw.byTabId[1].notifications, { localId: 'n2' }] },
      },
    });

    const diff = journalToDiff(journal)!;
    expect(diff.chats.byId.c).toEqual({ id: 'c', title: 'C2', unread: 0 });
    expect(diff.chats.byId.b).toEqual(DELETE_MARK);
    expect(deepMerge(before, diff)).toEqual(structuredClone(raw));
  });

  it('a deletion followed by a new object under the same key is diffed against the deleted object', () => {
    const { raw, journal, apply } = setup();
    const before = structuredClone(raw);
    apply(updateChat(raw, 'b', { title: 'B2' }));
    apply({ ...raw, chats: { ...raw.chats, byId: omit(raw.chats.byId, ['b']) } });
    apply({ ...raw, chats: { ...raw.chats, byId: { ...raw.chats.byId, b: { id: 'b', title: 'B3', unread: 9 } } } });
    const diff = journalToDiff(journal)!;
    // `deepMerge` merges key by key: the receiver's stale `lastMessage` must be deleted explicitly
    expect(diff.chats.byId.b).toEqual({ title: 'B3', unread: 9, lastMessage: DELETE_MARK });
    expect(deepMerge(before, diff)).toEqual(structuredClone(raw));
  });

  it('an entity replaced by another (id mismatch) is journaled as a diff against the old one', () => {
    const { raw, journal, apply } = setup();
    const before = structuredClone(raw);
    apply(updateChat(raw, 'b', { lastMessage: { id: 11, text: 'new' } }));
    apply(updateChat(raw, 'b', { lastMessage: { ...raw.chats.byId.b.lastMessage!, text: 'edited' } }));
    const diff = journalToDiff(journal)!;
    expect(diff.chats.byId.b.lastMessage).toEqual({ id: 11, text: 'edited' });
    expect(deepMerge(before, diff)).toEqual(structuredClone(raw));
  });

  it('two consecutive journals apply in sequence (what multitab posts), and mergeDiffs merges object diffs', () => {
    const { raw, apply, journal } = setup();
    const base = structuredClone(raw);
    apply(updateChat({ ...raw, chats: { ...raw.chats, byId: omit(raw.chats.byId, ['b']) } }, 'a', { title: 'X' }));
    const a = journalToDiff(journal)!;
    const afterA = deepMerge(base, a);
    expect(afterA).toEqual(structuredClone(raw));

    const journalB = createJournal();
    applyGlobal(
      (...args) => void args,
      raw,
      {
        ...raw,
        chats: {
          ...raw.chats,
          byId: { ...raw.chats.byId, a: { ...raw.chats.byId.a, unread: 7 }, b: { id: 'b', title: 'B2', unread: 0 } },
          listIds: { active: ['a'] },
        },
      },
      journalB,
    );
    const b = journalToDiff(journalB)!;
    const afterB = deepMerge(afterA, b);
    expect(afterB.chats.byId.b).toEqual({ id: 'b', title: 'B2', unread: 0 });
    expect(afterB.chats.byId.a.unread).toBe(7);

    expect(mergeDiffs({ x: { p: 1 }, y: 1 }, { x: { q: 2 }, y: DELETE_MARK })).toEqual({
      x: { p: 1, q: 2 },
      y: DELETE_MARK,
    });
    expect(mergeDiffs(undefined, b)).toBe(b);
    expect(mergeDiffs(a, undefined)).toBe(a);
  });

  it('property: random tt-style updates round-trip exactly', () => {
    let seed = 42;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const ids = ['a', 'b', 'c', 'd', 'e'];
    for (let round = 0; round < 25; round++) {
      const { raw, journal, apply } = setup();
      const before = structuredClone(raw);
      for (let step = 0; step < 40; step++) {
        const id = ids[rnd(ids.length)];
        const op = rnd(6);
        let next: State;
        if (op === 0) {
          next = updateChat(raw, id, { ...(raw.chats.byId[id] ?? { id, title: id, unread: 0 }), unread: rnd(10) });
        } else if (op === 1) next = { ...raw, chats: { ...raw.chats, byId: omit(raw.chats.byId, [id]) } };
        else if (op === 2) {
          next = { ...raw, chats: { ...raw.chats, listIds: { active: ids.filter(() => rnd(2) === 0) } } };
        } else if (op === 3) {
          next = updateChat(raw, id, { id, title: id, unread: 0, lastMessage: { id: rnd(3), text: String(rnd(100)) } });
        } else if (op === 4) next = { ...raw, byTabId: { ...raw.byTabId, [2]: { id: 2, notifications: [] } } };
        else next = { ...raw, byTabId: omit(raw.byTabId, [2]) };
        apply(next);
      }
      const diff = journalToDiff(journal);
      const merged = diff ? deepMerge(before, diff) : before;
      expect(merged).toEqual(structuredClone(raw));
    }
  });
});
