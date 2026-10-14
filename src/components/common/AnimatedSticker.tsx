import {
  createEffect,
  createMemo,
  createSignal,
  getIsHeavyAnimating,
  onDestroy,
  requestMeasure,
  watchHeavyAnimation,
} from 'frameact';
import { Show } from 'frameact/dom';

import type TLottieInstance from '../../lib/tlottie/TLottie';
import type { EmojiFitzModifier } from '../../util/emoji/skinTone';

import { buildColor, type Color } from '../../lib/color';
import { ensureTLottie, getTLottie } from '../../lib/tlottie/TLottie.async';
import { IS_TAURI } from '../../util/browser/globalEnvironment';
import buildClassName from '../../util/buildClassName';
import buildStyle from '../../util/buildStyle';
import generateUniqueId from '../../util/generateUniqueId';

import useColorFilter from '../../hooks/stickers/useColorFilter';
import useFlag from '../../hooks/useFlag';
import usePriorityPlaybackCheck, { isPriorityPlaybackActive } from '../../hooks/usePriorityPlaybackCheck';
import useSharedIntersectionObserver from '../../hooks/useSharedIntersectionObserver';
import { useStateRef } from '../../hooks/useStateRef';
import useThrottledCallback from '../../hooks/useThrottledCallback';
import useUniqueId from '../../hooks/useUniqueId';
import useBackgroundMode, { isBackgroundModeActive } from '../../hooks/window/useBackgroundMode';

export type OwnProps = {
  ref?: (el: HTMLDivElement) => void;
  renderId?: string;
  className?: string;
  style?: string;
  tgsUrl?: string;
  play?: boolean | string;
  playSegment?: [number, number];
  seekToEnd?: boolean;
  speed?: number;
  noLoop?: boolean;
  size: number;
  quality?: number;
  color?: string;
  fitzModifier?: EmojiFitzModifier;
  isLowPriority?: boolean;
  forceAlways?: boolean;
  forceOnHeavyAnimation?: boolean;
  sharedCanvas?: HTMLCanvasElement;
  sharedCanvasCoords?: { x: number; y: number };
  onClick?: NoneToVoidFunction;
  onMouseEnter?: NoneToVoidFunction;
  onMouseLeave?: NoneToVoidFunction;
  onLoad?: NoneToVoidFunction;
  onEnded?: NoneToVoidFunction;
  onLoop?: NoneToVoidFunction;
  onFrame?: (index: number) => void;
};

const THROTTLE_MS = 150;

const AnimatedSticker = (props: OwnProps) => {
  let containerRef!: HTMLDivElement;
  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (props.ref) {
    // TODO(codemod): "containerRef" was a ref object and is reassigned here (a forwarded ref?): use a callback ref
    containerRef = props.ref;
  }

  const viewId = useUniqueId();
  const rendererId = createMemo(() =>
    props.renderId && props.fitzModifier ? `${props.renderId}_${props.fitzModifier}` : props.renderId,
  );

  const [animation, setAnimation] = createSignal<TLottieInstance | undefined>(undefined);
  let animationRef: TLottieInstance | undefined;
  let isFirstRenderRef = true;

  const shouldUseColorFilter = createMemo(() => !props.sharedCanvas && props.color);
  const colorFilter = useColorFilter(() => (shouldUseColorFilter() ? props.color : undefined));

  const playKey = createMemo(() => props.play || (props.play === false ? false : props.playSegment));
  // TODO(codemod): useStateRef: a handler reads the current value through the accessor; replace ref.current with the accessor call
  const playRef = useStateRef(props.play);
  // TODO(codemod): useStateRef: a handler reads the current value through the accessor; replace ref.current with the accessor call
  const playSegmentRef = useStateRef(props.playSegment);

  let colorRef: Color | undefined;

  const shouldForceOnHeavyAnimation = createMemo(() => props.forceAlways || props.forceOnHeavyAnimation);
  // Delay initialization until heavy animation ends
  const [canInitialize, markCanInitialize, unmarkCanInitialize] = useFlag(
    !getIsHeavyAnimating() || shouldForceOnHeavyAnimation(),
  );
  // TODO(codemod): useHeavyAnimation(…, isDisabled): watchHeavyAnimation has no disable flag; guard inside the callbacks
  watchHeavyAnimation(unmarkCanInitialize, markCanInitialize);
  createEffect(
    () => shouldForceOnHeavyAnimation(),
    (shouldForceOnHeavyAnimation) => {
      if (shouldForceOnHeavyAnimation) markCanInitialize();
    },
  );

  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(
    () => [props.color, shouldUseColorFilter()],
    ([, shouldUseColorFilter]) => {
      if (props.color && !shouldUseColorFilter) {
        colorRef = buildColor(props.color);
      } else {
        colorRef = undefined;
      }
    },
  );

  let isUnmountedRef = false;
  onDestroy(() => {
    isUnmountedRef = true;
  });

  const init = () => {
    if (
      animationRef ||
      isUnmountedRef ||
      !props.tgsUrl ||
      (props.sharedCanvas &&
        (!props.sharedCanvasCoords || !props.sharedCanvas.offsetWidth || !props.sharedCanvas.offsetHeight)) ||
      (getIsHeavyAnimating() && !shouldForceOnHeavyAnimation())
    ) {
      return;
    }

    const container = containerRef || props.sharedCanvas;
    if (!container) {
      return;
    }

    const TLottie = getTLottie();
    if (!TLottie) {
      return;
    }

    const newAnimation = TLottie.init(
      props.tgsUrl,
      container,
      rendererId() || generateUniqueId(),
      {
        size: props.size,
        noLoop: props.noLoop,
        quality: props.quality,
        isLowPriority: props.isLowPriority,
        coords: props.sharedCanvasCoords,
        fitzModifier: props.fitzModifier,
      },
      viewId,
      colorRef,
      props.onLoad,
      props.onEnded,
      props.onLoop,
      props.onFrame,
    );

    if (props.speed) {
      newAnimation.setSpeed(props.speed);
    }

    if (props.seekToEnd) {
      newAnimation.seekToEnd();
    }

    setAnimation(newAnimation);
    animationRef = newAnimation;
  };

  // TODO(codemod): dependency on a container (sharedCanvasCoords) keeps its identity while its content changes: track the fields the effect reads instead (store contract §12.7)
  createEffect(
    () => [init, props.tgsUrl, props.sharedCanvas, props.sharedCanvasCoords, canInitialize()],
    ([init, , , , canInitialize]) => {
      if (!canInitialize) return;
      if (getTLottie()) {
        init();
      } else {
        ensureTLottie().then(init);
      }
    },
  );

  const throttledInit = useThrottledCallback(init, [init], THROTTLE_MS);
  useSharedIntersectionObserver(() => props.sharedCanvas, throttledInit);

  createEffect(
    () => [props.color, animation()],
    ([, animation]) => {
      animation?.setColor(colorRef);
    },
  );

  createEffect(
    () => [props.speed, animation()],
    ([, animation]) => {
      if (typeof props.speed === 'number') {
        animation?.setSpeed(props.speed);
      }
    },
  );

  onDestroy(() => {
    animationRef?.removeView(viewId);
  });

  const playAnimation = (shouldRestart = false) => {
    if (
      !animation() ||
      !(playRef.current || playSegmentRef.current) ||
      isFrozen(props.forceAlways, props.forceOnHeavyAnimation)
    ) {
      return;
    }

    if (playSegmentRef.current) {
      animation().playSegment(playSegmentRef.current, shouldRestart, viewId);
    } else if (props.seekToEnd) {
      animation().seekToEnd();
    } else {
      animation().play(shouldRestart, viewId);
    }
  };

  const playAnimationOnRaf = () => {
    requestMeasure(playAnimation);
  };

  const pauseAnimation = () => {
    if (animation()?.isPlaying()) {
      animation().pause(viewId);
    }
  };

  createEffect(
    () => [props.noLoop, animation()],
    (_deps, prev) => {
      const [prevNoLoop] = prev ?? [];
      if (prevNoLoop !== undefined && props.noLoop !== prevNoLoop) {
        animation()?.setNoLoop(props.noLoop);
      }
    },
  );

  // TODO(codemod): dependency on a container (sharedCanvasCoords) keeps its identity while its content changes: track the fields the effect reads instead (store contract §12.7)
  createEffect(
    () => [props.sharedCanvasCoords, viewId, animation()],
    (_deps, prev) => {
      const [prevSharedCanvasCoords] = prev ?? [];
      if (prevSharedCanvasCoords !== undefined && props.sharedCanvasCoords !== prevSharedCanvasCoords) {
        animation()?.setSharedCanvasCoords(viewId, props.sharedCanvasCoords);
      }
    },
  );

  createEffect(
    () => [
      animation(),
      playKey(),
      props.noLoop,
      playAnimation,
      pauseAnimation,
      props.forceAlways,
      props.forceOnHeavyAnimation,
    ],
    ([animation, playKey]) => {
      if (!animation) {
        return;
      }

      if (playKey) {
        if (!isFrozen(props.forceAlways, props.forceOnHeavyAnimation)) {
          playAnimation(props.noLoop);
        }
      } else {
        pauseAnimation();
      }
    },
  );

  createEffect(
    () => [playAnimation, animation(), props.tgsUrl, props.fitzModifier],
    ([, animation]) => {
      if (animation) {
        if (isFirstRenderRef) {
          isFirstRenderRef = false;
        } else if (props.tgsUrl) {
          animation.changeData(props.tgsUrl, props.fitzModifier);
          playAnimation();
        }
      }
    },
  );

  // TODO(codemod): useHeavyAnimation(…, isDisabled): watchHeavyAnimation has no disable flag; guard inside the callbacks
  watchHeavyAnimation(pauseAnimation, playAnimation);
  usePriorityPlaybackCheck(pauseAnimation, playAnimation, () => !playKey() || props.forceAlways);
  // Pausing frame may not happen in background,
  // so we need to make sure it happens right after focusing,
  // then we can play again.
  useBackgroundMode(pauseAnimation, playAnimationOnRaf, () => !playKey() || props.forceAlways);

  return (
    <Show when={!props.sharedCanvas}>
      <div
        ref={containerRef}
        class={buildClassName('AnimatedSticker', props.className)}
        style={buildStyle(
          props.size !== undefined && `width: ${props.size}px; height: ${props.size}px;`,
          props.onClick && !IS_TAURI && 'cursor: pointer',
          colorFilter,
          props.style,
        )}
        onClick={props.onClick}
        onMouseEnter={props.onMouseEnter}
        onMouseLeave={props.onMouseLeave}
      />
    </Show>
  );
};

export default AnimatedSticker;

function isFrozen(forceAlways = false, forceOnHeavyAnimation = false) {
  if (forceAlways) return false;
  return (!forceOnHeavyAnimation && getIsHeavyAnimating()) || isPriorityPlaybackActive() || isBackgroundModeActive();
}
