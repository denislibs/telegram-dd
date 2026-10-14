import { createMemo, createRoot } from 'frameact';
import { $TRACK, createStore, unwrap } from 'frameact/store';
import { describe, expect, it, vi } from 'vitest';

import { omit } from '../../util/iteratees';
import { applyGlobal, copyContainer, isContainer, setDevChecks, type UntypedSetState } from './apply';
import { mulberry32 } from './prng';

type Message = { id: number; chatId: string; text: string; content?: { text: { text: string } } };
type Chat = { id: string; title: string; unread: number; photo?: { small: string } };
type State = {
  isInited: boolean;
  chats: {
    byId: Record<string, Chat>;
    listIds: { active: string[] };
    lastMessageIds?: { all: Record<string, number> };
  };
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
    expect(next.byTabId[1].giftCraftModal.gift1).toBe(unwrap(proxyA));
    expect(mirror.byTabId[1].giftCraftModal!.gift1).toBe(g.chats.byId.a);
    expect(() => structuredClone(getGlobal())).not.toThrow();
  });

  it('DEV scan (N5): a proxy nested deep inside an entity or an array is reported once; container levels are not rescanned', () => {
    const { state, setGlobal, getGlobal } = setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    setDevChecks(true);
    try {
      const proxyB = state.chats.byId.b as unknown as Chat;
      let g = getGlobal();
      // deep inside an entity field: entity.photo.deep.proxy
      setGlobal({
        ...g,
        chats: {
          ...g.chats,
          byId: { ...g.chats.byId, a: { ...g.chats.byId.a, photo: { small: 's', deep: { p: proxyB } } as never } },
        },
      });
      expect(error).toHaveBeenCalledTimes(1);
      // deep inside an array: [{ wrap: { p: proxy } }]
      g = getGlobal();
      setGlobal({
        ...g,
        byTabId: {
          ...g.byTabId,
          1: { ...g.byTabId[1], giftCraftModal: { gifts: [{ wrap: { p: proxyB } } as never] } },
        },
      });
      expect(error).toHaveBeenCalledTimes(2);
      // a container-only change with no proxies: nothing reported
      g = getGlobal();
      setGlobal({ ...g, byTabId: { ...g.byTabId, 1: { ...g.byTabId[1], isLeftColumnShown: true } } });
      expect(error).toHaveBeenCalledTimes(2);
    } finally {
      setDevChecks(false);
      error.mockRestore();
    }
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

describe('appsec 1: keys that Object.prototype also has must not hide a deletion', () => {
  it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf'])(
    'byId { a, b } -> { b, %s } in one setGlobal removes a from the mirror',
    (inherited) => {
      const { mirror, setGlobal, getGlobal } = setup();
      const g = getGlobal();
      setGlobal({
        ...g,
        chats: { ...g.chats, byId: { b: g.chats.byId.b, [inherited]: { id: inherited, title: 'x', unread: 0 } } },
      });
      expect(Object.hasOwn(getGlobal().chats.byId, 'a')).toBe(false);
      expect(Object.hasOwn(mirror.chats.byId, 'a')).toBe(false);
      expect(Object.hasOwn(mirror.chats.byId, inherited)).toBe(true);
      // (toStrictEqual trips over an own `constructor` key, so compare the keys and the entities one by one)
      expect(Object.keys(mirror.chats.byId).sort()).toEqual(Object.keys(getGlobal().chats.byId).sort());
      expect(mirror.chats.byId.b).toBe(getGlobal().chats.byId.b);
    },
  );
});

describe('appsec 2: a cyclic or absurdly deep value is refused with a clear error, not a stack overflow', () => {
  const REFUSED = /\[global\] .*(cycle|nested deeper)/i;
  const withSettings = (g: State, value: unknown) => ({ ...g, settings: value }) as unknown as State;

  it('a container that points back at itself (structured clone keeps cycles)', () => {
    const { setGlobal, getGlobal } = setup();
    const settings: AnyLiteral = { x: { y: 1 } };
    settings.x.self = settings;
    expect(() => setGlobal(withSettings(getGlobal(), settings))).toThrow(REFUSED);
  });

  it('a 10 000-deep chain of id-less objects', () => {
    const { setGlobal, getGlobal } = setup();
    let deep: AnyLiteral = { leaf: true };
    for (let i = 0; i < 10_000; i++) deep = { next: deep };
    expect(() => setGlobal(withSettings(getGlobal(), deep))).toThrow(REFUSED);
  });

  it('an array that contains itself, and a deep chain of arrays', () => {
    const { setGlobal, getGlobal } = setup();
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => setGlobal(withSettings(getGlobal(), { list: cyclic }))).toThrow(REFUSED);
    let nested: unknown[] = [];
    for (let i = 0; i < 10_000; i++) nested = [nested];
    expect(() => setGlobal(withSettings(getGlobal(), { list: nested }))).toThrow(REFUSED);
  });

  it('copyContainer refuses too (the new-container branch)', () => {
    const cyc: AnyLiteral = {};
    cyc.self = cyc;
    expect(() => copyContainer(cyc, ['settings'])).toThrow(REFUSED);
  });

  it('legitimately nested containers (a few levels, wide) pass', () => {
    const { setGlobal, getGlobal, mirror } = setup();
    setGlobal(withSettings(getGlobal(), { a: { b: { c: { d: { e: { f: { value: 1 } } } } } } }));
    expect((mirror as AnyLiteral).settings.a.b.c.d.e.f.value).toBe(1);
  });
});

describe('appsec 4: a sparse array with a huge length does not freeze the walk', () => {
  const sparse = (length: number) => {
    const array: unknown[] = [];
    array.length = length;
    array[3] = 'x';
    return array;
  };

  it.each([1e8, 2 ** 32 - 1])('length %d is refused quickly with a clear error', (length) => {
    const { setGlobal, getGlobal } = setup();
    const started = performance.now();
    expect(() => setGlobal({ ...getGlobal(), settings: { list: sparse(length) } } as unknown as State)).toThrow(
      /\[global\] .*sparse/i,
    );
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('the same value inside an entity-less list of ids, written over an existing array, is refused too', () => {
    const { setGlobal, getGlobal } = setup();
    expect(() =>
      setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, listIds: { active: sparse(1e8) as string[] } } }),
    ).toThrow(/sparse/i);
  });

  it('a long but dense array (600k ids) is a value like any other', () => {
    const { setGlobal, getGlobal, mirror } = setup();
    const ids = Array.from({ length: 600_000 }, (_, i) => String(i));
    setGlobal({ ...getGlobal(), chats: { ...getGlobal().chats, listIds: { active: ids } } });
    expect(mirror.chats.listIds.active).toHaveLength(600_000);
  });
});

describe('ownership: what the store (frameact adopt) writes into tt objects', () => {
  /** An object whose every write and deletion is recorded; reads pass through (so `adopt` can walk it). */
  const watched = <T extends object>(target: T, log: string[], name: string): T =>
    new Proxy(target, {
      set(t, key, value) {
        log.push(`${name}.${String(key)} = …`);
        return Reflect.set(t, key, value);
      },
      deleteProperty(t, key) {
        log.push(`delete ${name}.${String(key)}`);
        return Reflect.deleteProperty(t, key);
      },
      defineProperty(t, key, descriptor) {
        log.push(`define ${name}.${String(key)}`);
        return Reflect.defineProperty(t, key, descriptor);
      },
    });

  it('well-formed data: nothing is written into the objects handed to the store', () => {
    const { setGlobal, getGlobal, mirror } = setup();
    const log: string[] = [];
    const photo = watched({ small: 'c.jpg', nested: { deep: [1, 2, { x: 1 }] } }, log, 'photo');
    const entity = watched({ id: 'c', title: 'C', unread: 1, photo }, log, 'chat');
    const list = watched(['a', 'b', 'c'], log, 'list');
    const g = getGlobal();
    setGlobal({
      ...g,
      chats: { ...g.chats, byId: { ...g.chats.byId, c: entity }, listIds: { active: list } },
    });
    expect(mirror.chats.byId.c).toBe(entity);
    expect(log).toEqual([]);
  });

  it('forged data: the one observable write is the removal of an own __proto__ key — and nothing is polluted', () => {
    const { setGlobal, getGlobal, mirror } = setup();
    const forged = JSON.parse(
      '{"id":"f","title":"F","unread":0,"__proto__":{"polluted":"yes"},"photo":{"__proto__":{"p":1}}}',
    );
    expect(Object.hasOwn(forged, '__proto__')).toBe(true);
    const g = getGlobal();
    setGlobal({ ...g, chats: { ...g.chats, byId: { ...g.chats.byId, f: forged } } });
    // frameact's adopt strips it from the object the store was handed — i.e. from the committed tt object as well
    expect(Object.hasOwn(forged, '__proto__')).toBe(false);
    expect(Object.hasOwn(forged.photo, '__proto__')).toBe(false);
    expect(mirror.chats.byId.f).toBe(forged);
    expect(({} as AnyLiteral).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(forged)).toBe(Object.prototype);
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
    const INITIAL_TAB = {
      id: 0,
      notifications: [] as { localId: string }[],
      globalSearch: { results: [] as number[] },
    };
    const g = getGlobal();
    setGlobal({ ...g, byTabId: { ...g.byTabId, 2: { ...INITIAL_TAB, id: 2 } } });
    const g2 = getGlobal();
    setGlobal({
      ...g2,
      byTabId: {
        ...g2.byTabId,
        2: { ...g2.byTabId[2], globalSearch: { ...g2.byTabId[2].globalSearch!, query: 'secret' } },
      },
    });
    expect(INITIAL_TAB.globalSearch).toEqual({ results: [] });
    expect('query' in INITIAL_TAB.globalSearch).toBe(false);
  });
});

describe('N1: a store-owned container copy never leaks into the committed global', () => {
  it('GiftInfoModal → openGiftUpgradeModal({ gift }): the proxied id-less record is detached, later writes do not reach it', () => {
    const { state, mirror, setGlobal, getGlobal } = setup();
    const giftA = { slug: 'a', title: 'gift A' } as unknown as Chat; // ApiSavedStarGift has no `id`: a container copy in the store
    setGlobal(updateTab(getGlobal(), { giftCraftModal: { gift1: giftA, gifts: [] } }));
    const fromProps = state.byTabId[1].giftCraftModal!.gift1!; // what a component holds
    expect(unwrap(fromProps)).not.toBe(giftA);

    // the component calls an action with the proxy; the reducer stores it under another key
    setGlobal(
      updateTab(getGlobal(), { giftCraftModal: { ...getGlobal().byTabId[1].giftCraftModal!, gift2: fromProps } }),
    );
    const committedGift2 = getGlobal().byTabId[1].giftCraftModal!.gift2!;
    expect(committedGift2).toEqual({ slug: 'a', title: 'gift A' });
    expect(committedGift2).not.toBe(unwrap(fromProps)); // not the store's private copy

    // gift1 changes: the store merges into its gift1 copy; gift2 must stay 'a' everywhere
    setGlobal(
      updateTab(getGlobal(), {
        giftCraftModal: {
          ...getGlobal().byTabId[1].giftCraftModal!,
          gift1: { slug: 'b', title: 'gift B' } as unknown as Chat,
        },
      }),
    );
    expect((getGlobal().byTabId[1].giftCraftModal!.gift2 as AnyLiteral).slug).toBe('a');
    expect((mirror.byTabId[1].giftCraftModal!.gift2 as AnyLiteral).slug).toBe('a');
    expect(json(mirror)).toStrictEqual(json(getGlobal()));
  });

  it('the same through an array and through an entity field (one level), and a spread of a proxy record', () => {
    const { state, mirror, setGlobal, getGlobal } = setup();
    const record = { slug: 'a', title: 'A' } as unknown as Chat;
    setGlobal(updateTab(getGlobal(), { giftCraftModal: { gift1: record, gifts: [] } }));
    const proxied = state.byTabId[1].giftCraftModal!.gift1!;
    setGlobal(
      updateTab(getGlobal(), {
        giftCraftModal: {
          ...getGlobal().byTabId[1].giftCraftModal!,
          gifts: [proxied], // array
          gift2: { id: 'e', slot: proxied } as unknown as Chat, // entity with a proxied container field
          oneTime: { ...proxied }, // a spread of the proxy (a new plain object)
        },
      }),
    );
    setGlobal(
      updateTab(getGlobal(), {
        giftCraftModal: {
          ...getGlobal().byTabId[1].giftCraftModal!,
          gift1: { slug: 'b', title: 'B' } as unknown as Chat,
        },
      }),
    );
    const modal = getGlobal().byTabId[1].giftCraftModal as AnyLiteral;
    expect(modal.gifts[0].slug).toBe('a');
    expect(modal.gift2.slot.slug).toBe('a');
    expect(modal.oneTime.slug).toBe('a');
    expect(json(mirror)).toStrictEqual(json(getGlobal()));
  });
});

describe('M3 property: random nested tt-style updates keep the mirror equal to the committed global', () => {
  it('3000 steps over 30 globals, including type changes, id changes, explicit undefined and deletions', () => {
    const rnd = mulberry32(7);
    const ids = ['a', 'b', 'c', 'd'];
    // coverage (review I1): every operation, every id and same-length array replacements are really exercised
    const opCounts = new Array<number>(9).fill(0);
    const usedIds = new Set<string>();
    let sameLengthReplacements = 0;
    for (let round = 0; round < 30; round++) {
      const { mirror, setGlobal, getGlobal } = setup();
      const snapshots: string[] = [];
      const snapshotRefs: State[] = [];
      for (let step = 0; step < 100; step++) {
        const g = getGlobal();
        const id = ids[rnd(ids.length)];
        const op = rnd(9);
        opCounts[op]++;
        usedIds.add(id);
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
          next = {
            ...g,
            byTabId: { ...g.byTabId, 2: { id: 2, notifications: [], globalSearch: { results: [rnd(5)] } } },
          };
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
            messages: {
              byChatId: { ...g.messages.byChatId, [chatKey]: { ...c, byId: { ...c.byId, [mid]: message } } },
            },
          };
        } else {
          next = { ...g, chats: { ...g.chats, lastMessageIds: rnd(2) ? { all: { [id]: rnd(50) } } : undefined } };
        }
        const listBefore = g.chats.listIds.active;
        setGlobal(next);
        const listAfter = getGlobal().chats.listIds.active;
        if (
          listBefore !== listAfter &&
          listBefore?.length === listAfter?.length &&
          listBefore.join() !== listAfter.join()
        ) {
          sameLengthReplacements++;
        }
        if (step % 25 === 0) {
          snapshots.push(JSON.stringify(getGlobal()));
          snapshotRefs.push(getGlobal());
        }
        expect(json(mirror)).toStrictEqual(json(getGlobal()));
      }
      // earlier snapshots are untouched by later writes (tt value semantics)
      snapshotRefs.forEach((s, i) => expect(JSON.stringify(s)).toBe(snapshots[i]));
    }
    opCounts.forEach((count) => expect(count).toBeGreaterThan(100));
    expect(usedIds.size).toBe(ids.length);
    expect(sameLengthReplacements).toBeGreaterThanOrEqual(1);
  });
});
