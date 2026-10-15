import { createEffect } from 'frameact';
import { depsOf } from '../util/effectDeps';

import { IS_TOUCH_ENV } from '../util/browser/windowEnvironment';
import useLastCallback from './useLastCallback';

const MENU_CLOSE_TIMEOUT = 250;
let closeTimeout: number | undefined;

// TODO(codemod): useMouseInside: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useMouseInside(
  isOpen: boolean,
  onClose: NoneToVoidFunction,
  menuCloseTimeout = MENU_CLOSE_TIMEOUT,
  isDisabled = false,
) {
  let isMouseInsideRef = false;

  const markMouseInside = () => {
    isMouseInsideRef = true;
  };

  createEffect(
    depsOf(() => [isDisabled, isOpen, menuCloseTimeout, onClose]),
    () => {
      if (closeTimeout) {
        clearTimeout(closeTimeout);
        closeTimeout = undefined;
      }

      if (isOpen && !IS_TOUCH_ENV && !isDisabled) {
        closeTimeout = window.setTimeout(() => {
          if (!isMouseInsideRef && document.hasFocus()) {
            onClose();
          }
        }, menuCloseTimeout * 2);
      }
    },
  );

  const handleMouseEnter = () => {
    isMouseInsideRef = true;
  };

  const handleMouseLeave = () => {
    isMouseInsideRef = false;

    if (closeTimeout) {
      clearTimeout(closeTimeout);
      closeTimeout = undefined;
    }

    closeTimeout = window.setTimeout(() => {
      if (!isMouseInsideRef) {
        onClose();
      }
    }, menuCloseTimeout);
  };

  return [handleMouseEnter, handleMouseLeave, markMouseInside];
}
