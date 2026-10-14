import { createEffect, createSignal } from 'frameact';

import { type MaybeAccessor, read } from '../../../../util/accessors';

// Deviation: a hook runs once, so `shouldHideSearch` is a `MaybeAccessor` and the ref object (+ `forceUpdate`) is a
// signal: the result is `shouldDisableDropdownMenuTransition` (an accessor, tt's `shouldDisableDropdownMenuTransitionRef.current`).
export default function useLeftHeaderButtonRtlForumTransition(shouldHideSearch?: MaybeAccessor<boolean | undefined>) {
  const [shouldDisableDropdownMenuTransition, setShouldDisableDropdownMenuTransition] = createSignal(
    read(shouldHideSearch),
  );

  function handleDropdownMenuTransitionEnd() {
    setShouldDisableDropdownMenuTransition(Boolean(read(shouldHideSearch)));
  }

  // tt did this during render when `shouldHideSearch` turned from something else to `false`
  createEffect(
    () => read(shouldHideSearch),
    (value) => {
      if (value === false) {
        setShouldDisableDropdownMenuTransition(false);
      }
    },
  );

  return { shouldDisableDropdownMenuTransition, handleDropdownMenuTransitionEnd };
}
