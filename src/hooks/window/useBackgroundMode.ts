import { createEffect } from 'frameact';

import { type MaybeAccessor, read } from '../../util/accessors';
import { createSignal } from '../../util/signals';

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

// Deviation: `isDisabled` is a value or an accessor; the callbacks are required (tt crashed on a missing one).
export default function useBackgroundMode(
  onBlur: AnyToVoidFunction,
  onFocus: AnyToVoidFunction,
  isDisabled: MaybeAccessor<boolean | undefined> = false,
) {
  const lastOnBlur = onBlur;
  const lastOnFocus = onFocus;

  createEffect(
    () => read(isDisabled),
    (isDisabled2) => {
      if (isDisabled2) {
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
