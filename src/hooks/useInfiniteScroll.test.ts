// Original test (not in telegram-tt): the viewport window of `useInfiniteScroll` over a growing list (the chat list).
import { createRoot, createSignal } from 'frameact';
import { describe, expect, it, vi } from 'vitest';

import { LoadMoreDirection } from '../types';

import useInfiniteScroll from './useInfiniteScroll';

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => String(from + i));

describe('useInfiniteScroll', () => {
  it('starts at the top of the list with one slice', () => {
    createRoot((dispose) => {
      const [ids] = createSignal(range(0, 100));
      const [viewportIds, , offset] = useInfiniteScroll(undefined, ids, false, 30);

      expect(viewportIds()).toEqual(range(0, 30));
      expect(offset()).toBe(0);
      dispose();
    });
  });

  it('keeps the window on top while chats are added above (the new chat stays first)', () => {
    createRoot((dispose) => {
      const [ids, setIds] = createSignal(range(10, 50));
      const [viewportIds] = useInfiniteScroll(undefined, ids, false, 30);
      expect(viewportIds()).toHaveLength(30);

      setIds([...range(0, 10), ...range(10, 50)]);
      expect(viewportIds()![0]).toBe('0');
      expect(viewportIds()).toHaveLength(30);
      dispose();
    });
  });

  it('getMore backwards slides the window towards the end, forwards back to the start', () => {
    createRoot((dispose) => {
      const [ids] = createSignal(range(0, 100));
      const [viewportIds, getMore] = useInfiniteScroll(undefined, ids, false, 30);

      getMore({ direction: LoadMoreDirection.Backwards });
      expect(viewportIds()!.length).toBeGreaterThan(30);
      expect(viewportIds()![viewportIds()!.length - 1]).toBe('59');

      getMore({ direction: LoadMoreDirection.Backwards });
      expect(viewportIds()![viewportIds()!.length - 1]).toBe('89');
      dispose();
    });
  });

  it('asks the loader for more when the window reaches the end of a short list', () => {
    createRoot((dispose) => {
      const loadMore = vi.fn();
      const [ids] = createSignal(range(0, 20));
      const [, getMore] = useInfiniteScroll(loadMore, ids, false, 30);

      getMore({ direction: LoadMoreDirection.Backwards });
      expect(loadMore).toHaveBeenCalledWith({ offsetId: '19' });
      dispose();
    });
  });

  it('is inert while disabled', () => {
    createRoot((dispose) => {
      const loadMore = vi.fn();
      const [ids] = createSignal(range(0, 100));
      const [viewportIds, getMore] = useInfiniteScroll(loadMore, ids, true, 30);

      getMore({ direction: LoadMoreDirection.Backwards });
      expect(loadMore).not.toHaveBeenCalled();
      expect(viewportIds()).toEqual(range(0, 100));
      dispose();
    });
  });

  it('getMore forwards slides the window back towards the start', () => {
    createRoot((dispose) => {
      const [ids] = createSignal(range(0, 200));
      const [viewportIds, getMore] = useInfiniteScroll(undefined, ids, false, 30);

      getMore({ direction: LoadMoreDirection.Backwards });
      getMore({ direction: LoadMoreDirection.Backwards });
      getMore({ direction: LoadMoreDirection.Backwards });
      expect(viewportIds()![0]).not.toBe('0');
      const last = viewportIds()![viewportIds()!.length - 1];

      getMore({ direction: LoadMoreDirection.Forwards });
      getMore({ direction: LoadMoreDirection.Forwards });
      getMore({ direction: LoadMoreDirection.Forwards });
      expect(viewportIds()![0]).toBe('0');
      expect(viewportIds()![viewportIds()!.length - 1]).not.toBe(last);
      dispose();
    });
  });

  it('keeps the identity of the window array while the slice is unchanged (ManualFor and the kit scroll rely on it)', () => {
    createRoot((dispose) => {
      const [ids, setIds] = createSignal(range(0, 100));
      const [viewportIds] = useInfiniteScroll(undefined, ids, false, 30);
      const first = viewportIds();

      // a new list array with the same content in the window: the same window array
      setIds([...range(0, 100)]);
      expect(viewportIds()).toBe(first);

      // a change inside the window: a new array
      setIds(['x', ...range(1, 100)]);
      expect(viewportIds()).not.toBe(first);
      dispose();
    });
  });

  it('a scroll-driven load (noScroll false) anchors the next slice at the requested id', () => {
    createRoot((dispose) => {
      const loadMore = vi.fn();
      const [ids, setIds] = createSignal(range(0, 30));
      const [viewportIds, getMore] = useInfiniteScroll(loadMore, ids, false, 30);

      // the window ends with the list: more must come from the server, anchored at the last id
      getMore({ direction: LoadMoreDirection.Backwards, noScroll: false });
      expect(loadMore).toHaveBeenCalledWith({ offsetId: '29' });

      // the server answered with more chats: the window follows the request (towards the new ids) instead of jumping to the top
      setIds(range(0, 90));
      expect(viewportIds()!.includes('59')).toBe(true);
      dispose();
    });
  });
});
