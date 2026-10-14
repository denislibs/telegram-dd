import { requestMeasure, requestMutation } from 'frameact';

import type { MoveOffsets } from './captureEvents';

import { IS_IOS } from './browser/windowEnvironment';
import { captureEvents, SwipeDirection } from './captureEvents';
import { waitForAnimationEnd } from './cssAnimationEndListeners';
import { clamp } from './math';

const INERTIA_DURATION = 300;
const easeOutCubic = (t: number) => (--t) * t * t + 1; // = timingFunctions.easeOutCubic

let isSwipeActive = false;
let swipeOffsets: MoveOffsets | undefined;
let onDrag: ((offsets: MoveOffsets) => void) | undefined;
let onRelease: ((onCancel: NoneToVoidFunction, isForcedRevert?: boolean) => void) | undefined;
let cancelCurrentReleaseAnimation: NoneToVoidFunction | undefined;
// Deviation: hardening. Which swipe set the inline `animation-timing-function` of a slide: a swipe that is let go of
// resets it only if no newer swipe took the same slide over (a step that supersedes a swiped one takes it over at once).
const timingOwners = new WeakMap<HTMLElement, object>();

export function captureControlledSwipe(
  element: HTMLElement, options: {
    excludedClosestSelector?: string;
    selectorToPreventScroll?: string;
    onSwipeLeftStart?: NoneToVoidFunction;
    onSwipeRightStart?: NoneToVoidFunction;
    onCancel: NoneToVoidFunction;
  },
) {
  // Deviation: hardening. tt resets `isSwipeActive` only in the `onRelease` of captureEvents, which is not reported when
  // the finger is lifted below 15 px, when the owner is disposed mid-drag, or when the page is hidden: the flag stayed
  // set, every later step with `withSwipeControl` was taken over by a swipe that no longer existed and stayed paused.
  // Every end path now goes through `endSwipe`; the ones that are not a lift of the finger revert the gesture.
  let isOwnSwipe = false;
  let removeAbandonListeners: NoneToVoidFunction | undefined;

  function endSwipe(isForcedRevert: boolean) {
    removeAbandonListeners?.();
    removeAbandonListeners = undefined;

    if (!isOwnSwipe) return;
    isOwnSwipe = false;

    if (!isSwipeActive) return;
    isSwipeActive = false;

    onRelease?.(options.onCancel, isForcedRevert);

    onDrag = undefined;
    onRelease = undefined;
  }

  // The page goes away under a finger: no `touchend` / `touchcancel` may arrive. (Not `pointercancel`: Chromium sends it
  // when the browser takes the touch for a scroll, in the middle of a swipe that is working; `touchcancel` is the end.)
  const abandonSwipe = () => endSwipe(true);
  const abandonIfHidden = () => {
    if (document.hidden) endSwipe(true);
  };

  const stopCapturing = captureEvents(element, {
    excludedClosestSelector: options.excludedClosestSelector,
    selectorToPreventScroll: options.selectorToPreventScroll,
    swipeThreshold: 10,

    onSwipe(e, direction, offsets) {
      if (direction === SwipeDirection.Left) {
        options.onSwipeLeftStart?.();
      } else if (direction === SwipeDirection.Right) {
        options.onSwipeRightStart?.();
      } else {
        return false;
      }

      if (IS_IOS) {
        isSwipeActive = true;
        isOwnSwipe = true;
        swipeOffsets = offsets;

        if (!removeAbandonListeners) {
          document.addEventListener('visibilitychange', abandonIfHidden);
          window.addEventListener('pagehide', abandonSwipe);
          removeAbandonListeners = () => {
            document.removeEventListener('visibilitychange', abandonIfHidden);
            window.removeEventListener('pagehide', abandonSwipe);
          };
        }
      }

      return true;
    },

    onDrag(e, captureEvent, offsets) {
      if (!isSwipeActive) return;

      onDrag?.(offsets);
    },

    onRelease(e) {
      // A `touchcancel` is the system taking the touch away, not the user choosing: revert.
      endSwipe(e.type === 'touchcancel');
    },
  });

  return () => {
    stopCapturing();
    endSwipe(true);
  };
}

// Deviation: tt returns nothing. The kit's <Transition> needs to know whether the swipe took the animation over (an
// animation held by a finger must not get the 1 s end fallback, and its heavy animation is not blocking while dragged),
// to be told when the finger is released, and to let go of everything when it is disposed mid-swipe.
export interface SwipeControl {
  /** Let go of the swipe without any callback (the transition is gone): drop the drag/release hooks, stop the inertia. */
  dispose: NoneToVoidFunction;
}

export interface SwipeControlOptions {
  /** The finger was lifted (before the inertia animation starts). */
  onRelease?: NoneToVoidFunction;
}

/**
 * Hand the CSS animations of a transition that was just started to the finger of a swipe in progress (see
 * `captureControlledSwipe`): they are paused and driven by the drag offset, and on release they either run out or are
 * reverted (`onCancelForTransition`, then the swipe's own `onCancel`). Returns `undefined` when no swipe is active or the
 * slide's animation has no `translate` end position.
 *
 * Call it right after the animation classes are written (the mutate phase): it writes `animation-timing-function`.
 */
export function allowSwipeControlForTransition(
  currentSlide: HTMLElement,
  nextSlide: HTMLElement,
  onCancelForTransition: NoneToVoidFunction,
  options?: SwipeControlOptions,
): SwipeControl | undefined {
  cancelCurrentReleaseAnimation?.();

  if (!isSwipeActive) return undefined;

  const targetPosition = extractAnimationEndPosition(currentSlide);
  if (!targetPosition) return undefined;

  // Deviation: looked up once per gesture (every `getAnimations()` flushes style, and tt did it twice per move).
  const animations = [...currentSlide.getAnimations(), ...nextSlide.getAnimations()];
  animations.forEach((a) => a.pause());

  const owner = {};
  currentSlide.style.animationTimingFunction = 'linear';
  nextSlide.style.animationTimingFunction = 'linear';
  timingOwners.set(currentSlide, owner);
  timingOwners.set(nextSlide, owner);

  let currentDirection: 1 | -1 | undefined;
  let isDisposed = false;
  let ownOnDrag: typeof onDrag;
  let ownOnRelease: typeof onRelease;
  let ownCancelReleaseAnimation: NoneToVoidFunction | undefined;

  function resetTimingFunctions() {
    requestMutation(() => {
      for (const slide of [currentSlide, nextSlide]) {
        if (timingOwners.get(slide) !== owner) continue;
        timingOwners.delete(slide);
        slide.style.animationTimingFunction = '';
      }
    });
  }

  function cleanup() {
    animations.forEach((a) => a.cancel());

    resetTimingFunctions();
  }

  requestMeasure(() => {
    if (isDisposed) return;

    if (!isSwipeActive) {
      // Deviation: the finger was lifted before this measure ran, so nothing would ever resume the paused animations.
      animations.forEach((a) => a.play());
      resetTimingFunctions(); // they run with the stylesheet's easing, not the swipe's `linear`
      waitForAnimationEnd(currentSlide, cleanup);
      options?.onRelease?.();
      return;
    }

    const computedStyle = getComputedStyle(currentSlide);
    const initialPositionPx = extractPositionFromMatrix(computedStyle.transform, targetPosition.axis);
    const targetPositionPx = targetPosition.units === 'px'
      ? targetPosition.value
      : ((targetPosition.value / 100) * (
        targetPosition.axis === 'X' ? currentSlide.offsetWidth : currentSlide.offsetHeight
      ));
    const distance = targetPositionPx - initialPositionPx;

    let progress = 0;

    ownOnDrag = ({ dragOffsetX, dragOffsetY }) => {
      const dragOffset = targetPosition.axis === 'X'
        ? dragOffsetX - swipeOffsets!.dragOffsetX
        : dragOffsetY - swipeOffsets!.dragOffsetY;

      const newProgress = clamp(dragOffset / distance, 0, 1);
      // Kept as in tt (review m1): a move that brings no progress (the same x, which iOS also sends for force / radius
      // changes, or a finger past the end of the clamp) counts as a step back, so releasing right after it reverts the
      // swipe. Pinned by a test; changing it is a decision about the gesture, not a port detail.
      currentDirection = newProgress > progress ? 1 : -1;
      progress = newProgress;

      updateAnimationProgress(animations, progress);
    };
    onDrag = ownOnDrag;

    ownOnRelease = (onCancelForClient: NoneToVoidFunction, isForcedRevert = false) => {
      const isRevertSwipe = isForcedRevert || currentDirection === -1;

      options?.onRelease?.();

      if (!isRevertSwipe) {
        // For some reason animations are not cleared when CSS class is removed
        waitForAnimationEnd(currentSlide, cleanup);
      }

      ownCancelReleaseAnimation = cancelCurrentReleaseAnimation = animateInertia({
        from: progress,
        to: isRevertSwipe ? 0 : 1,
        onUpdate(releaseProgress) {
          updateAnimationProgress(animations, releaseProgress);
        },
        onEnd(isCanceled = false) {
          if (isDisposed) return;

          cancelCurrentReleaseAnimation = undefined;

          if (isCanceled || isRevertSwipe) {
            cleanup();
            onCancelForTransition();
            onCancelForClient();
          }
        },
      });
    };
    onRelease = ownOnRelease;
  });

  return {
    dispose() {
      if (isDisposed) return;
      isDisposed = true;

      // Deviation: hardening. tt had no way to let go of a swipe, and a step that supersedes a swiped one found the old
      // animations paused and the slides' `linear` timing function on for good: undo both now (the caller does it before
      // it rewrites the slides' classes, so these are still the swipe's animations).
      cleanup();

      if (onDrag === ownOnDrag) onDrag = undefined;
      if (onRelease === ownOnRelease) onRelease = undefined;
      if (ownCancelReleaseAnimation && cancelCurrentReleaseAnimation === ownCancelReleaseAnimation) {
        cancelCurrentReleaseAnimation = undefined;
        ownCancelReleaseAnimation();
      }
    },
  };
}

// Deviation: tt's `animateNumber` (util/animation) for the one number the inertia needs. Importing util/animation moved
// its 2 KB into the entry chunk of every app that merely contains the Transition. Same behaviour: the first tick is
// immediate, the next ones run in the measure phase of each frame, a cancel reports `onEnd(true)`.
function animateInertia({ from, to, onUpdate, onEnd }: {
  from: number;
  to: number;
  onUpdate: (value: number) => void;
  onEnd: (isCanceled?: boolean) => void;
}) {
  const startedAt = Date.now();
  let isFinished = false;

  function tick() {
    if (isFinished) return;

    const t = Math.min((Date.now() - startedAt) / INERTIA_DURATION, 1);
    onUpdate(from + (to - from) * easeOutCubic(t));

    if (t === 1) {
      isFinished = true;
      onEnd();
      return;
    }

    requestMeasure(tick);
  }

  tick();

  return () => {
    if (isFinished) return;
    isFinished = true;
    onEnd(true);
  };
}

function updateAnimationProgress(animations: Animation[], progress: number) {
  animations.forEach((animation) => {
    animation.currentTime = (animation.effect!.getTiming().duration as number) * progress;
  });
}

function extractAnimationEndPosition(element: HTMLElement) {
  for (const animation of element.getAnimations()) {
    if (!(animation.effect instanceof KeyframeEffect)) continue;

    for (const keyframe of animation.effect.getKeyframes()) {
      if (keyframe.offset !== 1 || !keyframe.transform) continue;

      const position = extractPositionFromTransform(keyframe.transform as string);
      if (position) {
        return position;
      }
    }
  }

  return undefined;
}

function extractPositionFromTransform(transformRule: string) {
  const match = transformRule.match(/([XY])\((-?\d+)(%|px)\)/);
  if (!match) return undefined;

  return {
    axis: match[1] as 'X' | 'Y',
    value: Number(match[2]),
    units: match[3],
  };
}

function extractPositionFromMatrix(transform: string, axis: 'X' | 'Y') {
  // Deviation: `none` (no transform yet) is position 0, and `matrix3d(` is read too (tt slices a fixed 7 characters).
  const match = transform.match(/^matrix(3d)?\((.*)\)$/);
  if (!match) return 0;

  const values = match[2].split(',').map(Number);
  return match[1] ? values[axis === 'X' ? 12 : 13] : values[axis === 'X' ? 4 : 5];
}
