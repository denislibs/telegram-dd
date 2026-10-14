// Dev-only (nothing imports it; the bundle never contains it). Browser side of tests/e2e/transition.spec.ts: the spec imports this module into the running app page (the vite dev
// server serves it, stricterdom is on, the app's CSS variables are there) and mounts the kit's <Transition> with tt's
// real stylesheet next to the app. Nothing here ships: only the e2e spec imports it.
import { createRoot, createSignal } from 'frameact';
import { createComponent, insert } from 'frameact/dom';
import { suppressStrict } from 'frameact/stricterdom';

import { Transition, type TransitionSlide } from '../lib/kit';
import { captureControlledSwipe } from '../util/swipeController';

import '../components/ui/Transition.scss';

export interface MountOptions {
  name: string;
  initialKey: number;
  withSwipeControl?: boolean;
  isBlockingAnimation?: boolean;
  nextKey?: number;
  /** Wire tt's LeftColumn-like swipe: swiping right goes to `swipeTarget`, a cancel returns to `initialKey`. */
  swipeTarget?: number;
}

export interface Harness {
  el: HTMLElement;
  log: { event: string; at: number }[];
  setKey: (key: number) => void;
  setNextKey: (key: number | undefined) => void;
  dispose: () => void;
}

/** Mount a 390 x 300 transition inside #root (tt's `#root .Transition-slideOptimized` rule needs it). */
export function mount(options: MountOptions): Harness {
  // The scaffolding (attaching the host, the first insert) is not the code under test: the kit's own DOM writes are
  // made later by its effects, in their phases, and are watched by stricterdom as usual.
  return suppressStrict(() => mountUnchecked(options));
}

function mountUnchecked(options: MountOptions): Harness {
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:0;top:200px;width:390px;height:300px;overflow:hidden;background:#fff;z-index:9999';
  document.getElementById('root')!.appendChild(host);
  const [key, setKey] = createSignal(options.initialKey);
  const [nextKey, setNextKey] = createSignal<number | undefined>(options.nextKey);
  const log: Harness['log'] = [];
  const mark = (event: string) => log.push({ event, at: performance.now() });
  let stopSwipe: (() => void) | undefined;
  const disposeRoot = createRoot((dispose) => {
    insert(
      host,
      createComponent(Transition, {
        get activeKey() {
          return key();
        },
        get nextKey() {
          return nextKey();
        },
        name: options.name,
        withSwipeControl: options.withSwipeControl,
        isBlockingAnimation: options.isBlockingAnimation,
        onStart: () => mark('start'),
        onStop: () => mark('stop'),
        children: (slide: TransitionSlide) => {
          const content = document.createElement('div');
          content.className = 'harness-content';
          content.textContent = `slide ${slide.key}`;
          content.style.cssText = 'width:100%;height:100%;background:#eef;';
          return content;
        },
      }),
    );
    return dispose;
  });
  const el = host.firstElementChild as HTMLElement;
  if (options.swipeTarget !== undefined) {
    stopSwipe = captureControlledSwipe(el, {
      onSwipeRightStart: () => {
        mark('swipe');
        setKey(options.swipeTarget!);
      },
      onCancel: () => {
        mark('cancel');
        setKey(options.initialKey);
      },
    });
  }
  return {
    el,
    log,
    setKey,
    setNextKey,
    dispose() {
      suppressStrict(() => {
        stopSwipe?.();
        disposeRoot();
        host.remove();
      });
    },
  };
}
