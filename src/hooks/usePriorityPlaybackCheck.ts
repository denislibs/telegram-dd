import { createEffect } from 'frameact';

import { type MaybeAccessor, read } from '../util/accessors';
import { createCallbackManager } from '../util/callbacks';

const startCallbacks = createCallbackManager();
const endCallbacks = createCallbackManager();

let timeout: number | undefined;
let isActive = false;

// Deviation: `isDisabled` is a value or an accessor; the callbacks are required (tt crashed on a missing one).
const usePriorityPlaybackCheck = (
  onStart: AnyToVoidFunction,
  onEnd: AnyToVoidFunction,
  isDisabled: MaybeAccessor<boolean | undefined> = false,
) => {
  const lastOnStart = onStart;
  const lastOnEnd = onEnd;

  createEffect(
    () => read(isDisabled),
    (isDisabled2) => {
      if (isDisabled2) {
        return undefined;
      }

      if (isActive) {
        lastOnStart();
      }

      startCallbacks.addCallback(lastOnStart);
      endCallbacks.addCallback(lastOnEnd);

      return () => {
        endCallbacks.removeCallback(lastOnEnd);
        startCallbacks.removeCallback(lastOnStart);
      };
    },
  );
};

export function isPriorityPlaybackActive() {
  return isActive;
}

export function dispatchPriorityPlaybackEvent() {
  if (!isActive) {
    isActive = true;
    startCallbacks.runCallbacks();
  }

  if (timeout) {
    clearTimeout(timeout);
    timeout = undefined;
  }

  // Race condition may happen if another `dispatchPriorityPlaybackEvent` is called before `onEnd`
  function onEnd() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }

    isActive = false;
    endCallbacks.runCallbacks();
  }

  return onEnd;
}

export default usePriorityPlaybackCheck;
