import { createMeasureEffect, requestMutation } from 'frameact';
import { type MaybeAccessor, read } from '../util/accessors';
import { depsOf } from '../util/effectDeps';

const useHorizontalScroll = (
  containerRef: MaybeAccessor<HTMLDivElement | undefined>,
  isDisabled?: MaybeAccessor<boolean | undefined>,
  shouldPreventDefault: MaybeAccessor<boolean> = false,
  shouldStopPropagation: MaybeAccessor<boolean> = false,
) => {
  createMeasureEffect(
    depsOf(
      () => [read(containerRef), read(isDisabled), read(shouldPreventDefault), read(shouldStopPropagation)] as const,
    ),
    ([containerEl, isDisabled2, shouldPreventDefault2, shouldStopPropagation2]) => {
      if (isDisabled2 || !containerEl) {
        return undefined;
      }

      const container = containerEl;

      function handleScroll(e: WheelEvent) {
        // Ignore horizontal scroll and let it work natively (e.g. on touchpad)
        if (!e.deltaX) {
          const { scrollLeft, scrollWidth, clientWidth } = container;
          const scrollRange = scrollWidth - clientWidth;
          const minScrollLeft = getComputedStyle(container).direction === 'rtl' ? -scrollRange : 0;
          const maxScrollLeft = minScrollLeft + scrollRange;
          if (!e.deltaY || (e.deltaY < 0 ? scrollLeft <= minScrollLeft : scrollLeft >= maxScrollLeft)) return;

          requestMutation(() => container.scrollBy({ left: e.deltaY / 4, behavior: 'instant' }));
          if (shouldPreventDefault2) e.preventDefault();
          if (shouldStopPropagation2) e.stopPropagation();
        }
      }

      container.addEventListener('wheel', handleScroll, { passive: !shouldPreventDefault2 });

      return () => {
        container.removeEventListener('wheel', handleScroll);
      };
    },
  );
};

export default useHorizontalScroll;
