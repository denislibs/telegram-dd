import { createEffect, createSignal } from 'frameact';
import { depsOf } from '../../../util/effectDeps';

import useResizeObserver from '../../../hooks/useResizeObserver';

// TODO(codemod): useContainerHeight: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useContainerHeight(containerRef: (el: HTMLDivElement) => void, isComposerVisible: boolean) {
  const [getContainerHeight, setContainerHeight] = createSignal<number | undefined>(undefined);

  // Container resize observer (caused by Composer reply/webpage panels)
  const handleResize = (entry: ResizeObserverEntry) => {
    setContainerHeight(entry.contentRect.height);
  };

  useResizeObserver(containerRef, handleResize);

  createEffect(depsOf(() => [isComposerVisible, containerRef, getContainerHeight()] as const), ([, , getContainerHeight2]) => {
    const currentNormalHeight = Number(containerRef.current!.dataset.normalHeight) || 0;
    const containerHeight = getContainerHeight2();

    if (containerHeight && containerHeight > currentNormalHeight && isComposerVisible) {
      containerRef.current!.dataset.normalHeight = String(containerHeight);
    }
  });

  let prevContainerHeightRef: number | undefined;

  // TODO(codemod): "prevContainerHeightRef" was a ref object passed as a value: pass an accessor (() => prevContainerHeightRef) or a callback ref
  return [getContainerHeight(), prevContainerHeightRef] as const;
}
