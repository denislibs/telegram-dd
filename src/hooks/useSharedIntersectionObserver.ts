import { createEffect, getIsHeavyAnimating, requestMeasure } from 'frameact';

import type { CallbackManager } from '../util/callbacks';

import { type MaybeAccessor, read } from '../util/accessors';
import { createCallbackManager } from '../util/callbacks';

const elementObserverMap = new Map<HTMLElement, [IntersectionObserver, CallbackManager]>();

export default function useSharedIntersectionObserver(
  refOrElement: MaybeAccessor<HTMLElement | undefined> | undefined,
  onIntersectionChange: (entry: IntersectionObserverEntry) => void,
  isDisabled: MaybeAccessor<boolean | undefined> = false,
) {
  const onIntersectionChangeLast = onIntersectionChange;

  createEffect(
    () => read(isDisabled),
    (isDisabled2) => {
      const el = refOrElement && read(refOrElement);
      if (!el || isDisabled2) {
        return undefined;
      }

      const entriesAccumulator = new Map<Element, IntersectionObserverEntry>();

      function flush() {
        for (const entry of entriesAccumulator.values()) {
          // Ignore updates when element is not properly mounted (`display: none`)
          if (!(entry.target as HTMLElement).offsetParent) {
            continue;
          }

          onIntersectionChangeLast(entry);
        }

        entriesAccumulator.clear();
      }

      const callback: IntersectionObserverCallback = ([entry]) => {
        entriesAccumulator.set(entry.target, entry);

        if (!getIsHeavyAnimating()) {
          flush();
        } else {
          getIsHeavyAnimating.once(() => {
            requestMeasure(flush);
          });
        }
      };

      let [observer, callbackManager] = elementObserverMap.get(el) || [undefined, undefined];
      if (!observer) {
        callbackManager = createCallbackManager();
        observer = new IntersectionObserver(callbackManager.runCallbacks);
        elementObserverMap.set(el, [observer, callbackManager]);
        observer.observe(el);
      }
      callbackManager!.addCallback(callback);

      return () => {
        callbackManager!.removeCallback(callback);
        if (!callbackManager!.hasCallbacks()) {
          observer.unobserve(el);
          observer.disconnect();
          elementObserverMap.delete(el);
        }
      };
    },
  );
}
