// Ported from telegram-tt src/components/ui/Transition.tsx (GPL-3.0-or-later)
// This file is GPL-3.0-or-later as a whole. It started as frameact's MIT kit (moved from frameact at a3c2d7d,
// src/kit/transition.ts, before frameact PR #16 removed the kit; MIT, © 2026 Denis Maramygin; clean-room, written from
// the kit's behavioural spec) and now also carries code ported from telegram-tt's Transition (GPL-3.0-or-later,
// © Alexander Zinchuk and the telegram-tt contributors): the watched slide of reveal / slideFadeAndroid, nextKey
// pre-rendering, the slideOptimized variant and the swipe-control hook (each noted in the model below).
// Keyed slides with a CSS animation between them, on telegram-tt's class contract (bring the stylesheet).
//
// Model
//   - One `<div class="Transition">` holds one `<div class="Transition_slide">` per live key, in
//     ascending key order. A slide's content is created once (under its own root, which carries the
//     transition's heavy-animation scope) and kept until the slide is dropped.
//   - A STEP (`activeKey` changes) is one mutation effect: compute creates the missing slide on
//     detached DOM; apply (mutate phase) writes the classes — container `Transition-${name}` or
//     `Transition-${name}Backwards`, previous slide `-from`, new slide `-to`, the rest `-inactive` —
//     begins a heavy animation on the scope, watches the animated slide's own `animationend` (the `to` slide,
//     except `reveal` and `slideFadeAndroid` going backwards: their only animation is on `from`, and with no `from`
//     slide the step ends at once, as in tt), calls `onStart`. Which slides survive a step: `renderCount` /
//     `shouldCleanup` keep every live slide; otherwise only {previous, active, next} (keep-alive).
//   - `nextKey` (tt: the slide for that key is rendered ahead of time): its slide is created and attached as an
//     `-inactive` one before it is ever active, and no step or cleanup drops it. Like tt (`if (nextKey)`), key 0 is not
//     pre-rendered.
//   - `slideOptimized` / `slideOptimizedRtl` (tt): no `-from` / `-to` / `-inactive` classes and no keyframes. The
//     stylesheet puts every slide at `scale(0)` and animates `transform` with a CSS transition; the step sets inline
//     `transform` on the two slides (the `to` one starts at +-100%, a forced reflow in between) and watches the `to`
//     slide's `transitionend`. Only the active slide has `Transition_slide-active`. The container keeps its
//     `Transition-slideOptimized*` class after the first step (and gets it as soon as a second slide, a pre-rendered
//     one, exists). Switching from/to an optimized name drops every slide but the active (and next) one.
//   - The END arrives through `waitForAnimationEnd` and is applied in a mutation task: the heavy
//     animation is released first, then (unless the step was superseded or the component disposed)
//     the classes settle (`-active` / `-inactive`), `shouldCleanup` drops slides, `shouldRestoreHeight`
//     measures the active slide in the forced-reflow phase of the same frame and writes the
//     container's height in its mutate step, and `onStop` runs last.
//   - A step during a running step supersedes it: `onStop` runs for the first step as the second
//     starts (pairs stay balanced), and the first step's end only releases its own heavy animation;
//     a superseded step whose slide keep-alive removed is released at once. A non-animated switch (`name: 'none'`, `disableAnimation`) during a running step
//     cancels it (waiter, heavy animation, `onStop`) so nothing stays stuck. Disposal cancels every
//     in-flight end, releases every heavy animation and disposes the slides; nothing touches the DOM
//     or calls `onStop` after it.
//   - Scopes: the slides' effects are gated by `props.scope` (default: a fresh child of the enclosing
//     scope); the component's own effects live under a child owner that re-provides the ENCLOSING
//     scope, so a step is never parked by this transition's own blocking animation.
import {
type Accessor,
  createEffect, createHeavyAnimationScope, createMemo, createMutationEffect, createRoot, createSignal, currentHeavyAnimationScope, getOwner,
  type HeavyAnimationScope,
  onCleanup, provideHeavyAnimationScope, requestForcedReflow, requestMutation, runWithOwner, untrack, } from 'frameact';
import { insert, setExtraStyles, spread } from 'frameact/dom';

import { getNatives } from '../../util/dom/natives';
import { waitForAnimationEnd, waitForTransitionEnd } from './animationEnd';

export type TransitionDirection = 'auto' | 'inverse' | 1 | -1;

export interface TransitionSlide {
  key: number;
  /** Follows `props.activeKey` at once (the frame of the switch, measure effects included). */
  isActive: Accessor<boolean>;
  /** True while this slide is the one animating out; written with the step's DOM classes (mutate phase). */
  isFrom: Accessor<boolean>;
  /** The transition's `activeKey` (same timing as `isActive`). */
  activeKey: Accessor<number>;
}

export interface TransitionProps {
  activeKey: number;
  /**
   * Pre-render the slide of this key (tt `nextKey`): it is created and mounted hidden (`-inactive`) ahead of time and is
   * not dropped by a step or `shouldCleanup`. Key 0 is not pre-rendered (tt tests the key for truthiness).
   */
  nextKey?: number;
  /**
   * CSS animation name: the container gets `Transition-${name}` (`'none'`: switch without animating). `slideOptimized`
   * and `slideOptimizedRtl` run on inline `transform` and a CSS transition instead of keyframes (see the model).
   */
  name: string;
  direction?: TransitionDirection;
  /**
   * Keep every slide ever shown (tt `renderCount`): a slide is created once per key and never removed.
   * The number is the size of the key set you expect (keys `0 … renderCount - 1`); it is a hint, not
   * a cap: with keys that are not a small enum (message ids, timestamps) the slides — and their DOM —
   * grow without bound. DEV warns once when more slides than `renderCount` are alive. Use
   * `shouldCleanup` or the default keep-alive for open key sets.
   */
  renderCount?: number;
  /** After the animation, drop the slides that are not active (see the two exceptions). */
  shouldCleanup?: boolean;
  /** `shouldCleanup`: also keep this key. */
  cleanupExceptionKey?: number;
  /** `shouldCleanup`: drop only this key. */
  cleanupOnlyKey?: number;
  /** After the animation, set the container's height to the active slide's (`height`, `flex-basis`). */
  shouldRestoreHeight?: boolean;
  /** Re-measure for `shouldRestoreHeight` when this changes. */
  restoreHeightKey?: unknown;
  /** `shouldRestoreHeight`: measure this descendant of the active slide instead of the slide. */
  contentSelector?: string;
  isBlockingAnimation?: boolean;
  /**
   * The heavy-animation scope the animation runs on and that the slides' effects are gated by
   * (default: a fresh child of the scope this component is under, so a blocking animation parks only
   * this subtree; pass one scope to several transitions to gate them together). Read once.
   */
  scope?: HeavyAnimationScope;
  /** Switch without animating (the client's "animations off" setting). */
  disableAnimation?: boolean;
  /** Extra class(es) for every slide. Read once. */
  slideClass?: string;
  /** An animated step begins. Every `onStart` gets exactly one `onStop` (a step that is superseded is stopped as the next one starts: `start, stop, start, stop`), except when the component is disposed mid-step. */
  onStart?: () => void;
  onStop?: () => void;
  ref?: (el: HTMLDivElement) => void;
  id?: string;
  class?: unknown;
  /**
   * JSX (created once per slide) or a render function called once per slide — **prefer the render
   * function**. Both slides are live during the animation: JSX children read the current props and
   * state, so the outgoing slide shows the NEW content while it slides out. The outgoing slide is
   * frozen on its old content only when the render function renders by `slide.key`
   * (`(slide) => <Screen id={slide.key} />`): each slide then owns the content of its own key.
   */
  children: unknown;
  [attr: `data-${string}`]: unknown;
  [handler: `on${Capitalize<string>}`]: unknown;
}

export const ACTIVE_SLIDE_CLASS_NAME = 'Transition_slide-active';
export const TO_SLIDE_CLASS_NAME = 'Transition_slide-to';
const FROM_SLIDE_CLASS_NAME = 'Transition_slide-from';
const INACTIVE_SLIDE_CLASS_NAME = 'Transition_slide-inactive';
const CONTAINER_CLASS_NAME = 'Transition';
const SLIDE_CLASS_NAME = 'Transition_slide';
/** A slide whose stylesheet has no animation (or `animation: none`) still settles. */
const ANIMATION_END_FALLBACK_MS = 1000;
const OPTIMIZED_AT_REST = 'translate3d(0, 0, 0)';

type SlideStateClass =
  | typeof ACTIVE_SLIDE_CLASS_NAME
  | typeof TO_SLIDE_CLASS_NAME
  | typeof FROM_SLIDE_CLASS_NAME
  | typeof INACTIVE_SLIDE_CLASS_NAME;

interface SlideRecord {
  key: number;
  el: HTMLDivElement;
  /** The state class currently on the element (`''` before the first write). */
  state: SlideStateClass | '';
  dispose: () => void;
}

/** One animated step; stays in `inFlight` until its end task ran (or disposal cancelled it). */
interface Step {
  seq: number;
  to: SlideRecord;
  cancelWait: () => void;
  endHeavyAnimation: () => void;
  /** `onStop` ran for this step (supersede, interrupt, drop or its own end): exactly once per `onStart`. */
  stopped: boolean;
}

/** The props the component consumes itself; everything else (`id`, `class`, `ref`, `data-*`, `on*`) is spread onto the container. */
const OWN_PROPS = new Set([
  'activeKey', 'nextKey', 'name', 'direction', 'renderCount', 'shouldCleanup', 'cleanupExceptionKey', 'cleanupOnlyKey', 'shouldRestoreHeight',
  'restoreHeightKey', 'contentSelector', 'isBlockingAnimation', 'scope', 'disableAnimation', 'slideClass', 'onStart', 'onStop', 'children',
]);
const isOwnProp = (key: string) => OWN_PROPS.has(key);

function callback(fn: (() => void) | undefined, what: string): void {
  if (fn === undefined) return;
  try {
    fn();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[frameact] <Transition> ${what} failed`, error);
  }
}

/** The animation names whose backwards variant animates `from` only (the stylesheet gives `to` no animation). */
function animatesFromWhenBackwards(name: string): boolean {
  return name === 'reveal' || name === 'slideFadeAndroid';
}

function isOptimizedName(name: string): boolean {
  return name === 'slideOptimized' || name === 'slideOptimizedRtl';
}

function isForwards(direction: TransitionDirection | undefined, fromKey: number, toKey: number): boolean {
  if (direction === 1) return true;
  if (direction === -1) return false;
  const natural = toKey > fromKey;
  return direction === 'inverse' ? !natural : natural;
}

export function Transition(props: TransitionProps): unknown {
  const natives = getNatives();
  const container = natives.createElement.call(document, 'div') as HTMLDivElement;
  container.classList.add(CONTAINER_CLASS_NAME);
  const slideClassTokens = (props.slideClass ?? '').split(/\s+/).filter(Boolean);
  const outerScope = currentHeavyAnimationScope();
  const scope = props.scope ?? createHeavyAnimationScope(outerScope);
  const owner = getOwner();

  let currentKey = untrack(() => props.activeKey);
  // `activeKey` follows the prop at once (a memo, not a write from the step's mutate apply): a measure
  // effect inside a slide that reads `isActive()` sees the new value in the frame of the switch.
  const activeKey = createMemo(() => props.activeKey);
  const [fromKey, setFromKey] = createSignal<number | undefined>(undefined);
  const slides: SlideRecord[] = []; // ascending key order = DOM order
  const inFlight: Step[] = [];
  let running: Step | undefined;
  let stepSeq = 0;
  let containerAnimationClass: string | undefined;
  let disposed = false;
  let warnedRenderCount = false;
  /** The DOM is in the `slideOptimized` style (see the model). */
  let isOptimizedMode = untrack(() => isOptimizedName(props.name));

  // The slides' scope: every effect their content creates snapshots it.
  provideHeavyAnimationScope(scope);

  const findSlide = (key: number): SlideRecord | undefined => {
    for (let i = 0; i < slides.length; i++) if (slides[i].key === key) return slides[i];
    return undefined;
  };

  /** The pre-rendered key (tt: `if (nextKey)`, so 0 is none). */
  const nextKeyNow = (): number | undefined => untrack(() => props.nextKey) || undefined;

  /** Create the slide for `key` (detached): its content under its own root, in the component's context. */
  function createSlide(key: number): SlideRecord {
    const el = natives.createElement.call(document, 'div') as HTMLDivElement;
    el.classList.add(SLIDE_CLASS_NAME, ...slideClassTokens);
    const slide: TransitionSlide = {
      key,
      isActive: () => activeKey() === key,
      isFrom: () => fromKey() === key,
      activeKey,
    };
    // A detached root (disposed by us when the slide is dropped) created under the component owner,
    // whatever owner this runs in: it inherits the component's context — the heavy-animation scope.
    const dispose = runWithOwner(owner, () =>
      createRoot((d) => {
        const children = props.children;
        insert(el, typeof children === 'function' ? (children as (s: TransitionSlide) => unknown)(slide) : children);
        return d;
      }),
    );
    const record: SlideRecord = { key, el, state: '', dispose: dispose ?? (() => {}) };
    let at = slides.length;
    while (at > 0 && slides[at - 1].key > key) at--;
    slides.splice(at, 0, record);
    if (import.meta.env.DEV && !warnedRenderCount) {
      const renderCount = untrack(() => props.renderCount);
      if (renderCount !== undefined && slides.length > renderCount) {
        warnedRenderCount = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[frameact] <Transition renderCount={${renderCount}}>: ${slides.length} slides are alive. Slides are kept per key and never dropped; with keys that are not a small enum the DOM grows without bound — use shouldCleanup or the default keep-alive.`,
        );
      }
    }
    return record;
  }

  // ---- DOM writes (mutate phase only) --------------------------------------

  function setSlideState(record: SlideRecord, state: SlideStateClass): void {
    if (record.state === state) return;
    if (record.state !== '') record.el.classList.remove(record.state);
    record.el.classList.add(state);
    record.state = state;
  }

  function clearSlideState(record: SlideRecord): void {
    if (record.state === '') return;
    record.el.classList.remove(record.state);
    record.state = '';
  }

  /** `transition` and `transform` inline on an optimized slide (`''`: the stylesheet's). */
  function setSlideTransform(record: SlideRecord | undefined, transition: string, transform: string): void {
    if (record === undefined) return;
    record.el.style.transition = transition;
    record.el.style.transform = transform;
  }

  function setContainerAnimation(cls: string | undefined): void {
    if (containerAnimationClass === cls) return;
    if (containerAnimationClass !== undefined) container.classList.remove(containerAnimationClass);
    if (cls !== undefined) container.classList.add(cls);
    containerAnimationClass = cls;
  }

  /** Put the live slides into the container in key order (moves only what is out of place). */
  function syncChildren(): void {
    const { parentNode, nextSibling, insertBefore } = natives;
    // eslint-disable-next-line no-null/no-null
    let ref: Node | null = null;
    for (let i = slides.length - 1; i >= 0; i--) {
      const el = slides[i].el;
      if (parentNode.call(el) !== container || nextSibling.call(el) !== ref) insertBefore.call(container, el, ref);
      ref = el;
    }
  }

  /** Dispose and detach every slide `drop` selects (never the active one nor the pre-rendered next one). */
  function dropSlides(drop: (record: SlideRecord) => boolean): void {
    const next = nextKeyNow();
    for (let i = slides.length - 1; i >= 0; i--) {
      const record = slides[i];
      if (record.key === currentKey || record.key === next || !drop(record)) continue;
      slides.splice(i, 1);
      // A step still waiting on the removed slide would hold its heavy animation until the fallback.
      for (let j = inFlight.length - 1; j >= 0; j--) if (inFlight[j].to === record) interrupt(inFlight[j]);
      record.dispose();
      if (natives.parentNode.call(record.el) === container) natives.removeChild.call(container, record.el);
    }
  }

  function settleSlides(active: SlideRecord): void {
    for (const record of slides) setSlideState(record, record === active ? ACTIVE_SLIDE_CLASS_NAME : INACTIVE_SLIDE_CLASS_NAME);
    setContainerAnimation(undefined);
    setFromKey(undefined);
  }

  /** The optimized variant of `settleSlides`: only the active slide has a class, and the container keeps its class. */
  function settleOptimizedSlides(active: SlideRecord): void {
    for (const record of slides) {
      if (record === active) setSlideState(record, ACTIVE_SLIDE_CLASS_NAME);
      else clearSlideState(record);
    }
    setFromKey(undefined);
  }

  /** Slides the stylesheet hides need the container's optimized class (tt sets it with the first step). */
  function ensureOptimizedContainerClass(): void {
    if (isOptimizedMode && containerAnimationClass === undefined) {
      setContainerAnimation(`${CONTAINER_CLASS_NAME}-${untrack(() => props.name)}`);
    }
  }

  /** The step is over (end event, instant switch, mount): cleanup policy, height restore. */
  function settle(): void {
    if (props.shouldCleanup) {
      const only = props.cleanupOnlyKey;
      const except = props.cleanupExceptionKey;
      dropSlides((record) => (only !== undefined ? record.key === only : record.key !== except));
    }
    if (props.shouldRestoreHeight) scheduleRestoreHeight();
  }

  /** Measure the active slide (or `contentSelector` inside it) in the forced-reflow phase, write the container's height in its mutate step. */
  function scheduleRestoreHeight(): void {
    const key = currentKey;
    requestForcedReflow(() => {
      if (disposed || key !== currentKey) return undefined;
      const record = findSlide(key);
      if (record === undefined) return undefined;
      const selector = props.contentSelector;
      const target = selector ? (natives.querySelectorAll.call(record.el, selector)[0] as HTMLElement | undefined) : record.el;
      if (target === undefined) return undefined;
      const height = target.clientHeight;
      return () => {
        if (disposed) return;
        setExtraStyles(container, { height: `${height}px`, flexBasis: `${height}px` });
        setExtraStyles(record.el, { height: 'auto' });
      };
    });
  }

  function forget(step: Step): void {
    const i = inFlight.indexOf(step);
    if (i !== -1) inFlight.splice(i, 1);
    if (running === step) running = undefined;
  }

  /** The end of `step`'s animation, in the mutate phase. */
  function finish(step: Step, from: SlideRecord | undefined): void {
    step.endHeavyAnimation(); // always: the scope must not stay animating for a superseded step
    forget(step);
    if (disposed || step.seq !== stepSeq) return; // superseded: the later step finishes the classes
    if (isOptimizedMode) {
      settleOptimizedSlides(step.to);
      setSlideTransform(from, 'none', '');
    } else {
      settleSlides(step.to);
    }
    settle();
    stopStep(step);
  }

  /** `onStop` for `step`, once. */
  function stopStep(step: Step): void {
    if (step.stopped) return;
    step.stopped = true;
    callback(props.onStop, 'onStop');
  }

  /** A non-animated switch during `step`: stop it now so no class or scope stays stuck. */
  function interrupt(step: Step): void {
    step.cancelWait();
    step.endHeavyAnimation();
    forget(step);
    stopStep(step);
  }

  /** A step is the running one: not superseded, cancelled or disposed. */
  function isLive(step: Step): boolean {
    return !disposed && step.seq === stepSeq && inFlight.indexOf(step) !== -1;
  }

  /** Leaving or entering the optimized style (a name change): everything but the active and the next slide goes. */
  function resetForMode(optimized: boolean): void {
    isOptimizedMode = optimized;
    if (running !== undefined) interrupt(running);
    dropSlides(() => true);
    setContainerAnimation(undefined);
    for (const record of slides) setSlideTransform(record, '', '');
  }

  /** The state at rest of the slides in the current style: the active one is on, the rest is hidden. */
  function placeAtRest(active: SlideRecord): void {
    if (isOptimizedMode) {
      settleOptimizedSlides(active);
      setSlideTransform(active, 'none', OPTIMIZED_AT_REST);
      if (slides.length > 1) ensureOptimizedContainerClass();
    } else {
      settleSlides(active);
    }
  }

  function applyStep(key: number, prevKey: number | undefined): void {
    currentKey = key;
    const next = findSlide(key)!;
    const name = props.name;
    const optimized = isOptimizedName(name);
    if (optimized !== isOptimizedMode) resetForMode(optimized);
    if (prevKey === undefined) {
      // Mount: the active slide, no animation.
      if (optimized) {
        placeAtRest(next);
      } else {
        setSlideState(next, ACTIVE_SLIDE_CLASS_NAME);
      }
      syncChildren();
      settle();
      return;
    }
    // After a style reset the previous slide may be gone.
    const prev = findSlide(prevKey);
    // Keep-alive: without renderCount/shouldCleanup only the previous, the new and the pre-rendered next slide live on.
    if (!props.renderCount && !props.shouldCleanup) dropSlides((record) => record !== prev);
    if (optimized) {
      applyOptimizedStep(next, prev, name, !isForwards(props.direction, prevKey, key));
      return;
    }
    if (name === 'none' || props.disableAnimation) {
      if (running !== undefined) interrupt(running);
      settleSlides(next);
      syncChildren();
      settle();
      return;
    }
    // A step still running is superseded: it is over for `onStop` now (so every `onStart` has one `onStop`);
    // its own end only releases its heavy animation.
    if (running !== undefined) stopStep(running);
    const step: Step = { seq: ++stepSeq, to: next, cancelWait: () => {}, endHeavyAnimation: () => {}, stopped: false };
    running = step;
    inFlight.push(step);
    for (const record of slides) {
      setSlideState(record, record === next ? TO_SLIDE_CLASS_NAME : record === prev ? FROM_SLIDE_CLASS_NAME : INACTIVE_SLIDE_CLASS_NAME);
    }
    const isBackwards = !isForwards(props.direction, prevKey, key);
    setContainerAnimation(`${CONTAINER_CLASS_NAME}-${name}${isBackwards ? 'Backwards' : ''}`);
    syncChildren();
    setFromKey(prevKey);
    step.endHeavyAnimation = scope.begin(Infinity, Boolean(props.isBlockingAnimation));
    // The slide the stylesheet animates: `to`, except the two names whose backwards variant animates `from` only
    // (tt `watchedNode`). Without that slide nothing animates and the step ends at once.
    const watched = isBackwards && animatesFromWhenBackwards(name) ? prev : next;
    if (watched === undefined) {
      requestMutation(() => finish(step, prev));
    } else {
      step.cancelWait = waitForAnimationEnd(watched.el, () => requestMutation(() => finish(step, prev)), { fallbackMs: ANIMATION_END_FALLBACK_MS });
    }
    callback(props.onStart, 'onStart');
  }

  /** tt `performSlideOptimized`: inline `transform` on the two slides, a CSS transition, a forced reflow between. */
  function applyOptimizedStep(
    next: SlideRecord,
    prev: SlideRecord | undefined,
    name: string,
    isBackwardsByKeys: boolean,
  ): void {
    if (props.disableAnimation) {
      if (running !== undefined) interrupt(running);
      setContainerAnimation(`${CONTAINER_CLASS_NAME}-${name}${isBackwardsByKeys ? 'Backwards' : ''}`);
      if (prev !== undefined) {
        clearSlideState(prev);
        setSlideTransform(prev, 'none', '');
      }
      setSlideState(next, ACTIVE_SLIDE_CLASS_NAME);
      setSlideTransform(next, 'none', OPTIMIZED_AT_REST);
      syncChildren();
      settleOptimizedSlides(next);
      settle();
      return;
    }
    // The Rtl variant mirrors the direction.
    const isBackwards = name === 'slideOptimizedRtl' ? !isBackwardsByKeys : isBackwardsByKeys;
    if (running !== undefined) stopStep(running);
    const step: Step = { seq: ++stepSeq, to: next, cancelWait: () => {}, endHeavyAnimation: () => {}, stopped: false };
    running = step;
    inFlight.push(step);
    setContainerAnimation(`${CONTAINER_CLASS_NAME}-${name}${isBackwards ? 'Backwards' : ''}`);
    setSlideTransform(prev, 'none', OPTIMIZED_AT_REST);
    setSlideTransform(next, 'none', `translate3d(${isBackwards ? '-' : ''}100%, 0, 0)`);
    syncChildren();
    setFromKey(prev?.key);
    step.endHeavyAnimation = scope.begin(Infinity, Boolean(props.isBlockingAnimation));
    // The reflow commits the starting positions; then the CSS transition runs to the final ones.
    requestForcedReflow(() => {
      if (!isLive(step)) return undefined;
      void next.el.offsetWidth;
      return () => {
        if (!isLive(step)) return;
        if (prev !== undefined) {
          clearSlideState(prev);
          setSlideTransform(prev, '', `translate3d(${isBackwards ? '' : '-'}100%, 0, 0)`);
        }
        setSlideState(next, ACTIVE_SLIDE_CLASS_NAME);
        setSlideTransform(next, '', OPTIMIZED_AT_REST);
      };
    });
    step.cancelWait = waitForTransitionEnd(next.el, () => requestMutation(() => finish(step, prev)), {
      fallbackMs: ANIMATION_END_FALLBACK_MS,
    });
    callback(props.onStart, 'onStart');
  }

  // ---- the component's own effects: under the ENCLOSING scope ----------------
  // A root (inherits the component's context and error handlers; disposed with the component, below)
  // that re-provides the enclosing scope.
  const disposeOwn = createRoot((dispose) => {
    provideHeavyAnimationScope(outerScope);
    createMutationEffect(
      () => {
        const key = props.activeKey;
        if (findSlide(key) === undefined) createSlide(key);
        return key;
      },
      applyStep,
      { name: 'transition.step' },
    );
    // A name change that switches the style (optimized / not) without a key change; with a key change the step does it.
    createMutationEffect(
      () => isOptimizedName(props.name),
      (optimized) => {
        if (optimized === isOptimizedMode || props.activeKey !== currentKey) return;
        resetForMode(optimized);
        const active = findSlide(currentKey);
        if (active === undefined) return;
        placeAtRest(active);
        syncChildren();
      },
      { name: 'transition.mode' },
    );
    // tt `nextKey`: the slide of that key is created ahead of time and mounted hidden.
    createMutationEffect(
      () => {
        const key = props.nextKey || undefined;
        if (key !== undefined && findSlide(key) === undefined) createSlide(key);
        return key;
      },
      (key) => {
        if (key === undefined) return;
        const record = findSlide(key);
        if (record === undefined || natives.parentNode.call(record.el) === container) return;
        if (isOptimizedMode) ensureOptimizedContainerClass();
        else setSlideState(record, INACTIVE_SLIDE_CLASS_NAME);
        syncChildren();
      },
      { name: 'transition.nextKey' },
    );
    let restoreHeightRuns = 0;
    createEffect(
      () => props.restoreHeightKey,
      () => {
        // The first apply is the creation one (the mount already measured); re-measure on changes.
        if (restoreHeightRuns++ > 0 && props.shouldRestoreHeight) scheduleRestoreHeight();
      },
      undefined,
      { name: 'transition.restoreHeightKey' },
    );
    spread(container, props, true, isOwnProp);
    return dispose;
  });

  onCleanup(() => {
    disposed = true;
    disposeOwn();
    for (const step of inFlight.splice(0)) {
      step.cancelWait();
      step.endHeavyAnimation();
    }
    running = undefined;
    for (const record of slides.splice(0)) record.dispose();
  });

  return container;
}
