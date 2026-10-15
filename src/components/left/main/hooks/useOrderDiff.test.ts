// Original test (not in telegram-tt): the order diff of the chat list lives for the render of a reorder only.
import { createRoot, createSignal } from 'frameact';
import { describe, expect, it } from 'vitest';

import useOrderDiff from './useOrderDiff';

describe('useOrderDiff', () => {
  it('a reorder produces a diff, and the next render without a reorder (a scroll) resets it', () => {
    createRoot((dispose) => {
      const [ids, setIds] = createSignal(['a', 'b', 'c', 'd']);
      const [viewport, setViewport] = createSignal(['a', 'b', 'c', 'd']);
      const { orderDiffById } = useOrderDiff(ids, () => 0, undefined, viewport);

      expect(orderDiffById()).toEqual({});

      setIds(['c', 'a', 'b', 'd']);
      setViewport(['c', 'a', 'b', 'd']);
      expect(orderDiffById()).toEqual({ a: 1, b: 1, c: -2, d: 0 });

      // the window slides, the order does not change: tt re-rendered the list and `prevOrderById === orderById`
      setViewport(['c', 'a', 'b']);
      expect(orderDiffById()).toEqual({});
      dispose();
    });
  });

  it('keeps the diff when only an unrelated read happens, and resets it when an animation ends', () => {
    createRoot((dispose) => {
      const [ids, setIds] = createSignal(['a', 'b', 'c']);
      const { orderDiffById, onReorderAnimationEnd } = useOrderDiff(ids, () => 0);
      expect(orderDiffById()).toEqual({});

      setIds(['b', 'a', 'c']);
      expect(orderDiffById()).toEqual({ a: 1, b: -1, c: 0 });
      expect(orderDiffById()).toEqual({ a: 1, b: -1, c: 0 });

      onReorderAnimationEnd();
      expect(orderDiffById()).toEqual({});
      dispose();
    });
  });
});
