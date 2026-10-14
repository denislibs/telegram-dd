import { createEffect, requestMeasure } from 'frameact';
import { depsOf } from '../util/effectDeps';

import { IS_TOUCH_ENV } from '../util/browser/windowEnvironment';
import focusNoScroll from '../util/focusNoScroll';

const MODAL_HIDE_DELAY_MS = 300;

// TODO(codemod): useInputFocusOnOpen: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useInputFocusOnOpen(
  inputRef: (el: HTMLInputElement | HTMLTextAreaElement) => void,
  isOpen?: boolean,
  onClose?: NoneToVoidFunction,
) {
  createEffect(
    depsOf(() => [inputRef, isOpen, onClose]),
    () => {
      if (isOpen) {
        if (!IS_TOUCH_ENV && inputRef.current?.isConnected) {
          requestMeasure(() => {
            focusNoScroll(inputRef.current);
          });
        }
      } else {
        if (inputRef.current?.isConnected) {
          inputRef.current.blur();
        }

        if (onClose) {
          setTimeout(onClose, MODAL_HIDE_DELAY_MS);
        }
      }
    },
  );
}
