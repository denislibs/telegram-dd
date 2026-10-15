import { createEffect, createSignal, requestMutation } from 'frameact';

import { type MaybeAccessor, read } from '../../util/accessors';
import { depsOf } from '../../util/effectDeps';
import stopEvent from '../../util/stopEvent';

type State = 'overscroll' | 'animating' | 'normal';

type ActiveScrollContext = {
  lastDeltas: number[];
  lastAverageDelta: number;
  isStartedAtTop: boolean;
  resetStartTopAt?: number;
  timeout: number | undefined;
};

const LAST_DELTA_COUNT = 7;
const ACTIVE_SCROLL_RESET_TIMEOUT = 100;
const NEW_INPUT_DELTA_THRESHOLD = 7;
const OVERSCROLL_CONTAINER_CLASS = 'no-overscroll';
const NO_TOUCH_CONTAINER_CLASS = 'no-touch';
const TRANSITION_DURATION = 350;
const DRAG_TRIGGER_DISTANCE = 75;

const initialActiveScrollContext: ActiveScrollContext = {
  lastDeltas: new Array(LAST_DELTA_COUNT).fill(0),
  lastAverageDelta: 0,
  isStartedAtTop: false,
  resetStartTopAt: undefined,
  timeout: undefined,
};

// Deviation: a hook runs once. `containerRef`, `isOverscrolled` and `isDisabled` are `MaybeAccessor`s; the container is
// read when an effect applies or an event fires (not tracked), and `onOverscroll` / `onReset` are read once.
export default function useTopOverscroll({
  containerRef,
  isOverscrolled,
  isDisabled,
  onOverscroll,
  onReset,
}: {
  containerRef: MaybeAccessor<HTMLDivElement | undefined>;
  isOverscrolled?: MaybeAccessor<boolean | undefined>;
  onOverscroll?: AnyToVoidFunction;
  onReset?: AnyToVoidFunction;
  isDisabled?: MaybeAccessor<boolean | undefined>;
}) {
  const [getState, setState] = createSignal<State>('normal');
  let activeScrollRef: ActiveScrollContext = { ...initialActiveScrollContext };
  let transitionTimeoutRef: number | undefined;
  let touchStartYRef: number | undefined;

  const triggerOverscroll = () => {
    clearTimeout(transitionTimeoutRef);
    setState('overscroll');
    onOverscroll?.();
  };

  const triggerReset = () => {
    setState('animating');
    transitionTimeoutRef = window.setTimeout(() => {
      setState('normal');
    }, TRANSITION_DURATION);
    onReset?.();
  };

  const scheduleResetActiveScroll = (timeout: number) => {
    clearTimeout(activeScrollRef.timeout);
    activeScrollRef.timeout = window.setTimeout(() => {
      activeScrollRef = { ...initialActiveScrollContext };
    }, timeout);
  };

  const handleWheel = (e: WheelEvent) => {
    const container = read(containerRef);
    if (!container || e.defaultPrevented) {
      return;
    }

    const { deltaY } = e;
    const { scrollTop } = container;
    const state = getState();

    const activeScroll = activeScrollRef;
    const lastAverageDelta = activeScroll.lastAverageDelta;

    const isStarting =
      activeScroll.lastDeltas.at(-1) === 0 ||
      (activeScroll.resetStartTopAt && Date.now() >= activeScroll.resetStartTopAt);
    if (scrollTop === 0 && isStarting) {
      activeScroll.isStartedAtTop = true;
      activeScroll.resetStartTopAt = undefined;
    }

    const lastDeltas = activeScrollRef.lastDeltas.slice(); // Copy
    lastDeltas.push(deltaY);
    if (lastDeltas.length > LAST_DELTA_COUNT) {
      lastDeltas.shift();
    }
    activeScrollRef.lastDeltas = lastDeltas;
    const currentAverageDelta = lastDeltas.reduce((a, b) => a + b, 0) / lastDeltas.length;
    activeScrollRef.lastAverageDelta = currentAverageDelta;

    const isNewInput = Math.abs(currentAverageDelta) - Math.abs(lastAverageDelta) > NEW_INPUT_DELTA_THRESHOLD;

    scheduleResetActiveScroll(ACTIVE_SCROLL_RESET_TIMEOUT);

    // If we're at the top and scrolling up
    if (scrollTop === 0 && deltaY < 0 && state !== 'overscroll') {
      if (!activeScroll.resetStartTopAt) {
        // Schedule delta reset, so we would respond to new input with `isStartedAtTop` flag set
        activeScroll.resetStartTopAt = Date.now() + ACTIVE_SCROLL_RESET_TIMEOUT;
      }

      // Only trigger overscroll on new input, ignore momentum events
      if (isNewInput && activeScroll.isStartedAtTop) {
        triggerOverscroll();
      }
      return;
    }

    // Ignore scroll events during collapse animation
    if (state === 'animating' && deltaY > 0) {
      stopEvent(e);
      return;
    }

    // If we're overscrolled, any down wheel event should reset
    if (state === 'overscroll' && deltaY > 0) {
      triggerReset();
      stopEvent(e);
      return;
    }
  };

  const handleTouchStart = (e: TouchEvent) => {
    const container = read(containerRef);
    if (!container || e.touches.length !== 1) return;

    const { scrollTop } = container;
    const state = getState();

    // Register touch start position when at top or in overscroll state
    if (scrollTop === 0 || state === 'overscroll') {
      touchStartYRef = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    const container = read(containerRef);
    const startY = touchStartYRef;
    if (!container || startY === undefined || e.touches.length !== 1) return;

    const { scrollTop } = container;
    const state = getState();
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;

    if (state === 'animating') {
      return;
    }

    // If we're at the top and dragging down by more than trigger distance
    if (scrollTop === 0 && deltaY > DRAG_TRIGGER_DISTANCE && state !== 'overscroll') {
      triggerOverscroll();
      touchStartYRef = undefined; // Reset to prevent multiple triggers
      return;
    }

    // If we're overscrolled and dragging up by more than trigger distance, reset
    if (state === 'overscroll' && deltaY < -DRAG_TRIGGER_DISTANCE) {
      triggerReset();
      touchStartYRef = undefined; // Reset to prevent multiple triggers
      return;
    }
  };

  const handleTouchEnd = () => {
    touchStartYRef = undefined;
  };

  createEffect(
    () => read(isDisabled),
    (isDisabled2) => {
      const container = read(containerRef);
      if (isDisabled2 || !container) return undefined;
      requestMutation(() => {
        container.classList.add(OVERSCROLL_CONTAINER_CLASS);
      });

      return () => {
        requestMutation(() => {
          container.classList.remove(OVERSCROLL_CONTAINER_CLASS);
        });
      };
    },
  );

  createEffect(
    depsOf(() => [read(isDisabled), getState()] as const),
    ([isDisabled2, state2]) => {
      const container = read(containerRef);
      if (isDisabled2 || !container) return undefined;
      requestMutation(() => {
        container.classList.toggle(NO_TOUCH_CONTAINER_CLASS, state2 !== 'normal');
      });

      return () => {
        requestMutation(() => {
          container.classList.remove(NO_TOUCH_CONTAINER_CLASS);
        });
      };
    },
  );

  // tt: `useEffectWithPrevDeps` over `[isOverscrolled, getState, setState]`; `apply` gets the previous value.
  createEffect(
    () => read(isOverscrolled),
    (isOverscrolled2, prevIsOverscrolled) => {
      if (prevIsOverscrolled === isOverscrolled2) return;
      if (!isOverscrolled2 && getState() === 'animating') {
        return; // We're animating towards this state
      }

      setState(isOverscrolled2 ? 'overscroll' : 'normal');
    },
  );

  createEffect(
    depsOf(() => [read(isDisabled), getState()] as const),
    ([isDisabled2, state2]) => {
      const container = read(containerRef);
      if (isDisabled2 || !container) {
        return undefined;
      }

      container.addEventListener('wheel', handleWheel, { passive: state2 === 'normal' });
      container.addEventListener('touchstart', handleTouchStart, { passive: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: true });
      container.addEventListener('touchend', handleTouchEnd, { passive: true });
      container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

      return () => {
        container.removeEventListener('wheel', handleWheel);
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('touchmove', handleTouchMove);
        container.removeEventListener('touchend', handleTouchEnd);
        container.removeEventListener('touchcancel', handleTouchEnd);

        const activeScroll = activeScrollRef;
        if (activeScroll?.timeout) clearTimeout(activeScroll.timeout);
      };
    },
  );
}
