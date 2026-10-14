import { type Accessor, createEffect, createSignal, watchHeavyAnimation } from 'frameact';

import type { Scheduler } from '../util/schedulers';

import { type MaybeAccessor, read } from '../util/accessors';
import { type CallbackManager, createCallbackManager } from '../util/callbacks';
import { debounce, throttle, throttleWith } from '../util/schedulers';

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

// Deviation: `rootRef` is an accessor of the root element (read when the observer is created).
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
    rootRef: MaybeAccessor<HTMLElement | undefined>;
    throttleMs?: number;
    throttleScheduler?: Scheduler;
    debounceMs?: number;
    shouldSkipFirst?: boolean;
    margin?: number | string;
    threshold?: number | number[];
    isDisabled?: MaybeAccessor<boolean | undefined>;
  },
  rootCallback?: RootCallback,
): Response {
  let controllerRef: IntersectionController | undefined;
  let freezeFlagsRef = 0;
  let onUnfreezeRef: NoneToVoidFunction | undefined;

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
    () => read(isDisabled),
    (isDisabled2) => {
      if (isDisabled2) {
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

      if (rootCallback) {
        rootCallback(entries);
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
        root: read(rootRef),
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

  const observe: ObserveFn = (target, targetCallback) => {
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

// Deviation: `observe` is an accessor (a function cannot be a `MaybeAccessor`).
export function useOnIntersect(
  targetRef: MaybeAccessor<HTMLElement | undefined>,
  observe?: Accessor<ObserveFn | undefined>,
  callback?: TargetCallback,
) {
  createEffect(
    () => observe?.(),
    (observe2) => {
      return observe2 ? observe2(read(targetRef)!, callback) : undefined;
    },
  );
}

export function useIsIntersecting(
  targetRef: MaybeAccessor<HTMLElement | undefined>,
  observe?: Accessor<ObserveFn | undefined>,
  callback?: TargetCallback,
) {
  const [isIntersecting, setIsIntersecting] = createSignal(!observe?.());

  useOnIntersect(targetRef, observe, (entry) => {
    setIsIntersecting(entry.isIntersecting);

    if (callback) {
      callback(entry);
    }
  });

  return isIntersecting;
}
