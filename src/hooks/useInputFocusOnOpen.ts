import { createEffect, requestMeasure } from 'frameact';

import { type MaybeAccessor, read } from '../util/accessors';
import { IS_TOUCH_ENV } from '../util/browser/windowEnvironment';
import { depsOf } from '../util/effectDeps';
import focusNoScroll from '../util/focusNoScroll';

const MODAL_HIDE_DELAY_MS = 300;

export default function useInputFocusOnOpen(
  inputRef: MaybeAccessor<HTMLInputElement | HTMLTextAreaElement | undefined>,
  isOpen?: MaybeAccessor<boolean | undefined>,
  onClose?: NoneToVoidFunction,
) {
  createEffect(
    depsOf(() => [read(isOpen)] as const),
    ([isOpen2]) => {
      const input = read(inputRef);
      if (isOpen2) {
        if (!IS_TOUCH_ENV && input?.isConnected) {
          requestMeasure(() => {
            focusNoScroll(input);
          });
        }
      } else {
        if (input?.isConnected) {
          input.blur();
        }

        if (onClose) {
          setTimeout(onClose, MODAL_HIDE_DELAY_MS);
        }
      }
    },
  );
}
