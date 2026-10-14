import { createEffect, createSignal, watchHeavyAnimation } from 'frameact';

import type { Scheduler } from '../util/schedulers';

import { type CallbackManager, createCallbackManager } from '../util/callbacks';
import { debounce, throttle, throttleWith } from '../util/schedulers';
import useHeavyAnimation from './useHeavyAnimation';
import useLastCallback from './useLastCallback';

type TargetCallback = (entry: IntersectionObserverEntry) => void;
type RootCallback = (entries: IntersectionObserverEntry[]) => void;
type ObserveCleanup = NoneToVoidFunction;
export type ObserveFn = (target: HTMLElement, targetCallback?: TargetCallback) => ObserveCleanup;

interface IntersectionController {
  observer: IntersectionObserver;
  addCallback: (element: HTMLElement, callback: TargetCallback) => void;
  removeCallback: (element: HTMLElement, callback: TargetCallback) => void;
  destroy: NoneToVoidFunction;
}

interface Response {
  observe: ObserveFn;
  freeze: NoneToVoidFunction;
  unfreeze: NoneToVoidFunction;
}

// TODO(codemod): useIntersectionObserver: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export function useIntersectionObserver(
  {
    rootRef,
    throttleMs,
    throttleScheduler,
    debounceMs,
    shouldSkipFirst,
    margin,
    threshold,
    isDisabled,
  }: {
    rootRef: (el: HTMLDivElement) => void;
    throttleMs?: number;
    throttleScheduler?: Scheduler;
    debounceMs?: number;
    shouldSkipFirst?: boolean;
    margin?: number | string;
    threshold?: number | number[];
    isDisabled?: boolean;
  },
  rootCallback?: RootCallback,
): Response {
  let controllerRef: IntersectionController | undefined;
  let rootCallbackRef: RootCallback | undefined;
  let freezeFlagsRef = 0;
  let onUnfreezeRef: NoneToVoidFunction | undefined;

  rootCallbackRef = rootCallback;

  const freeze = () => {
    freezeFlagsRef++;
  };

  const unfreeze = () => {
    if (!freezeFlagsRef) {
      return;
    }

    freezeFlagsRef--;

    if (!freezeFlagsRef && onUnfreezeRef) {
      onUnfreezeRef();
      onUnfreezeRef = undefined;
    }
  };

  watchHeavyAnimation(freeze, unfreeze);

  createEffect(
    () => isDisabled,
    () => {
      if (isDisabled) {
        return undefined;
      }

      return () => {
        if (controllerRef) {
          controllerRef.observer.disconnect();
          controllerRef.destroy();
          controllerRef = undefined;
        }
      };
    },
  );

  function initController() {
    const callbacks = new Map<HTMLElement, CallbackManager<TargetCallback>>();
    const entriesAccumulator = new Map<Element, IntersectionObserverEntry>();

    let observerCallback: typeof observerCallbackSync;
    if (typeof throttleScheduler === 'function') {
      observerCallback = throttleWith(throttleScheduler, observerCallbackSync);
    } else if (throttleMs) {
      observerCallback = throttle(observerCallbackSync, throttleMs, !shouldSkipFirst);
    } else if (debounceMs) {
      observerCallback = debounce(observerCallbackSync, debounceMs, !shouldSkipFirst);
    } else {
      observerCallback = observerCallbackSync;
    }

    function observerCallbackSync() {
      if (freezeFlagsRef) {
        onUnfreezeRef = observerCallback;
        return;
      }

      const entries = Array.from(entriesAccumulator.values());

      entries.forEach((entry: IntersectionObserverEntry) => {
        const callbackManager = callbacks.get(entry.target as HTMLElement);
        callbackManager?.runCallbacks(entry);
      });

      if (rootCallbackRef) {
        rootCallbackRef(entries);
      }

      entriesAccumulator.clear();
    }

    function addCallback(element: HTMLElement, callback: TargetCallback) {
      if (!callbacks.get(element)) {
        callbacks.set(element, createCallbackManager<TargetCallback>());
      }

      const callbackManager = callbacks.get(element)!;
      callbackManager.addCallback(callback);
    }

    function removeCallback(element: HTMLElement, callback: TargetCallback) {
      const callbackManager = callbacks.get(element);
      if (!callbackManager) return;
      callbackManager.removeCallback(callback);

      if (!callbackManager.hasCallbacks()) {
        callbacks.delete(element);
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entriesAccumulator.set(entry.target, entry);
        });

        if (freezeFlagsRef) {
          onUnfreezeRef = observerCallback;
        } else {
          observerCallback();
        }
      },
      {
        root: rootRef.current,
        rootMargin: typeof margin === 'number' ? `${margin}px` : margin,
        threshold,
      },
    );

    function destroy() {
      callbacks.clear();
      observer.disconnect();
      entriesAccumulator.clear();
    }

    controllerRef = {
      observer,
      addCallback,
      removeCallback,
      destroy,
    };
  }

  const observe = (target, targetCallback) => {
    if (!controllerRef) {
      initController();
    }

    const controller = controllerRef!;
    controller.observer.observe(target);

    if (targetCallback) {
      controller.addCallback(target, targetCallback);
    }

    return () => {
      if (targetCallback) {
        controller.removeCallback(target, targetCallback);
      }

      controller.observer.unobserve(target);
    };
  };

  return { observe, freeze, unfreeze };
}

// TODO(codemod): useOnIntersect: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export function useOnIntersect(
  targetRef: (el: HTMLDivElement) => void,
  observe?: ObserveFn,
  callback?: TargetCallback,
) {
  const lastCallback = callback;

  createEffect(
    () => [lastCallback, observe, targetRef],
    () => {
      return observe ? observe(targetRef.current!, lastCallback) : undefined;
    },
  );
}

// TODO(codemod): useIsIntersecting: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export function useIsIntersecting(
  targetRef: (el: HTMLDivElement) => void,
  observe?: ObserveFn,
  callback?: TargetCallback,
) {
  const [isIntersecting, setIsIntersecting] = createSignal(!observe);

  useOnIntersect(targetRef, observe, (entry) => {
    setIsIntersecting(entry.isIntersecting);

    if (callback) {
      callback(entry);
    }
  });

  return isIntersecting;
}
