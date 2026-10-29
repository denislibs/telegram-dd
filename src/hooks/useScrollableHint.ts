import { createMutationEffect, createSignal, onCleanup, onMount, requestMeasure, requestMutation } from 'frameact';
import { addExtraClass, removeExtraClass, setExtraStyles } from 'frameact/dom';

import { type MaybeAccessor, read } from '../util/accessors';
import { depsOf } from '../util/effectDeps';
import useResizeObserver from './useResizeObserver';
import useThrottledCallback from './useThrottledCallback';

type ScrollableHintState = {
  canScrollTop: boolean;
  canScrollBottom: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
};

type Options = {
  threshold?: MaybeAccessor<number | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  shouldSkipOverflowCheck?: MaybeAccessor<boolean | undefined>;
};

const DEFAULT_THRESHOLD = 1;
const UPDATE_THROTTLE = 100;
const HINT_MASK_SIZE = 'var(--scrollable-hint-mask-size)';
const SCROLLABLE_HINT_CLASS_NAME = 'with-scrollable-hint';
const SCROLLABLE_OVERFLOW_VALUES = new Set(['auto', 'overlay', 'scroll']);

// Deviation: a hook runs once. `containerRef` is an accessor of the element (`() => scroller`) and the options are values or
// accessors. The container is read once the component is mounted (a `let` element ref is assigned when the JSX is created,
// after this hook ran; tt read `ref.current` in a layout effect after the commit).
export default function useScrollableHint(
  containerRef: MaybeAccessor<HTMLElement | undefined>,
  { threshold, isDisabled = false, shouldSkipOverflowCheck }: Options = {},
) {
  const [isMounted, setIsMounted] = createSignal(false);
  onMount(() => {
    setIsMounted(true);
  });

  // Deviation: the throttle's trailing call fires up to 100 ms after the last one, so it can outlive the component (tt has the
  // same timer): it skips the work once the owner is disposed (it used to schedule a frame for a removed element, and after a
  // test's environment was torn down that threw on the missing `requestAnimationFrame`).
  let isDisposed = false;
  onCleanup(() => {
    isDisposed = true;
  });

  const getThreshold = () => read(threshold) ?? DEFAULT_THRESHOLD;

  const applyScrollableHintThrottled = useThrottledCallback(
    (element: HTMLElement) => {
      if (isDisposed) return;

      requestMeasure(() => {
        const state = measureScrollableHint(element, getThreshold(), read(shouldSkipOverflowCheck));

        requestMutation(() => {
          applyScrollableHint(element, state);
        });
      });
    },
    [],
    UPDATE_THROTTLE,
  );

  const updateScrollableHint = (element = read(containerRef)) => {
    if (!element || read(isDisabled)) {
      return;
    }

    applyScrollableHintThrottled(element);
  };

  const handleScroll = (event: Event) => {
    const element = event.currentTarget instanceof HTMLElement ? event.currentTarget : read(containerRef);
    updateScrollableHint(element);
  };

  useResizeObserver(containerRef, () => updateScrollableHint(), isDisabled);

  createMutationEffect(
    depsOf(() => [isMounted() ? read(containerRef) : undefined, read(isDisabled), getThreshold()] as const),
    ([element, isDisabled2]) => {
      if (!element) {
        return undefined;
      }

      if (isDisabled2) {
        requestMutation(() => clearScrollableHint(element));
        return undefined;
      }

      updateScrollableHint(element);
      element.addEventListener('scroll', handleScroll, { passive: true });

      return () => {
        element.removeEventListener('scroll', handleScroll);
        requestMutation(() => clearScrollableHint(element));
      };
    },
  );

  return { handleScroll, updateScrollableHint };
}

function measureScrollableHint(
  element: HTMLElement,
  threshold: number,
  shouldSkipOverflowCheck?: boolean,
): ScrollableHintState {
  const style = getComputedStyle(element);

  return {
    ...measureVerticalScrollableHint(element, threshold, style, shouldSkipOverflowCheck),
    ...measureHorizontalScrollableHint(element, threshold, style, shouldSkipOverflowCheck),
  };
}

function measureVerticalScrollableHint(
  element: HTMLElement,
  threshold: number,
  style: CSSStyleDeclaration,
  shouldSkipOverflowCheck?: boolean,
): Pick<ScrollableHintState, 'canScrollTop' | 'canScrollBottom'> {
  if (!shouldSkipOverflowCheck && !isScrollableOverflow(style.overflowY)) {
    return {
      canScrollTop: false,
      canScrollBottom: false,
    };
  }

  const maxScrollTop = element.scrollHeight - element.clientHeight;
  if (maxScrollTop <= threshold) {
    return {
      canScrollTop: false,
      canScrollBottom: false,
    };
  }

  return {
    canScrollTop: element.scrollTop > threshold,
    canScrollBottom: maxScrollTop - element.scrollTop > threshold,
  };
}

function measureHorizontalScrollableHint(
  element: HTMLElement,
  threshold: number,
  style: CSSStyleDeclaration,
  shouldSkipOverflowCheck?: boolean,
): Pick<ScrollableHintState, 'canScrollLeft' | 'canScrollRight'> {
  if (!shouldSkipOverflowCheck && !isScrollableOverflow(style.overflowX)) {
    return {
      canScrollLeft: false,
      canScrollRight: false,
    };
  }

  const maxScrollLeft = element.scrollWidth - element.clientWidth;
  if (maxScrollLeft <= threshold) {
    return {
      canScrollLeft: false,
      canScrollRight: false,
    };
  }

  const { scrollLeft } = element;
  const isRtl = style.direction === 'rtl';

  if (!isRtl) {
    return {
      canScrollLeft: scrollLeft > threshold,
      canScrollRight: maxScrollLeft - scrollLeft > threshold,
    };
  }

  if (scrollLeft < 0) {
    const absoluteScrollLeft = Math.abs(scrollLeft);

    return {
      canScrollLeft: maxScrollLeft - absoluteScrollLeft > threshold,
      canScrollRight: absoluteScrollLeft > threshold,
    };
  }

  return {
    canScrollLeft: scrollLeft > threshold,
    canScrollRight: maxScrollLeft - scrollLeft > threshold,
  };
}

function applyScrollableHint(element: HTMLElement, state: ScrollableHintState) {
  addExtraClass(element, SCROLLABLE_HINT_CLASS_NAME);
  setExtraStyles(element, {
    '--scrollable-hint-bottom-mask-outset': buildEdgeOutset(state.canScrollBottom),
    '--scrollable-hint-left-mask-outset': buildEdgeOutset(state.canScrollLeft),
    '--scrollable-hint-right-mask-outset': buildEdgeOutset(state.canScrollRight),
    '--scrollable-hint-top-mask-outset': buildEdgeOutset(state.canScrollTop),
  });
}

function clearScrollableHint(element: HTMLElement) {
  removeExtraClass(element, SCROLLABLE_HINT_CLASS_NAME);
  setExtraStyles(element, {
    '--scrollable-hint-bottom-mask-outset': '',
    '--scrollable-hint-left-mask-outset': '',
    '--scrollable-hint-right-mask-outset': '',
    '--scrollable-hint-top-mask-outset': '',
  });
}

function buildEdgeOutset(canScroll: boolean) {
  return canScroll ? '0px' : HINT_MASK_SIZE;
}

function isScrollableOverflow(overflow: string) {
  return SCROLLABLE_OVERFLOW_VALUES.has(overflow);
}
