import { createMemo, createRoot } from 'frameact';
import { $TRACK, createStore, unwrap } from 'frameact/store';
import { describe, expect, it } from 'vitest';

import { omit } from '../../util/iteratees';
import { applyGlobal, copyContainer, isContainer, type UntypedSetState } from './apply';

type Message = { id: number; chatId: string; text: string; content?: { text: { text: string } } };
type Chat = { id: string; title: string; unread: number; photo?: { small: string } };
type State = {
  isInited: boolean;
  chats: { byId: Record<string, Chat>; listIds: { active: string[] }; lastMessageIds?: { all: Record<string, number> } };
  messages: {
    byChatId: Record<string, { byId: Record<number, Message>; threadsById: Record<number, { listedIds: number[] }> }>;
  };
  byTabId: Record<
    number,
    {
      id: number;
      notifications: { localId: string }[];
      isLeftColumnShown?: boolean;
      boostModal?: { boostStatus?: { level: number; boosts: number } };
      giftCraftModal?: { gift1?: Chat; gift2?: Chat; gifts: Chat[] };
      oneTimeMediaModal?: { message: Message };
      globalSearch?: { query?: string; results: number[] };
    }
  >;
  DEBUG_randomId?: number;
};

function fixture(): State {
  return {
    isInited: true,
    chats: {
      byId: {
        a: { id: 'a', title: 'A', unread: 0 },
        b: { id: 'b', title: 'B', unread: 2, photo: { small: 'b.jpg' } },
      },
      listIds: { active: ['a', 'b'] },
      lastMessageIds: { all: { a: 1, b: 10 } },
    },
    messages: {
      byChatId: {
        a: { byId: { 5: { id: 5, chatId: 'a', text: 'from A' } }, threadsById: { [-1]: { listedIds: [5] } } },
        b: {
          byId: { 5: { id: 5, chatId: 'b', text: 'from B' }, 10: { id: 10, chatId: 'b', text: 'hi' } },
          threadsById: { [-1]: { listedIds: [5, 10] } },
        },
      },
    },
    byTabId: { 1: { id: 1, notifications: [{ localId: 'n1' }], globalSearch: { results: [] } } },
  };
}

/** A store mirror plus the committed global, like `src/global/index.ts` keeps them. */
function setup(initial: State = fixture()) {
  const [state, setStateTyped] = createStore<State>({ isInited: false } as State);
  const writes: unknown[][] = [];
  const setState: UntypedSetState = (...args) => {
    writes.push(args);
    (setStateTyped as unknown as UntypedSetState)(...args);
  };
  let committed = { isInited: false } as State;
  const setGlobal = (next: State) => {
    const prev = committed;
    committed = next;
    return applyGlobal(setState, prev, next);
  };
  setGlobal(initial);
  writes.length = 0;
  const mirror = unwrap(state) as unknown as State;
  return { state, mirror, writes, setGlobal, getGlobal: () => committed };
}

/** tt-style reducers (spread copies along the path). */
const updateChat = (g: State, id: string, update: Partial<Chat>): State => ({
  ...g,
  chats: { ...g.chats, byId: { ...g.chats.byId, [id]: { ...g.chats.byId[id], ...update } } },
});
const updateTab = (g: State, partial: Partial<State['byTabId'][number]>): State => ({
  ...g,
  byTabId: { ...g.byTabId, 1: { ...g.byTabId[1], ...partial } },
});

const json = (v: unknown) => JSON.parse(JSON.stringify(v));

describe('applyGlobal: the store mirrors the committed tt global', () => {
  it('writes only the changed entity and wakes only its readers; containers keep their identity', () => {
    const { state, mirror, writes, setGlobal, getGlobal } = setup();
    const byIdBefore = mirror.chats.byId;
    const runs = { a: 0, b: 0, keys: 0 };
    createRoot(() => {
      const titleA = createMemo(() => (runs.a++, state.chats.byId.a.title));
      const titleB = createMemo(() => (runs.b++, state.chats.byId.b.title));
      const count = createMemo(() => (runs.keys++, Object.keys(state.chats.byId).length));
      expect([titleA(), titleB(), count()]).toEqual(['A', 'B', 2]);

      expect(setGlobal(updateChat(getGlobal(), 'a', { title: 'A2' }))).toBe(true);

      expect(writes).toEqual([['chats', 'byId', 'a', getGlobal().chats.byId.a]]);
      expect([titleA(), titleB(), count()]).toEqual(['A2', 'B', 2]);
      expect(runs).toEqual({ a: 2, b: 1, keys: 1 });
    });
    expect(mirror.chats.byId).toBe(byIdBefore); // the store's own dictionary, merged in place
    expect(mirror.chats.byId.a).toBe(getGlobal().chats.byId.a); // the entity itself, shared by reference
  });

  it('is a no-op for the same global and for copies with identical content', () => {
    const { writes, setGlobal, getGlobal } = setup();
    expect(setGlobal(getGlobal())).toBe(false);
    const g = getGlobal();
    expect(setGlobal({ ...g, chats: { ...g.chats, listIds: { active: [...g.chats.listIds.active] } } })).toBe(false);
    expect(writes).toEqual([]);
  });

  it('deletes keys the next global lacks or sets to undefined (in a container)', () => {
    const { mirror, setGlobal, getGlobal } = setup();
    setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, byId: omit(getGlobal().chats.byId, ['a']) } });
    expect('a' in mirror.chats.byId).toBe(false);
    setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, lastMessageIds: undefined } });
    expect('lastMessageIds' in mirror.chats).toBe(false);
    expect(json(mirror)).toEqual(json(getGlobal()));
  });

  it('arrays are values: replaced by reference when the content differs, untouched otherwise', () => {
    const { state, mirror, writes, setGlobal, getGlobal } = setup();
    let shapeRuns = 0;
    createRoot(() => {
      const ids = createMemo(() => (shapeRuns++, state.chats.listIds.active[$TRACK].join(',')));
      expect(ids()).toBe('a,b');
      setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, listIds: { active: ['a', 'b'] } } });
      expect(writes).toEqual([]);
      const reordered = ['b', 'a'];
      setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, listIds: { active: reordered } } });
      expect(writes).toEqual([['chats', 'listIds', 'active', reordered]]);
      expect(mirror.chats.listIds.active).toBe(reordered);
      expect(ids()).toBe('b,a');
      expect(shapeRuns).toBe(2);
    });
  });

  it('a fresh but shallow-equal entity is not written (replaceUsers of 5k copies)', () => {
    const { writes, setGlobal, getGlobal } = setup();
    const g = getGlobal();
    setGlobal({ ...g, chats: { ...g.chats, byId: { a: { ...g.chats.byId.a }, b: { ...g.chats.byId.b, unread: 3 } } } });
    expect(writes.map((w) => w.slice(0, 3))).toEqual([['chats', 'byId', 'b']]);
  });

  it('a new container is copied into the store (nested containers too), entities inside it are shared', () => {
    const { mirror, setGlobal, getGlobal } = setup();
    const g = getGlobal();
    const record = { byId: { 7: { id: 7, chatId: 'c', text: 'x' } }, threadsById: { [-1]: { listedIds: [7] } } };
    setGlobal({ ...g, messages: { byChatId: { ...g.messages.byChatId, c: record } } });
    expect(mirror.messages.byChatId.c).not.toBe(record);
    expect(mirror.messages.byChatId.c.byId).not.toBe(record.byId);
    expect(mirror.messages.byChatId.c.byId[7]).toBe(record.byId[7]);
    expect(mirror.messages.byChatId.c.threadsById[-1].listedIds).toBe(record.threadsById[-1].listedIds);
    expect(json(mirror)).toEqual(json(getGlobal()));
  });

  it('isContainer: id-less plain objects are containers, entities have an id, byTabId[*] is the exception', () => {
    expect(isContainer({ byId: {} }, ['chats'])).toBe(true);
    expect(isContainer({ id: 'a' }, ['chats', 'byId', 'a'])).toBe(false);
    expect(isContainer({ id: 1 }, ['byTabId', '1'])).toBe(true);
    expect(isContainer({ id: 1 }, ['byTabId', '1', 'x'])).toBe(false);
    expect(isContainer([], ['x'])).toBe(false);
    expect(isContainer(Object.freeze({ a: 1 }), ['x'])).toBe(false);
    const copy = copyContainer({ a: { b: { id: 1, c: { d: 1 } } } }, []);
    expect(copy.a.b).toEqual({ id: 1, c: { d: 1 } });
  });

  it('a proxy inside the next global is replaced by its raw object in the committed global', () => {
    const { state, mirror, setGlobal, getGlobal } = setup();
    const proxyA = state.chats.byId.a;
    const g = getGlobal();
    const next = {
      ...g,
      byTabId: { ...g.byTabId, 1: { ...g.byTabId[1], giftCraftModal: { gift1: proxyA as Chat, gifts: [] } } },
    };
    setGlobal(next);
    expect(next.byTabId[1].giftCraftModal!.gift1).toBe(unwrap(proxyA));
    expect(mirror.byTabId[1].giftCraftModal!.gift1).toBe(g.chats.byId.a);
    expect(() => structuredClone(getGlobal())).not.toThrow();
  });

  it('never mirrors the DEV stamp', () => {
    const { mirror, writes, setGlobal, getGlobal } = setup();
    setGlobal({ ...getGlobal(), DEBUG_randomId: 0.5, isInited: false });
    expect(writes).toEqual([['isInited', false]]);
    expect('DEBUG_randomId' in mirror).toBe(false);
  });

  it('M1: a frozen object is a value — replaced, never descended into', () => {
    const { mirror, setGlobal, getGlobal } = setup();
    const frozen = Object.freeze({ query: 'q', results: [] }) as State['byTabId'][number]['globalSearch'];
    setGlobal(updateTab(getGlobal(), { globalSearch: frozen }));
    expect(mirror.byTabId[1].globalSearch).toBe(frozen);
    const next = Object.freeze({ query: 'q2', results: [] }) as typeof frozen;
    expect(() => setGlobal(updateTab(getGlobal(), { globalSearch: next }))).not.toThrow();
    expect(mirror.byTabId[1].globalSearch).toBe(next);
  });

  it('M2: an entity written whole keeps its own undefined-valued keys (only container keys are deleted)', () => {
    const { mirror, setGlobal, getGlobal } = setup();
    const chat = { id: 'c', title: 'C', unread: 0, photo: undefined } as Chat;
    setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, byId: { ...getGlobal().chats.byId, c: chat } } });
    expect('photo' in mirror.chats.byId.c).toBe(true); // the entity is tt's object, as it is
    setGlobal(updateTab(getGlobal(), { isLeftColumnShown: undefined }));
    expect('isLeftColumnShown' in mirror.byTabId[1]).toBe(false); // a container key: deleted
  });
});

describe('C1: tt value semantics hold for code that captured objects before setGlobal', () => {
  it('a captured entity is a snapshot: changedFields detection (apiUpdaters/chats.ts updateChat) works', () => {
    const { setGlobal, getGlobal } = setup();
    const localChat = getGlobal().chats.byId.a;
    const chatUpdate = { title: 'A2', unread: 9 };
    setGlobal(updateChat(getGlobal(), 'a', chatUpdate));
    const changedFields = (Object.keys(chatUpdate) as (keyof typeof chatUpdate)[]).filter(
      (k) => localChat[k] !== chatUpdate[k],
    );
    expect(changedFields).toEqual(['title', 'unread']);
    expect(localChat.title).toBe('A');
  });

  it('a rollback to a captured id-less record works (payments.ts applyBoost)', () => {
    const { mirror, setGlobal, getGlobal } = setup();
    setGlobal(updateTab(getGlobal(), { boostModal: { boostStatus: { level: 1, boosts: 3 } } }));
    const oldStatus = getGlobal().byTabId[1].boostModal!.boostStatus!;
    // optimistic write
    setGlobal(updateTab(getGlobal(), { boostModal: { boostStatus: { level: 1, boosts: 4 } } }));
    expect(mirror.byTabId[1].boostModal!.boostStatus!.boosts).toBe(4);
    // rollback
    setGlobal(updateTab(getGlobal(), { boostModal: { boostStatus: oldStatus } }));
    expect(oldStatus.boosts).toBe(3);
    expect(mirror.byTabId[1].boostModal!.boostStatus!.boosts).toBe(3);
  });

  it('an entity aliased into a slot does not corrupt the list it came from (ui/stars.ts selectGiftForCraft)', () => {
    const { state, mirror, setGlobal, getGlobal } = setup();
    const giftA = { id: 'ga', title: 'gift A', unread: 0 };
    const giftB = { id: 'gb', title: 'gift B', unread: 0 };
    setGlobal(updateTab(getGlobal(), { giftCraftModal: { gifts: [giftA, giftB] } }));
    const fromProps = state.byTabId[1].giftCraftModal!.gifts;
    setGlobal(
      updateTab(getGlobal(), { giftCraftModal: { ...getGlobal().byTabId[1].giftCraftModal!, gift1: fromProps[0] } }),
    );
    setGlobal(
      updateTab(getGlobal(), { giftCraftModal: { ...getGlobal().byTabId[1].giftCraftModal!, gift1: fromProps[1] } }),
    );
    expect(getGlobal().byTabId[1].giftCraftModal!.gifts.map((g) => g.id)).toEqual(['ga', 'gb']);
    expect(mirror.byTabId[1].giftCraftModal!.gifts.map((g) => g.id)).toEqual(['ga', 'gb']);
    expect(mirror.byTabId[1].giftCraftModal!.gift1!.id).toBe('gb');
  });

  it('swapping two id-less records between keys keeps both', () => {
    const { mirror, setGlobal, getGlobal } = setup();
    const s1 = { level: 1, boosts: 1 };
    const s2 = { level: 2, boosts: 2 };
    setGlobal(updateTab(getGlobal(), { boostModal: { boostStatus: s1 }, globalSearch: { results: [], query: 'x' } }));
    setGlobal(updateTab(getGlobal(), { boostModal: { boostStatus: s2 } }));
    setGlobal(updateTab(getGlobal(), { boostModal: { boostStatus: s1 } }));
    expect([s1.level, s2.level]).toEqual([1, 2]);
    expect(mirror.byTabId[1].boostModal!.boostStatus!.level).toBe(1);
  });

  it('two messages with the same id in different chats stay apart (oneTimeMediaModal.message)', () => {
    const { mirror, setGlobal, getGlobal } = setup();
    const fromA = getGlobal().messages.byChatId.a.byId[5];
    const fromB = getGlobal().messages.byChatId.b.byId[5];
    setGlobal(updateTab(getGlobal(), { oneTimeMediaModal: { message: fromA } }));
    setGlobal(updateTab(getGlobal(), { oneTimeMediaModal: { message: fromB } }));
    expect(mirror.messages.byChatId.a.byId[5].text).toBe('from A');
    expect(mirror.byTabId[1].oneTimeMediaModal!.message).toBe(fromB);
    expect(fromA.text).toBe('from A');
  });

  it('a WeakMap cache keyed by a store object is invalidated by a new object, as in tt', () => {
    const { setGlobal, getGlobal } = setup();
    const cache = new WeakMap<object, string>();
    const compute = (chat: Chat) => {
      let v = cache.get(chat);
      if (!v) cache.set(chat, (v = chat.title.toLowerCase()));
      return v;
    };
    expect(compute(getGlobal().chats.byId.a)).toBe('a');
    setGlobal(updateChat(getGlobal(), 'a', { title: 'NEW' }));
    expect(compute(getGlobal().chats.byId.a)).toBe('new');
  });

  it('module constants spread into the global are never mutated (reducers/passcode.ts clearGlobalForLockScreen)', () => {
    const { setGlobal, getGlobal } = setup();
    const INITIAL_TAB = { id: 0, notifications: [] as { localId: string }[], globalSearch: { results: [] as number[] } };
    const g = getGlobal();
    setGlobal({ ...g, byTabId: { ...g.byTabId, 2: { ...INITIAL_TAB, id: 2 } } });
    const g2 = getGlobal();
    setGlobal({
      ...g2,
      byTabId: { ...g2.byTabId, 2: { ...g2.byTabId[2], globalSearch: { ...g2.byTabId[2].globalSearch!, query: 'secret' } } },
    });
    expect(INITIAL_TAB.globalSearch).toEqual({ results: [] });
    expect('query' in INITIAL_TAB.globalSearch).toBe(false);
  });
});

describe('M3 property: random nested tt-style updates keep the mirror equal to the committed global', () => {
  it('3000 steps over 30 globals, including type changes, id changes, explicit undefined and deletions', () => {
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const ids = ['a', 'b', 'c', 'd'];
    for (let round = 0; round < 30; round++) {
      const { mirror, setGlobal, getGlobal } = setup();
      const snapshots: string[] = [];
      const snapshotRefs: State[] = [];
      for (let step = 0; step < 100; step++) {
        const g = getGlobal();
        const id = ids[rnd(ids.length)];
        const op = rnd(9);
        let next: State;
        if (op === 0) {
          next = updateChat(g, id, { ...(g.chats.byId[id] ?? { id, title: id, unread: 0 }), unread: rnd(10) });
        } else if (op === 1) {
          next = { ...g, chats: { ...g.chats, byId: omit(g.chats.byId, [id]) } };
        } else if (op === 2) {
          next = { ...g, chats: { ...g.chats, listIds: { active: ids.filter(() => rnd(2) === 0) } } };
        } else if (op === 3) {
          next = updateChat(g, id, { id, title: id, unread: 0, photo: rnd(2) ? { small: String(rnd(9)) } : undefined });
        } else if (op === 4) {
          next = { ...g, byTabId: { ...g.byTabId, 2: { id: 2, notifications: [], globalSearch: { results: [rnd(5)] } } } };
        } else if (op === 5) {
          next = { ...g, byTabId: omit(g.byTabId, [2]) };
        } else if (op === 6) {
          next = updateTab(g, { boostModal: rnd(2) ? { boostStatus: { level: rnd(3), boosts: rnd(3) } } : undefined });
        } else if (op === 7) {
          const chatKey = rnd(2) ? 'a' : 'b';
          const c = g.messages.byChatId[chatKey];
          const mid = 5 + rnd(3);
          const message: Message = { id: mid, chatId: 'x', text: String(rnd(100)), content: { text: { text: 't' } } };
          next = {
            ...g,
            messages: { byChatId: { ...g.messages.byChatId, [chatKey]: { ...c, byId: { ...c.byId, [mid]: message } } } },
          };
        } else {
          next = { ...g, chats: { ...g.chats, lastMessageIds: rnd(2) ? { all: { [id]: rnd(50) } } : undefined } };
        }
        setGlobal(next);
        if (step % 25 === 0) {
          snapshots.push(JSON.stringify(getGlobal()));
          snapshotRefs.push(getGlobal());
        }
        expect(json(mirror)).toStrictEqual(json(getGlobal()));
      }
      // earlier snapshots are untouched by later writes (tt value semantics)
      snapshotRefs.forEach((s, i) => expect(JSON.stringify(s)).toBe(snapshots[i]));
    }
  });
});
