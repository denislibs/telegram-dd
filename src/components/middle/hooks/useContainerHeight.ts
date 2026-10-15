import { createEffect, createSignal, requestMutation } from 'frameact';

import { type MaybeAccessor, read } from '../../../util/accessors';
import { depsOf } from '../../../util/effectDeps';

import useResizeObserver from '../../../hooks/useResizeObserver';

// Deviation: `containerRef` is an accessor of the element, `isComposerVisible` a `MaybeAccessor`; the height is an accessor
// (tt: a `Signal`) and the previous height is a `{ current }` box that the caller owns, as in tt.
export default function useContainerHeight(
  containerRef: () => HTMLDivElement | undefined,
  isComposerVisible: MaybeAccessor<boolean>,
) {
  const [getContainerHeight, setContainerHeight] = createSignal<number | undefined>(undefined);

  // Container resize observer (caused by Composer reply/webpage panels)
  const handleResize = (entry: ResizeObserverEntry) => {
    setContainerHeight(entry.contentRect.height);
  };

  useResizeObserver(containerRef, handleResize);

  createEffect(
    depsOf(() => [read(isComposerVisible), getContainerHeight()] as const),
    ([isComposerVisible2, containerHeight]) => {
      const container = containerRef();
      if (!container) return;

      const currentNormalHeight = Number(container.dataset.normalHeight) || 0;

      if (containerHeight && containerHeight > currentNormalHeight && isComposerVisible2) {
        requestMutation(() => {
          container.dataset.normalHeight = String(containerHeight);
        });
      }
    },
  );

  const prevContainerHeightRef: { current: number | undefined } = { current: undefined };

  return [getContainerHeight, prevContainerHeightRef] as const;
}
