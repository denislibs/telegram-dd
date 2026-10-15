import {
  createHeavyAnimationScope,
  createMutationEffect,
  createRoot,
  createSignal,
  getPhase,
  provideHeavyAnimationScope,
  requestMutation,
} from 'frameact';
import { createComponent, For, insert } from 'frameact/dom';
import { $SHAPE, $TRACK, createStore, produce, reconcile } from 'frameact/store';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { container, useDomHarness } from './testing/dom';
import { fakeLayout, resetLayout } from './testing/layout';
import { flushMicrotasks } from './testing/micro';
import { InfiniteScroll } from './infiniteScroll';
import { createScrollAnchor } from './scrollAnchor';

const { frame } = useDomHarness();

afterEach(() => {
  resetLayout();
  vi.useRealTimers();
});

const ids = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

function row(id: number) {
  const el = document.createElement('div');
  el.className = 'ListItem';
  el.textContent = String(id);
  return el;
}

const ForC = For as (props: any) => unknown;

async function settle() {
  await flushMicrotasks();
  await frame();
}

describe('createScrollAnchor', () => {
  it('prepend: the anchor (first visible item) keeps its position — snapshot in measure, DOM in mutate, restore in forced reflow, one frame', async () => {
    const root = container();
    const log: string[] = [];
    fakeLayout(root, root, 40, 200, (top) => log.push(`write:${getPhase()}:${top}`));
    const [items, setItems] = createSignal(ids(100, 120));
    createRoot(() => {
      insert(
        root,
        createComponent(ForC, {
          get each() {
            return items();
          },
          children: row,
        }),
      );
      createScrollAnchor({ container: () => root, items });
      // an observer of the list's mutate phase, to see the order of the phases
      createMutationEffect(
        () => items(),
        (v, prev) => {
          if (prev) log.push(`list:${getPhase()}`);
        },
      );
    });
    await frame(); // the snapshot effect's first run
    root.scrollTop = 120; // item 103 at the top of the viewport
    log.length = 0;
    setItems([...ids(80, 100), ...ids(100, 120)]); // 20 rows (800 px) prepended
    await frame();
    expect(root.scrollTop).toBe(920);
    // the list's mutate apply, then the restore in the forced-reflow mutate phase (fasterdom reports it as 'measure'
    // until the mutations run: the write is in the mutation closure, phase 'mutate')
    expect(log).toEqual(['list:mutate', 'write:mutate:920']);
    expect(root.querySelectorAll('.ListItem').length).toBe(40);
    // append: the anchor does not move, nothing is written
    setItems([...ids(80, 120), ...ids(120, 130)]);
    await frame();
    expect(root.scrollTop).toBe(920);
    expect(log.length).toBe(3);
    expect(log[2]).toBe('list:mutate');
  });

  it('noScrollRestore skips the write; noScrollRestoreOnTop skips it only at scrollTop 0; a removed anchor is replaced by the first item', async () => {
    const root = container();
    fakeLayout(root);
    const [items, setItems] = createSignal(ids(0, 10));
    const [onTop, setOnTop] = createSignal(false);
    const [never, setNever] = createSignal(false);
    createRoot(() => {
      insert(
        root,
        createComponent(ForC, {
          get each() {
            return items();
          },
          children: row,
        }),
      );
      createScrollAnchor({ container: () => root, items, noScrollRestore: never, noScrollRestoreOnTop: onTop });
    });
    await frame();
    setOnTop(true);
    setItems([-1, ...ids(0, 10)]); // at the top: a prepend pushes content down, by design
    await frame();
    expect(root.scrollTop).toBe(0);
    root.scrollTop = 80;
    setItems([-2, -1, ...ids(0, 10)]); // not at the top any more: restored
    await frame();
    expect(root.scrollTop).toBe(120);
    setNever(true);
    setItems([-3, -2, -1, ...ids(0, 10)]);
    await frame();
    expect(root.scrollTop).toBe(120); // not restored
    setNever(false);
    setItems(ids(5, 10)); // the anchor (-3, the first item) is gone: the new first item becomes the anchor, no write
    await frame();
    expect(root.scrollTop).toBe(120);
    setItems([4, ...ids(5, 10)]);
    await frame();
    expect(root.scrollTop).toBe(160); // anchored on 5 again
  });

  it('noScrollRestore: an update reads no layout of the anchor (no forced reflow), and restoring works again once it is off', async () => {
    const root = container();
    fakeLayout(root);
    const [items, setItems] = createSignal(ids(0, 10));
    const [never, setNever] = createSignal(true);
    createRoot(() => {
      insert(
        root,
        createComponent(ForC, {
          get each() {
            return items();
          },
          children: row,
        }),
      );
      createScrollAnchor({ container: () => root, items, noScrollRestore: never });
    });
    await frame();
    root.scrollTop = 80;
    const rectReads = vi.spyOn(Object.getPrototypeOf(root) as HTMLElement, 'getBoundingClientRect');
    try {
      setItems([-1, ...ids(0, 10)]);
      await frame();
      setItems([-2, -1, ...ids(0, 10)]);
      await frame();
      expect(rectReads).not.toHaveBeenCalled();
      expect(root.scrollTop).toBe(80);

      setNever(false);
      setItems([-3, -2, -1, ...ids(0, 10)]);
      await frame();
      setItems([-4, -3, -2, -1, ...ids(0, 10)]);
      await frame();
      expect(rectReads).toHaveBeenCalled();
      expect(root.scrollTop).toBe(160); // two rows prepended, restored by the anchor (item 0) both times
    } finally {
      rectReads.mockRestore();
    }
  });

  it('store list under a non-blocking animation: the parked snapshot, update and restore are released into ONE frame in phase order, even when the animation ends from a mutate task (R1)', async () => {
    const root = container();
    const log: string[] = [];
    fakeLayout(root, root, 40, 200, (top) => log.push(`restore:${getPhase()}:${top}`));
    const [state, setState] = createStore({ items: ids(100, 120) });
    const scope = createHeavyAnimationScope();
    createRoot(() => {
      provideHeavyAnimationScope(scope);
      insert(
        root,
        createComponent(ForC, {
          get each() {
            return state.items;
          },
          children: row,
        }),
      );
      createScrollAnchor({ container: () => root, items: () => state.items });
      createMutationEffect(
        () => state.items,
        (v, prev) => {
          if (prev) log.push(`list:${getPhase()}`);
        },
      );
    });
    await settle();
    root.scrollTop = 120;
    log.length = 0;
    const end = scope.begin(Infinity);
    setState('items', [...ids(80, 100), ...ids(100, 120)]);
    await settle();
    expect(root.querySelectorAll('.ListItem').length).toBe(20); // parked: the DOM did not change
    expect(log).toEqual([]);
    requestMutation(() => end()); // a Transition's onAnimationEnd ends the animation from the mutate phase
    const [other, setOther] = createSignal(0);
    createRoot(() =>
      createMutationEffect(
        () => other(),
        () => {},
      ),
    ); // a mutate drain of that frame runs after end()
    setOther(1);
    await settle(); // the frame in which end() runs: nothing of ours must apply in it
    expect(log).toEqual([]);
    await settle(); // the release frame
    expect(log).toEqual(['list:mutate', 'restore:mutate:920']); // measure (snapshot, silent) → mutate → forced-reflow mutate
    expect(root.scrollTop).toBe(920);
  });
  it('a store array written in place (produce, keyed reconcile) is anchored by its shape', async () => {
    const root = container();
    fakeLayout(root);
    const [state, setState] = createStore({ items: ids(100, 120).map((id) => ({ id })) });
    createRoot(() => {
      insert(
        root,
        createComponent(ForC, {
          get each() {
            return state.items;
          },
          children: (m: { id: number }) => row(m.id),
        }),
      );
      createScrollAnchor({ container: () => root, items: () => state.items });
    });
    await settle();
    root.scrollTop = 120;
    setState(
      'items',
      produce((list: { id: number }[]) => {
        list.unshift(...ids(80, 100).map((id) => ({ id })));
      }),
    );
    await settle();
    expect(root.querySelectorAll('.ListItem').length).toBe(40);
    expect(root.scrollTop).toBe(920);
    setState('items', reconcile(ids(60, 120).map((id) => ({ id })))); // 20 more on top, rows matched by id
    await settle();
    expect(root.querySelectorAll('.ListItem').length).toBe(60);
    expect(root.scrollTop).toBe(1720);
  });
});

function mount(extra: Record<string, unknown>, initial: number[]) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const root = container();
  const [items, setItems] = createSignal(initial);
  const loads: unknown[] = [];
  let el!: HTMLDivElement;
  let dispose!: () => void;
  createRoot((disposeRoot) => {
    dispose = disposeRoot;
    insert(
      root,
      createComponent(InfiniteScroll, {
        get items() {
          return items();
        },
        ref: (e: HTMLDivElement) => {
          el = e;
        },
        onLoadMore: (args: unknown) => loads.push(args),
        class: 'list',
        get children() {
          return createComponent(ForC, {
            get each() {
              return items();
            },
            children: row,
          });
        },
        ...extra,
      }),
    );
  });
  fakeLayout(el);
  return { el, items, setItems, loads, dispose };
}

async function frames(count: number) {
  for (let i = 0; i < count; i++) await frame();
}

/** Rows at `(offset + i) * 72` px like the chat list (absolutely positioned: the container's own edges are far from them). */
function mountAbsolute(offset: number, count: number, scrollHeight: number) {
  const m = mount({ noScrollRestore: true, sensitiveArea: 800 }, ids(offset, offset + count));
  const rows = Array.from(m.el.querySelectorAll<HTMLElement>('.ListItem'));
  rows.forEach((rowEl, i) => {
    Object.defineProperty(rowEl, 'offsetTop', { configurable: true, get: () => (offset + i) * 72 });
    Object.defineProperty(rowEl, 'offsetHeight', { configurable: true, get: () => 72 });
  });
  Object.defineProperty(m.el, 'scrollHeight', { configurable: true, get: () => scrollHeight });
  Object.defineProperty(m.el, 'clientHeight', { configurable: true, get: () => 662 });
  Object.defineProperty(m.el, 'offsetHeight', { configurable: true, get: () => 662 });
  return m;
}

describe('<InfiniteScroll> near-edge loads use the first and the last RENDERED item (tt), not the container edges', () => {
  it('after the window slid down, scrolling up asks forwards while the container top is still far (6018 px)', async () => {
    const { el, loads } = mountAbsolute(90, 58, 12000);
    await frames(2);
    loads.length = 0;
    el.scrollTop = 6200;
    el.dispatchEvent(new Event('scroll')); // the first event only records the position
    el.scrollTop = 6018;
    el.dispatchEvent(new Event('scroll'));
    expect(loads).toEqual([{ direction: 'forwards' }]);
  });

  it('a jump upwards that lands far above the rows asks forwards; moving down inside the gap does not', async () => {
    const { el, loads } = mountAbsolute(90, 58, 12000);
    await frames(2);
    loads.length = 0;
    el.scrollTop = 7000;
    el.dispatchEvent(new Event('scroll'));
    el.scrollTop = 3000; // 3480 px above the first row (6480): the container top (3000 px away) is no reason to stay quiet
    el.dispatchEvent(new Event('scroll'));
    expect(loads).toEqual([{ direction: 'forwards' }]);

    vi.advanceTimersByTime(1100);
    loads.length = 0;
    el.scrollTop = 5800; // moving down towards the rows: nothing to ask
    el.dispatchEvent(new Event('scroll'));
    expect(loads).toEqual([]);
  });

  it('scrolling down asks backwards near the last rendered row, not near the container bottom', async () => {
    const { el, loads } = mountAbsolute(0, 58, 12000); // rows end at 4176
    await frames(2);
    loads.length = 0;
    el.scrollTop = 2000;
    el.dispatchEvent(new Event('scroll'));
    el.scrollTop = 3000; // 4176 - (3000 + 662) = 514 <= 800; the container bottom is 8000 px away
    el.dispatchEvent(new Event('scroll'));
    expect(loads).toEqual([{ direction: 'backwards', noScroll: false }]);
  });

  it('does not ask while the rows are far from both edges of the viewport', async () => {
    const { el, loads } = mountAbsolute(0, 58, 12000);
    await frames(2);
    loads.length = 0;
    el.scrollTop = 1000;
    el.dispatchEvent(new Event('scroll'));
    el.scrollTop = 1200; // moving down, 4176 - 1862 = 2314 > 800
    el.dispatchEvent(new Event('scroll'));
    expect(loads).toEqual([]);
  });
});

describe('<InfiniteScroll> preload guards', () => {
  it('a list without a box (display: none: clientHeight 0) is not "short": it does not slide its window', async () => {
    const { el, setItems, loads } = mount({ preloadBackwards: 0 }, ids(0, 50));
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 0 });
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 0 });
    await frames(2);
    setItems(ids(0, 52));
    await frames(2);
    expect(loads).toEqual([]);
  });

  it('a preload booked before the list is disposed does not run after it', async () => {
    const { setItems, loads, dispose } = mount({}, ids(0, 5));
    await frames(2);
    const before = loads.length;
    expect(before).toBeGreaterThan(0);
    setItems(ids(0, 6));
    await frame(); // the items effect books the preload for the next frame
    dispose();
    await frames(2);
    expect(loads.length).toBe(before);
  });
});

describe('<InfiniteScroll>', () => {
  it('preloads backwards when the list is shorter than preloadBackwards; otherwise when it does not fill the viewport; not when it does', async () => {
    const short = mount({}, ids(0, 5));
    await frames(2); // the preload is a measure task booked from the items effect: it runs the next frame
    expect(short.loads).toEqual([{ direction: 'backwards', noScroll: true }]);
    expect(short.el.className).toBe('list');

    const notFilling = mount({ preloadBackwards: 0 }, ids(0, 3)); // 120 px < 200 px viewport
    await frames(2); // the preload is a measure task booked from the items effect: it runs the next frame
    expect(notFilling.loads).toEqual([{ direction: 'backwards', noScroll: false }]);

    const full = mount({}, ids(0, 50));
    await frames(2); // the preload is a measure task booked from the items effect: it runs the next frame
    expect(full.loads).toEqual([]);
  });

  it("scrolling near the bottom (moving down) asks backwards, near the top (moving up) forwards; quiet for 1 s; the restore's own scroll event is ignored", async () => {
    const { el, setItems, loads } = mount({ sensitiveArea: 100 }, ids(0, 50)); // 2000 px, viewport 200
    await frame();
    el.dispatchEvent(new Event('scroll')); // first event: the anchor is tracked, no load
    expect(loads).toEqual([]);
    el.scrollTop = 1750; // 50 px from the bottom
    el.dispatchEvent(new Event('scroll'));
    expect(loads).toEqual([{ direction: 'backwards', noScroll: false }]);
    el.scrollTop = 1800;
    el.dispatchEvent(new Event('scroll'));
    expect(loads.length).toBe(1); // debounced: quiet for a second
    setItems(ids(0, 70)); // the chunk arrives: appended, no restore
    await frame();
    el.scrollTop = 2750;
    el.dispatchEvent(new Event('scroll'));
    expect(loads.length).toBe(2); // a new chunk re-arms the loader
    // back to the top
    el.scrollTop = 500;
    el.dispatchEvent(new Event('scroll'));
    el.scrollTop = 50;
    el.dispatchEvent(new Event('scroll'));
    expect(loads[2]).toEqual({ direction: 'forwards' });
    setItems([...ids(-20, 0), ...ids(0, 70)]); // 20 rows prepended → restored to 850
    await frame();
    expect(el.scrollTop).toBe(850);
    el.dispatchEvent(new Event('scroll')); // the browser's scroll event from the restore: not a user scroll
    expect(loads.length).toBe(3);
  });
});

describe('<InfiniteScroll> restore scroll event', () => {
  it("the scroll event of the restore's own write is not a user scroll: it lands within sensitiveArea of the bottom, yet asks for nothing (N5)", async () => {
    const { el, setItems, loads } = mount({ sensitiveArea: 100 }, ids(0, 50)); // 2000 px, viewport 200
    await frame();
    el.dispatchEvent(new Event('scroll')); // the first event tracks the anchor
    el.scrollTop = 1750; // 50 px from the bottom: asks backwards
    el.dispatchEvent(new Event('scroll'));
    expect(loads).toEqual([{ direction: 'backwards', noScroll: false }]);
    setItems([...ids(-2, 0), ...ids(0, 50)]); // 2 rows (80 px) prepended; the new chunk re-arms the loader
    await frame();
    expect(el.scrollTop).toBe(1830); // restored: 50 px from the bottom of 2080 again, and "moving down"
    el.dispatchEvent(new Event('scroll')); // the browser's scroll event for the restore's own write
    expect(loads.length).toBe(1);
    el.scrollTop = 1840; // a real user scroll right after is honoured
    el.dispatchEvent(new Event('scroll'));
    expect(loads.length).toBe(2);
  });
});

describe('<InfiniteScroll> switching lists', () => {
  it('switching between two untouched store arrays (same shape version) preloads again (N1)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const root = container();
    const [state] = createStore({ a: ids(0, 3), b: ids(10, 12) });
    const [which, setWhich] = createSignal<'a' | 'b'>('a');
    const loads: unknown[] = [];
    let el!: HTMLDivElement;
    createRoot(() => {
      insert(
        root,
        createComponent(InfiniteScroll, {
          get items() {
            return state[which()];
          },
          ref: (e: HTMLDivElement) => {
            el = e;
          },
          onLoadMore: (args: unknown) => loads.push(args),
          get children() {
            return createComponent(ForC, {
              get each() {
                return state[which()];
              },
              children: row,
            });
          },
        }),
      );
    });
    fakeLayout(el);
    await frames(2);
    expect(loads.length).toBe(1);
    setWhich('b'); // both arrays are unchanged: shape version 0 each
    await frames(2);
    expect(loads.length).toBe(2);
    setWhich('a');
    await frames(2);
    expect(loads.length).toBe(3);
  });
});

describe('<InfiniteScroll> tracked reads', () => {
  it("reads the list's shape once per update — one tracked read beyond createScrollAnchor's own (clean-room finding 7)", async () => {
    // A list whose shape read is observable: a Proxy over a plain array that answers [$SHAPE] / [$TRACK] like a store array does.
    let shapeReads = 0;
    let version = 0;
    const shaped = (arr: number[]) =>
      new Proxy(arr, {
        get(target, key, receiver) {
          if (key === $SHAPE) {
            shapeReads++;
            return ++version; // a fresh version per read, like a store array that changed
          }
          if (key === $TRACK) {
            shapeReads++;
            return target;
          }
          return Reflect.get(target, key, receiver);
        },
      });
    // Reference: the anchor alone.
    const box = container();
    fakeLayout(box);
    const [a, setA] = createSignal(shaped(ids(0, 5)));
    createRoot(() => createScrollAnchor({ container: () => box, items: a }));
    await settle();
    shapeReads = 0;
    setA(shaped(ids(0, 6)));
    await settle();
    const anchorReads = shapeReads;
    expect(anchorReads).toBeGreaterThan(0);
    // The component (no <For>: a list component reads the shape too, and that is its own read).
    const { setItems, loads } = mount({ children: undefined, preloadBackwards: 100 }, shaped(ids(0, 50)));
    await settle();
    shapeReads = 0;
    loads.length = 0;
    setItems(shaped(ids(0, 60)));
    await settle();
    expect(shapeReads).toBe(anchorReads + 1);
    expect(loads.length).toBeGreaterThan(0); // the apply ran (loaders re-armed, preload asked)
  });
});
