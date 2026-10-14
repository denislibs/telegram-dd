import { createEffect } from 'frameact';

import { createSignal } from '../../util/signals';
import useLastCallback from '../useLastCallback';

const [getIsInBackgroundLocal, setIsInBackground] = createSignal(!document.hasFocus());
export const getIsInBackground = getIsInBackgroundLocal;

function handleBlur() {
  setIsInBackground(true);
}

function handleFocus() {
  setIsInBackground(false);
}

window.addEventListener('blur', handleBlur);
window.addEventListener('focus', handleFocus);

// TODO(codemod): useBackgroundMode: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useBackgroundMode(onBlur?: AnyToVoidFunction, onFocus?: AnyToVoidFunction, isDisabled = false) {
  const lastOnBlur = onBlur;
  const lastOnFocus = onFocus;

  createEffect(
    () => [isDisabled, lastOnBlur, lastOnFocus],
    () => {
      if (isDisabled) {
        return undefined;
      }

      if (getIsInBackground()) {
        lastOnBlur();
      }

      return getIsInBackground.subscribe(() => {
        if (getIsInBackground()) {
          lastOnBlur();
        } else {
          lastOnFocus();
        }
      });
    },
  );
}

export function isBackgroundModeActive() {
  return getIsInBackground();
}
