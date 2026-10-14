// Moved from frameact (MIT, © 2026 Denis Maramygin) at a3c2d7d (src/kit/index.ts, before frameact PR #16 removed the kit).
// The UI kit: the thin layer a Telegram Web A-class client needs before its main screens. Components here
// carry CSS class contracts (the app brings the stylesheet, e.g. telegram-tt's Transition.scss); the core
// primitives they build on live in `frameact` (onMount, previous, …) and `frameact/dom` (lazy, splitProps).
// Only frameact's public entries are imported; the DOM natives come from `src/util/dom/natives.ts`, the store shape key from `shape.ts` (temporary, see its TODO).
export { waitForAnimationEnd, waitForTransitionEnd, type WaitForEndOptions } from './animationEnd';
export {
  createShowTransition, createMediaTransition, ShowTransition,
  type ShowTransitionOptions, type ShowTransitionResult, type ShowTransitionState, type ShowTransitionProps,
  type MediaTransitionOptions,
} from './showTransition';
export {
  Transition, ACTIVE_SLIDE_CLASS_NAME, TO_SLIDE_CLASS_NAME,
  type TransitionProps, type TransitionSlide, type TransitionDirection,
} from './transition';
export { createScrollAnchor, type ScrollAnchor, type ScrollAnchorOptions } from './scrollAnchor';
export { InfiniteScroll, type InfiniteScrollProps, type LoadMoreDirection } from './infiniteScroll';
