// Original test (not in telegram-tt): the progressive mount of a window of ids (a page-in of the chat list).
import { createRoot, createSignal } from 'frameact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import useProgressiveIds from './useProgressiveIds';

// The memo is lazy: a rendered list reads it at mount and after every change, so does the test after every frame.
let reader: (() => unknown) | undefined;
const create = <T>(ids: () => T[] | undefined, chunk: number) => {
  const rendered = useProgressiveIds(ids, chunk);
  rendered();
  reader = rendered;
  return rendered;
};

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `c${from + i}`);

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

// Runs the frames requested so far (a frame requested while running waits for the next call).
const flushFrame = () => {
  const batch = [...frames.entries()];
  frames.clear();
  for (const [, callback] of batch) callback(0);
  reader?.();
  return batch.length;
};
const flushAll = () => {
  let guard = 0;
  while (flushFrame()) if (++guard > 100) throw new Error('never caught up');
  return guard;
};

beforeEach(() => {
  frames = new Map();
  reader = undefined;
  nextFrame = 1;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useProgressiveIds', () => {
  it('mounts a list from scratch `chunk` rows per frame, from the top', () => {
    createRoot((dispose) => {
      const [ids] = createSignal<string[] | undefined>(range(0, 40));
      const rendered = create(ids, 15);

      expect(rendered()).toEqual(range(0, 15));
      flushFrame();
      expect(rendered()).toEqual(range(0, 30));
      flushFrame();
      expect(rendered()).toEqual(range(0, 40));
      expect(flushAll()).toBe(0);
      dispose();
    });
  });

  it('applies a small change at once, without a frame', () => {
    createRoot((dispose) => {
      const [ids, setIds] = createSignal<string[] | undefined>(range(0, 20));
      const rendered = create(ids, 15);
      flushAll();
      expect(rendered()).toEqual(range(0, 20));

      setIds(['new', ...range(0, 20)]);
      expect(rendered()).toEqual(['new', ...range(0, 20)]);
      expect(frames.size).toBe(0);

      setIds(['c3', 'c1', 'c2', 'new', 'c0']);
      expect(rendered()).toEqual(['c3', 'c1', 'c2', 'new', 'c0']);
      expect(frames.size).toBe(0);
      dispose();
    });
  });

  it('a page-in below mounts the rows next to the mounted ones first, in order', () => {
    createRoot((dispose) => {
      const [ids, setIds] = createSignal<string[] | undefined>(range(0, 30));
      const rendered = create(ids, 15);
      flushAll();

      setIds(range(0, 60));
      expect(rendered()).toEqual(range(0, 45));
      flushFrame();
      expect(rendered()).toEqual(range(0, 60));
      dispose();
    });
  });

  it('a page-in above (the window slides up) mounts the rows next to the mounted ones first', () => {
    createRoot((dispose) => {
      const [ids, setIds] = createSignal<string[] | undefined>(range(30, 60));
      const rendered = create(ids, 15);
      flushAll();

      // the window gained 30 rows on top and lost 10 at the bottom
      setIds(range(0, 50));
      expect(rendered()).toEqual(range(15, 50));
      flushFrame();
      expect(rendered()).toEqual(range(0, 50));
      dispose();
    });
  });

  it('is always a subsequence of the ids in their order, and catches up with them', () => {
    createRoot((dispose) => {
      const [ids, setIds] = createSignal<string[] | undefined>(range(0, 10));
      const rendered = create(ids, 5);
      flushAll();

      const target = [...range(40, 60), ...range(0, 10), ...range(10, 40)];
      setIds(target);
      for (let guard = 0; guard < 20; guard++) {
        const current = rendered()!;
        let at = 0;
        for (const id of current) {
          at = target.indexOf(id, at);
          expect(at).toBeGreaterThanOrEqual(0);
          at++;
        }
        if (!flushFrame()) break;
      }
      expect(rendered()).toEqual(target);
      dispose();
    });
  });

  it('a reorder while rows are pending keeps the new order and the pending rows keep coming', () => {
    createRoot((dispose) => {
      const [ids, setIds] = createSignal<string[] | undefined>(range(0, 10));
      const rendered = create(ids, 5);
      flushAll();

      setIds(range(0, 30));
      expect(rendered()).toEqual(range(0, 15));

      // c14 moves to the top before the rest arrives
      setIds(['c14', ...range(0, 14), ...range(15, 30)]);
      expect(rendered()!.slice(0, 15)).toEqual(['c14', ...range(0, 14)]);
      flushAll();
      expect(rendered()).toEqual(['c14', ...range(0, 14), ...range(15, 30)]);
      dispose();
    });
  });

  it('ids that left the window while pending are never mounted', () => {
    createRoot((dispose) => {
      const [ids, setIds] = createSignal<string[] | undefined>(range(0, 10));
      const rendered = create(ids, 5);
      flushAll();

      setIds(range(0, 40));
      setIds(range(0, 12));
      flushAll();
      expect(rendered()).toEqual(range(0, 12));
      dispose();
    });
  });

  it('passes undefined through and starts over from the top after it', () => {
    createRoot((dispose) => {
      const [ids, setIds] = createSignal<string[] | undefined>(range(0, 40));
      const rendered = create(ids, 15);
      flushAll();

      setIds(undefined);
      expect(rendered()).toBeUndefined();
      setIds(range(0, 40));
      expect(rendered()).toEqual(range(0, 15));
      dispose();
    });
  });

  it('cancels the pending frame on disposal and does not tick after it', () => {
    createRoot((dispose) => {
      const [ids] = createSignal<string[] | undefined>(range(0, 40));
      const rendered = create(ids, 15);
      expect(frames.size).toBe(1);
      const before = rendered();
      dispose();
      expect(frames.size).toBe(0);
      flushAll();
      expect(rendered()).toBe(before);
    });
  });
});
