import { createEffect, createMemo, createSignal, onMount, requestMeasure } from 'frameact';
import { mergeProps } from 'frameact/dom';
import { getGlobal } from '../../global';

import { selectCanAnimateInterface } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import buildStyle from '../../util/buildStyle';
import { depsOf } from '../../util/effectDeps';

import useResizeObserver from '../../hooks/useResizeObserver';

import styles from './Marquee.module.scss';

const DEFAULT_SPEED = 40;

type AnimationState = {
  isAnimating: boolean;
  hasAnimationDelay: boolean;
};

type MarqueeSize = {
  isOverflowing: boolean;
  distance: number;
};

type StartAnimationOptions = {
  shouldForce?: boolean;
  shouldDelay?: boolean;
};

type OwnProps = {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  paused?: boolean;
  style?: string;
  speed?: number;
};

const INITIAL_ANIMATION_STATE: AnimationState = {
  isAnimating: false,
  hasAnimationDelay: false,
};

const INITIAL_MARQUEE_SIZE: MarqueeSize = {
  isOverflowing: false,
  distance: 0,
};

const Marquee = (rawProps: OwnProps) => {
  const props = mergeProps({ speed: DEFAULT_SPEED }, rawProps) as OwnProps & Required<Pick<OwnProps, 'speed'>>;
  let rootRef!: HTMLSpanElement;
  let contentRef!: HTMLSpanElement;
  let copyRef!: HTMLSpanElement;
  const [marqueeSize, setMarqueeSize] = createSignal(INITIAL_MARQUEE_SIZE);
  const [animationState, setAnimationState] = createSignal(INITIAL_ANIMATION_STATE);
  let restartAnimationFrameRef: number | undefined;
  let hasAutoStartedRef = false;

  const marqueeSizeResult = createMemo(() => marqueeSize());
  const isOverflowing = () => marqueeSizeResult().isOverflowing;
  const distance = () => marqueeSizeResult().distance;
  const animationStateResult = createMemo(() => animationState());
  const isAnimating = () => animationStateResult().isAnimating;
  const hasAnimationDelay = () => animationStateResult().hasAnimationDelay;
  const isPaused = createMemo(() => Boolean(props.paused));
  const duration = createMemo(() => (distance() ? (distance() / props.speed) * 1000 : 0));

  const startAnimation = (options?: StartAnimationOptions) => {
    const shouldForce = Boolean(options?.shouldForce);
    const shouldDelay = Boolean(options?.shouldDelay);

    if ((!shouldForce && (!isOverflowing() || isAnimating())) || !selectCanAnimateInterface(getGlobal())) {
      return;
    }

    if (restartAnimationFrameRef) {
      cancelAnimationFrame(restartAnimationFrameRef);
    }

    setAnimationState({
      isAnimating: false,
      hasAnimationDelay: shouldDelay,
    });
    restartAnimationFrameRef = requestAnimationFrame(() => {
      restartAnimationFrameRef = undefined;
      setAnimationState((current) => ({
        isAnimating: true,
        hasAnimationDelay: current.hasAnimationDelay,
      }));
    });
  };

  const startAutoAnimation = () => {
    if (hasAutoStartedRef) {
      return;
    }

    hasAutoStartedRef = true;
    startAnimation({ shouldForce: true, shouldDelay: true });
  };

  const measureOverflow = () => {
    requestMeasure(() => {
      if (!rootRef || !contentRef) return;

      const rootElement = rootRef;
      const contentElement = contentRef;
      const copyElement = copyRef;
      const nextContainerWidth = rootElement.clientWidth;
      const nextContentWidth = contentElement.scrollWidth;
      const nextOverflowDistance = Math.ceil(nextContentWidth - nextContainerWidth);

      if (nextOverflowDistance <= 0) {
        if (restartAnimationFrameRef) {
          cancelAnimationFrame(restartAnimationFrameRef);
          restartAnimationFrameRef = undefined;
        }
        setMarqueeSize(INITIAL_MARQUEE_SIZE);
        setAnimationState(INITIAL_ANIMATION_STATE);
        return;
      }

      if (!copyElement || !rootElement.contains(copyElement)) {
        setMarqueeSize({ isOverflowing: true, distance: 0 });
        return;
      }

      const nextDistance = Math.abs(copyElement.offsetLeft - contentElement.offsetLeft);

      setMarqueeSize({ isOverflowing: true, distance: nextDistance });
      startAutoAnimation();
    });
  };

  createEffect(
    depsOf(() => [props.children, measureOverflow] as const),
    () => {
      if (restartAnimationFrameRef) {
        cancelAnimationFrame(restartAnimationFrameRef);
        restartAnimationFrameRef = undefined;
      }

      hasAutoStartedRef = false;
      setMarqueeSize(INITIAL_MARQUEE_SIZE);
      setAnimationState(INITIAL_ANIMATION_STATE);
      measureOverflow();
    },
  );

  createEffect(
    depsOf(() => [distance(), isOverflowing()] as const),
    ([distance2, isOverflowing2]) => {
      if (!isOverflowing2 || distance2) {
        return;
      }

      measureOverflow();
    },
  );

  onMount(() => {
    return () => {
      if (restartAnimationFrameRef) {
        cancelAnimationFrame(restartAnimationFrameRef);
      }
    };
  });

  useResizeObserver(() => rootRef, measureOverflow);
  useResizeObserver(() => contentRef, measureOverflow);

  const handleAnimationEnd = (e: React.AnimationEvent<HTMLElement>) => {
    if (e.animationName === styles.marqueeScroll) {
      setAnimationState(INITIAL_ANIMATION_STATE);
    }
  };

  const handleMouseEnter = () => {
    startAnimation();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse') return;
    startAnimation();
  };

  const rootStyle = createMemo(() =>
    buildStyle(
      isOverflowing() && `--_marquee-distance: ${distance()}px`,
      isOverflowing() && `--_marquee-duration: ${duration()}ms`,
      props.style,
    ),
  );

  return (
    <span
      ref={rootRef}
      class={buildClassName(
        styles.root,
        isOverflowing() && styles.overflowing,
        isAnimating() && styles.animating,
        hasAnimationDelay() && styles.delayed,
        isPaused() && styles.paused,
        props.className,
      )}
      style={rootStyle()}
      onMouseEnter={handleMouseEnter}
      onPointerDown={handlePointerDown}
    >
      <span
        ref={contentRef}
        class={buildClassName(styles.content, props.contentClassName)}
        onAnimationEnd={handleAnimationEnd}
      >
        {props.children}
      </span>
      {isOverflowing() && (
        <span
          ref={copyRef}
          class={buildClassName(styles.content, styles.copy, props.contentClassName)}
          aria-hidden="true"
        >
          {props.children}
        </span>
      )}
    </span>
  );
};

export default Marquee;
