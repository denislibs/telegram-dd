import { createEffect } from 'frameact';

import type { CallbackManager } from '../util/callbacks';

import { createCallbackManager } from '../util/callbacks';
import { useStateRef } from './useStateRef';

const elementObserverMap = new Map<HTMLElement, [ResizeObserver, CallbackManager]>();

// TODO(codemod): useResizeObserver: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useResizeObserver(
  ref: (el: HTMLElement) => void | undefined,
  onResize: (entry: ResizeObserverEntry) => void,
  isDisabled = false,
) {
  // TODO(codemod): useStateRef: a handler reads the current value through the accessor; replace ref.current with the accessor call
  const onResizeRef = useStateRef(onResize);

  createEffect(
    () => [isDisabled, onResizeRef, ref],
    () => {
      const el = ref?.current;
      if (!el || isDisabled) {
        return undefined;
      }

      const callback: ResizeObserverCallback = ([entry]) => {
        // Ignore updates when element is not properly mounted (`display: none`)
        if (entry.contentRect.width === 0 && entry.contentRect.height === 0) {
          return;
        }

        onResizeRef.current(entry);
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
