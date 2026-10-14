import { createMeasureEffect, requestMutation } from 'frameact';
import { depsOf } from '../util/effectDeps';

// TODO(codemod): useHorizontalScroll: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
const useHorizontalScroll = (
  containerRef: (el: HTMLDivElement) => void,
  isDisabled?: boolean,
  shouldPreventDefault = false,
  shouldStopPropagation = false,
) => {
  createMeasureEffect(
    depsOf(() => [containerRef, isDisabled, shouldPreventDefault, shouldStopPropagation]),
    () => {
      if (isDisabled) {
        return undefined;
      }

      const container = containerRef.current!;

      function handleScroll(e: WheelEvent) {
        // Ignore horizontal scroll and let it work natively (e.g. on touchpad)
        if (!e.deltaX) {
          const { scrollLeft, scrollWidth, clientWidth } = container;
          const scrollRange = scrollWidth - clientWidth;
          const minScrollLeft = getComputedStyle(container).direction === 'rtl' ? -scrollRange : 0;
          const maxScrollLeft = minScrollLeft + scrollRange;
          if (!e.deltaY || (e.deltaY < 0 ? scrollLeft <= minScrollLeft : scrollLeft >= maxScrollLeft)) return;

          requestMutation(() => container.scrollBy({ left: e.deltaY / 4, behavior: 'instant' }));
          if (shouldPreventDefault) e.preventDefault();
          if (shouldStopPropagation) e.stopPropagation();
        }
      }

      container.addEventListener('wheel', handleScroll, { passive: !shouldPreventDefault });

      return () => {
        container.removeEventListener('wheel', handleScroll);
      };
    },
  );
};

export default useHorizontalScroll;
