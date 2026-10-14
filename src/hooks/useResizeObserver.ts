import { createEffect } from 'frameact';

import type { CallbackManager } from '../util/callbacks';

import { type MaybeAccessor, read } from '../util/accessors';
import { createCallbackManager } from '../util/callbacks';

const elementObserverMap = new Map<HTMLElement, [ResizeObserver, CallbackManager]>();

export default function useResizeObserver(
  ref: MaybeAccessor<HTMLElement | undefined> | undefined,
  onResize: (entry: ResizeObserverEntry) => void,
  isDisabled: MaybeAccessor<boolean | undefined> = false,
) {
  createEffect(
    () => read(isDisabled),
    (isDisabled2) => {
      const el = ref && read(ref);
      if (!el || isDisabled2) {
        return undefined;
      }

      const callback: ResizeObserverCallback = ([entry]) => {
        // Ignore updates when element is not properly mounted (`display: none`)
        if (entry.contentRect.width === 0 && entry.contentRect.height === 0) {
          return;
        }

        onResize(entry);
      };

      let [observer, callbackManager] = elementObserverMap.get(el) || [undefined, undefined];
      if (!observer) {
        callbackManager = createCallbackManager();
        observer = new ResizeObserver(callbackManager.runCallbacks);
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
