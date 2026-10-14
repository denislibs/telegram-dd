import { requestMeasure, requestMutation } from 'frameact';

import type { MoveOffsets } from './captureEvents';

import { waitForAnimationEnd } from '../lib/kit/animationEnd';
import { IS_IOS } from './browser/windowEnvironment';
import { animateNumber, timingFunctions } from './animation';
import { captureEvents, SwipeDirection } from './captureEvents';
import { clamp } from './math';

const INERTIA_DURATION = 300;
const INERTIA_EASING = timingFunctions.easeOutCubic;

let isSwipeActive = false;
let swipeOffsets: MoveOffsets | undefined;
let onDrag: ((offsets: MoveOffsets) => void) | undefined;
let onRelease: ((onCancel: NoneToVoidFunction) => void) | undefined;
let cancelCurrentReleaseAnimation: NoneToVoidFunction | undefined;

export function captureControlledSwipe(
  element: HTMLElement, options: {
    excludedClosestSelector?: string;
    selectorToPreventScroll?: string;
    onSwipeLeftStart?: NoneToVoidFunction;
    onSwipeRightStart?: NoneToVoidFunction;
    onCancel: NoneToVoidFunction;
  },
) {
  return captureEvents(element, {
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
        swipeOffsets = offsets;
      }

      return true;
    },

    onDrag(e, captureEvent, offsets) {
      if (!isSwipeActive) return;

      onDrag?.(offsets);
    },

    onRelease() {
      if (!isSwipeActive) return;

      isSwipeActive = false;

      onRelease?.(options.onCancel);

      onDrag = undefined;
      onRelease = undefined;
    },
  });
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

  currentSlide.getAnimations().forEach((a) => a.pause());
  nextSlide.getAnimations().forEach((a) => a.pause());

  currentSlide.style.animationTimingFunction = 'linear';
  nextSlide.style.animationTimingFunction = 'linear';

  let currentDirection: 1 | -1 | undefined;
  let isDisposed = false;
  let ownOnDrag: typeof onDrag;
  let ownOnRelease: typeof onRelease;
  let ownCancelReleaseAnimation: NoneToVoidFunction | undefined;

  function cleanup() {
    currentSlide.getAnimations().forEach((a) => a.cancel());
    nextSlide.getAnimations().forEach((a) => a.cancel());

    requestMutation(() => {
      currentSlide.style.animationTimingFunction = '';
      nextSlide.style.animationTimingFunction = '';
    });
  }

  requestMeasure(() => {
    if (isDisposed) return;

    if (!isSwipeActive) {
      // Deviation: the finger was lifted before this measure ran, so nothing would ever resume the paused animations.
      currentSlide.getAnimations().forEach((a) => a.play());
      nextSlide.getAnimations().forEach((a) => a.play());
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
      currentDirection = newProgress > progress ? 1 : -1;
      progress = newProgress;

      updateAnimationProgress([currentSlide, nextSlide], progress);
    };
    onDrag = ownOnDrag;

    ownOnRelease = (onCancelForClient: NoneToVoidFunction) => {
      const isRevertSwipe = currentDirection === -1;

      options?.onRelease?.();

      if (!isRevertSwipe) {
        // For some reason animations are not cleared when CSS class is removed
        waitForAnimationEnd(currentSlide, cleanup);
      }

      ownCancelReleaseAnimation = cancelCurrentReleaseAnimation = animateNumber({
        from: progress,
        to: isRevertSwipe ? 0 : 1,
        duration: INERTIA_DURATION,
        timing: INERTIA_EASING,
        onUpdate(releaseProgress) {
          updateAnimationProgress([currentSlide, nextSlide], releaseProgress);
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

      if (onDrag === ownOnDrag) onDrag = undefined;
      if (onRelease === ownOnRelease) onRelease = undefined;
      if (ownCancelReleaseAnimation && cancelCurrentReleaseAnimation === ownCancelReleaseAnimation) {
        cancelCurrentReleaseAnimation = undefined;
        ownCancelReleaseAnimation();
      }
    },
  };
}

function updateAnimationProgress(elements: HTMLElement[], progress: number) {
  elements.map((e) => e.getAnimations()).flat().forEach((animation) => {
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
