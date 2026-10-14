// Deviation: a thin adapter over the kit's `<Transition>` (src/lib/kit/transition.ts) that keeps tt's props and
// stylesheet, so call sites keep `import Transition from '../ui/Transition'`. The kit owns the slide DOM (one
// `Transition_slide` div per live key, always wrapped), the heavy-animation scope and the class contract.
//
// Mapped: ref, activeKey, name, direction, renderCount, shouldRestoreHeight, shouldCleanup, cleanupExceptionKey,
// cleanupOnlyKey, id, className (-> class), slideClassName (-> slideClass), isBlockingAnimation, contentSelector,
// restoreHeightKey, onStart, onStop, onScroll, onMouseDown, onWheel, data-tauri-drag-region, and the
// `selectCanAnimateInterface` switch (-> disableAnimation).
// Children: a render function `(slide) => node` called once per slide; render by `slide.key` (framework guide section 6).
// tt's `(isActive, isFrom, currentKey, activeKey)` arguments are `slide.isActive()`, `slide.isFrom()`, `slide.key`,
// `slide.activeKey()`.
// Not available (TODO(port) below): nextKey, withSwipeControl, slideOptimized / slideOptimizedRtl (rendered as slide /
// slideRtl), shouldWrap / wrapExceptionKey (accepted and ignored: the kit always wraps each slide).
import { createMemo } from 'frameact';
import { splitProps } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import { useGlobal } from '../../global';
import { selectCanAnimateInterface } from '../../global/selectors';
import { Transition as KitTransition, type TransitionSlide } from '../../lib/kit';

import './Transition.scss';

export { ACTIVE_SLIDE_CLASS_NAME, TO_SLIDE_CLASS_NAME } from '../../lib/kit';

type AnimationName =
  | 'none'
  | 'slide'
  | 'slideRtl'
  | 'slideFade'
  | 'zoomFade'
  | 'zoomBounceSemiFade'
  | 'slideLayers'
  | 'fade'
  | 'pushSlide'
  | 'reveal'
  | 'slideOptimized'
  | 'slideOptimizedRtl'
  | 'semiFade'
  | 'slideVertical'
  | 'slideVerticalFade'
  | 'slideFadeAndroid';
export type ChildrenFn = (slide: TransitionSlide) => JSX.Element;
export type TransitionProps = {
  ref?: (el: HTMLDivElement) => void;
  activeKey: number;
  // TODO(port): nextKey is not supported by the kit (tt pre-renders that slide).
  nextKey?: number;
  name: AnimationName;
  direction?: 'auto' | 'inverse' | 1 | -1;
  renderCount?: number;
  shouldRestoreHeight?: boolean;
  shouldCleanup?: boolean;
  cleanupExceptionKey?: number;
  cleanupOnlyKey?: number;
  // Ignored: the kit always wraps each slide.
  shouldWrap?: boolean;
  wrapExceptionKey?: number;
  id?: string;
  className?: string;
  slideClassName?: string;
  // TODO(port): swipe control (util/swipeController) is not supported by the kit.
  withSwipeControl?: boolean;
  isBlockingAnimation?: boolean;
  children: JSX.Element | ChildrenFn;
  'data-tauri-drag-region'?: true;
  contentSelector?: string;
  restoreHeightKey?: number;
  onStart?: NoneToVoidFunction;
  onStop?: NoneToVoidFunction;
  onScroll?: NoneToVoidFunction;
  onWheel?: (e: WheelEvent) => void;
  onMouseDown?: (e: MouseEvent) => void;
};

const DISABLEABLE_ANIMATIONS = new Set<AnimationName>([
  'slide',
  'slideRtl',
  'slideFade',
  'zoomFade',
  'zoomBounceSemiFade',
  'slideLayers',
  'pushSlide',
  'reveal',
  'slideOptimized',
  'slideOptimizedRtl',
  'slideVertical',
  'slideVerticalFade',
]);

// TODO(port): the kit has no slideOptimized (inline-transform slide); the CSS of those names depends on that JS.
const NAME_FALLBACKS: Partial<Record<AnimationName, AnimationName>> = {
  slideOptimized: 'slide',
  slideOptimizedRtl: 'slideRtl',
};

const Transition = (props: TransitionProps) => {
  const [, rest] = splitProps(props, [
    'nextKey',
    'name',
    'className',
    'slideClassName',
    'withSwipeControl',
    'shouldWrap',
    'wrapExceptionKey',
    'children',
  ]);

  const global = useGlobal();
  const shouldDisableAnimation = createMemo(
    () => DISABLEABLE_ANIMATIONS.has(props.name) && !selectCanAnimateInterface(global),
  );

  return (
    <KitTransition
      {...rest}
      name={NAME_FALLBACKS[props.name] || props.name}
      class={props.className}
      slideClass={props.slideClassName}
      disableAnimation={shouldDisableAnimation()}
    >
      {props.children}
    </KitTransition>
  );
};

export default Transition;
