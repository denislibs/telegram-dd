import { createEffect } from 'frameact';

import { type MaybeAccessor, read } from '../util/accessors';
import { IS_TOUCH_ENV } from '../util/browser/windowEnvironment';
import { depsOf } from '../util/effectDeps';

const MENU_CLOSE_TIMEOUT = 250;
let closeTimeout: number | undefined;

// Deviation: `isOpen`, `menuCloseTimeout` and `isDisabled` are `MaybeAccessor`s. `onClose` is called when the timer fires,
// so a caller whose handler can change passes a forwarder (`() => props.onClose()`).
export default function useMouseInside(
  isOpen: MaybeAccessor<boolean | undefined>,
  onClose: NoneToVoidFunction,
  menuCloseTimeout: MaybeAccessor<number> = MENU_CLOSE_TIMEOUT,
  isDisabled: MaybeAccessor<boolean | undefined> = false,
) {
  let isMouseInside = false;

  const markMouseInside = () => {
    isMouseInside = true;
  };

  createEffect(
    depsOf(() => [read(isDisabled), read(isOpen), read(menuCloseTimeout)] as const),
    ([isDisabled2, isOpen2, menuCloseTimeout2]) => {
      if (closeTimeout) {
        clearTimeout(closeTimeout);
        closeTimeout = undefined;
      }

      if (isOpen2 && !IS_TOUCH_ENV && !isDisabled2) {
        closeTimeout = window.setTimeout(() => {
          if (!isMouseInside && document.hasFocus()) {
            onClose();
          }
        }, menuCloseTimeout2 * 2);
      }
    },
  );

  const handleMouseEnter = () => {
    isMouseInside = true;
  };

  const handleMouseLeave = () => {
    isMouseInside = false;

    if (closeTimeout) {
      clearTimeout(closeTimeout);
      closeTimeout = undefined;
    }

    closeTimeout = window.setTimeout(() => {
      if (!isMouseInside) {
        onClose();
      }
    }, read(menuCloseTimeout));
  };

  return [handleMouseEnter, handleMouseLeave, markMouseInside] as const;
}
