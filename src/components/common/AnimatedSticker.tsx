import {
  createEffect,
  createMeasureEffect,
  createMemo,
  createSignal,
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
import { depsOf } from '../../util/effectDeps';
import generateUniqueId from '../../util/generateUniqueId';

import useColorFilter from '../../hooks/stickers/useColorFilter';
import useFlag from '../../hooks/useFlag';
import usePriorityPlaybackCheck, { isPriorityPlaybackActive } from '../../hooks/usePriorityPlaybackCheck';
import useSharedIntersectionObserver from '../../hooks/useSharedIntersectionObserver';
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
  // Deviation: a forwarded ref is a callback prop; the element is kept in a variable and handed on to `props.ref`.
  let containerRef: HTMLDivElement | undefined;

  // Deviation: tt reads `getIsHeavyAnimating()`; the applies below have no owner to ask, so the state of this subtree's
  // scope chain (own scope up to the root) is kept in a flag by the first watcher (it runs before the other callbacks).
  let isHeavyAnimating = false;
  watchHeavyAnimation(
    () => {
      isHeavyAnimating = true;
    },
    () => {
      isHeavyAnimating = false;
    },
  );
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

  // Deviation: `useSyncEffect` that filled a ref is a memo (pulled when `init` or the color effect read it).
  const colorRef = createMemo(() =>
    props.color && !shouldUseColorFilter() ? buildColor(props.color) : (undefined as Color | undefined),
  );

  const shouldForceOnHeavyAnimation = createMemo(() => props.forceAlways || props.forceOnHeavyAnimation);
  // Delay initialization until heavy animation ends
  const [canInitialize, markCanInitialize, unmarkCanInitialize] = useFlag(
    !isHeavyAnimating || shouldForceOnHeavyAnimation(),
  );
  // Deviation: `isDisabled` is a guard inside the callbacks. The transition that starts/ends a heavy animation can do it from its mutate phase; `canInitialize` feeds a measure
  // effect, so the write is booked into a measure task instead of dirtying that effect from the mutate phase.
  watchHeavyAnimation(
    () => {
      if (!shouldForceOnHeavyAnimation()) requestMeasure(unmarkCanInitialize);
    },
    () => {
      if (!shouldForceOnHeavyAnimation()) requestMeasure(markCanInitialize);
    },
  );
  createEffect(
    () => shouldForceOnHeavyAnimation(),
    (shouldForce) => {
      if (shouldForce) markCanInitialize();
    },
  );

  let isUnmountedRef = false;
  onDestroy(() => {
    isUnmountedRef = true;
  });

  // Deviation: `init`, `playAnimation` and the effect bodies run in effect applies, where a prop whose value is a
  // conditional expression (the compiler wraps it in a memo inside the getter) cannot be read: no owner (frameact DEV
  // error). The props they need are read in one memo of this component.
  const live = createMemo(() => ({
    tgsUrl: props.tgsUrl,
    sharedCanvas: props.sharedCanvas,
    sharedCanvasCoords: props.sharedCanvasCoords,
    size: props.size,
    noLoop: props.noLoop,
    quality: props.quality,
    isLowPriority: props.isLowPriority,
    fitzModifier: props.fitzModifier,
    speed: props.speed,
    seekToEnd: props.seekToEnd,
    onLoad: props.onLoad,
    onEnded: props.onEnded,
    onLoop: props.onLoop,
    onFrame: props.onFrame,
    play: props.play,
    playSegment: props.playSegment,
    forceAlways: props.forceAlways,
    forceOnHeavyAnimation: props.forceOnHeavyAnimation,
  }));

  const init = () => {
    const p = live();
    if (
      animationRef ||
      isUnmountedRef ||
      !p.tgsUrl ||
      (p.sharedCanvas && (!p.sharedCanvasCoords || !p.sharedCanvas.offsetWidth || !p.sharedCanvas.offsetHeight)) ||
      (isHeavyAnimating && !shouldForceOnHeavyAnimation())
    ) {
      return;
    }

    const container = containerRef || p.sharedCanvas;
    if (!container) {
      return;
    }

    const TLottie = getTLottie();
    if (!TLottie) {
      return;
    }

    const newAnimation = TLottie.init(
      p.tgsUrl,
      container,
      rendererId() || generateUniqueId(),
      {
        size: p.size,
        noLoop: p.noLoop,
        quality: p.quality,
        isLowPriority: p.isLowPriority,
        coords: p.sharedCanvasCoords,
        fitzModifier: p.fitzModifier,
      },
      viewId,
      colorRef(),
      p.onLoad,
      p.onEnded,
      p.onLoop,
      p.onFrame,
    );

    if (p.speed) {
      newAnimation.setSpeed(p.speed);
    }

    if (p.seekToEnd) {
      newAnimation.seekToEnd();
    }

    setAnimation(newAnimation);
    animationRef = newAnimation;
  };

  // Deviation: `init` reads layout (`offsetWidth`), so this is a measure effect; `sharedCanvasCoords` is tracked by its fields.
  createMeasureEffect(
    depsOf(() => [
      props.tgsUrl,
      props.sharedCanvas,
      props.sharedCanvasCoords?.x,
      props.sharedCanvasCoords?.y,
      canInitialize(),
    ]),
    () => {
      if (!canInitialize()) return;
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
    depsOf(() => [props.color, animation()]),
    () => {
      animation()?.setColor(colorRef());
    },
  );

  createEffect(
    depsOf(() => [props.speed, animation()]),
    () => {
      const { speed } = live();
      if (typeof speed === 'number') {
        animation()?.setSpeed(speed);
      }
    },
  );

  onDestroy(() => {
    animationRef?.removeView(viewId);
  });

  const playAnimation = (shouldRestart = false) => {
    const currentAnimation = animation();
    if (
      !currentAnimation ||
      !(live().play || live().playSegment) ||
      isFrozen(live().forceAlways, live().forceOnHeavyAnimation, isHeavyAnimating)
    ) {
      return;
    }

    const { playSegment } = live();
    if (playSegment) {
      currentAnimation.playSegment(playSegment, shouldRestart, viewId);
    } else if (live().seekToEnd) {
      currentAnimation.seekToEnd();
    } else {
      currentAnimation.play(shouldRestart, viewId);
    }
  };

  const playAnimationOnRaf = () => {
    requestMeasure(playAnimation);
  };

  const pauseAnimation = () => {
    const currentAnimation = animation();
    if (currentAnimation?.isPlaying()) {
      currentAnimation.pause(viewId);
    }
  };

  createEffect(
    depsOf(() => [props.noLoop, animation()]),
    (_deps, prev) => {
      const [prevNoLoop] = prev ?? [];
      if (prevNoLoop !== undefined && live().noLoop !== prevNoLoop) {
        animation()?.setNoLoop(live().noLoop);
      }
    },
  );

  // Deviation: `sharedCanvasCoords` is compared by its fields (the object may be a new one with the same values).
  createEffect(
    depsOf(() => [props.sharedCanvasCoords?.x, props.sharedCanvasCoords?.y, viewId, animation()]),
    ([x, y], prev) => {
      const [prevX, prevY] = prev ?? [];
      if (prevX !== undefined && (x !== prevX || y !== prevY)) {
        animation()?.setSharedCanvasCoords(viewId, live().sharedCanvasCoords);
      }
    },
  );

  createEffect(
    depsOf(() => [animation(), playKey(), props.noLoop, props.forceAlways, props.forceOnHeavyAnimation]),
    () => {
      if (!animation()) {
        return;
      }

      if (playKey()) {
        if (!isFrozen(live().forceAlways, live().forceOnHeavyAnimation, isHeavyAnimating)) {
          playAnimation(live().noLoop);
        }
      } else {
        pauseAnimation();
      }
    },
  );

  createEffect(
    depsOf(() => [animation(), props.tgsUrl, props.fitzModifier]),
    () => {
      const currentAnimation = animation();
      if (currentAnimation) {
        if (isFirstRenderRef) {
          isFirstRenderRef = false;
        } else if (live().tgsUrl) {
          currentAnimation.changeData(live().tgsUrl!, live().fitzModifier);
          playAnimation();
        }
      }
    },
  );

  // Deviation: see above (guarded callbacks).
  watchHeavyAnimation(
    () => {
      if (playKey() && !shouldForceOnHeavyAnimation()) pauseAnimation();
    },
    () => {
      if (playKey() && !shouldForceOnHeavyAnimation()) playAnimation();
    },
  );
  usePriorityPlaybackCheck(pauseAnimation, playAnimation, () => !playKey() || props.forceAlways);
  // Pausing frame may not happen in background,
  // so we need to make sure it happens right after focusing,
  // then we can play again.
  useBackgroundMode(pauseAnimation, playAnimationOnRaf, () => !playKey() || props.forceAlways);

  return (
    <Show when={!props.sharedCanvas}>
      <div
        ref={(el) => {
          containerRef = el;
          props.ref?.(el);
        }}
        class={buildClassName('AnimatedSticker', props.className)}
        style={buildStyle(
          props.size !== undefined && `width: ${props.size}px; height: ${props.size}px;`,
          props.onClick && !IS_TAURI && 'cursor: pointer',
          colorFilter(),
          props.style,
        )}
        onClick={() => props.onClick?.()}
        onMouseEnter={() => props.onMouseEnter?.()}
        onMouseLeave={() => props.onMouseLeave?.()}
      />
    </Show>
  );
};

export default AnimatedSticker;

function isFrozen(forceAlways = false, forceOnHeavyAnimation = false, isHeavyAnimating = false) {
  if (forceAlways) return false;
  return (!forceOnHeavyAnimation && isHeavyAnimating) || isPriorityPlaybackActive() || isBackgroundModeActive();
}
