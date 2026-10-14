import { resolveEventType } from '../lib/teact/dom-events';
import { createMutationEffect, onFullyIdle } from 'frameact';

import unloadVideo from '../util/browser/unloadVideo';
import { useStateRef } from './useStateRef';

// Fix memory leak when unmounting video element
// TODO(codemod): useVideoCleanup: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useVideoCleanup(
  videoRef: (el: HTMLVideoElement) => void,
  handlers?: Record<string, AnyFunction>,
) {
  // TODO(codemod): useStateRef: a handler reads the current value through the accessor; replace ref.current with the accessor call
  const handlersRef = useStateRef(handlers);

  createMutationEffect(
    () => [handlersRef, videoRef],
    () => {
      const videoEl = videoRef.current;
      if (!videoEl) return undefined;

      return () => {
        // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
        const handlers2 = handlersRef.current;
        if (handlers2) {
          Object.entries(handlers2).forEach(([key, value]) => {
            videoEl.removeEventListener(resolveEventType(key, videoEl), value, false);
          });
        }

        // It may be slow (specifically on iOS), so we postpone it after unmounting
        onFullyIdle(() => {
          unloadVideo(videoEl);
        });
      };
    },
  );
}
