import { createEffect } from 'frameact';

import { IS_IOS, IS_PWA, IS_TOUCH_ENV } from '../util/browser/windowEnvironment';

const metaViewport = document.querySelector('meta[name="viewport"]');
const defaultViewportContent = metaViewport?.getAttribute('content') || '';
const allowedZoomViewportContent = 'width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover';

// TODO(codemod): usePreventPinchZoomGesture: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function usePreventPinchZoomGesture(isDisabled = false) {
  createEffect(
    () => isDisabled,
    () => {
      if (!IS_TOUCH_ENV) {
        return undefined;
      }

      if (isDisabled) {
        // Clean viewport content from values values that disable the ability to zoom a webpage
        // https://web.dev/meta-viewport/
        metaViewport?.setAttribute('content', allowedZoomViewportContent);
        return undefined;
      }

      metaViewport?.setAttribute('content', defaultViewportContent);

      // Since iOS 10 `user-scaleable=no` is disabled in Safari for iOS,
      // this is only applicable for the browser and does not apply to the PWA mode.
      // https://newbedev.com/how-do-you-disable-viewport-zooming-on-mobile-safari
      if (IS_IOS && !IS_PWA) {
        document.addEventListener('gesturestart', preventEvent);
      }

      return () => {
        metaViewport?.setAttribute('content', 'width=device-width, initial-scale=1, shrink-to-fit=no');
        if (IS_IOS && !IS_PWA) {
          document.removeEventListener('gesturestart', preventEvent);
        }
      };
    },
  );
}

function preventEvent(e: Event) {
  e.preventDefault();
}
