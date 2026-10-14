import { previous } from 'frameact';

import useForceUpdate from '../../../../hooks/useForceUpdate';

// TODO(codemod): useLeftHeaderButtonRtlForumTransition: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useLeftHeaderButtonRtlForumTransition(shouldHideSearch?: boolean) {
  // TODO(codemod): useForceUpdate: a component runs once; make the changing value a signal and delete the force update
  const forceUpdate = useForceUpdate();
  let shouldDisableDropdownMenuTransitionRef = shouldHideSearch;
  const prevShouldHideSearch = previous(() => shouldHideSearch);

  function handleDropdownMenuTransitionEnd() {
    shouldDisableDropdownMenuTransitionRef = Boolean(shouldHideSearch);
    forceUpdate();
  }

  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (shouldHideSearch === false && prevShouldHideSearch() !== shouldHideSearch) {
    shouldDisableDropdownMenuTransitionRef = false;
  }

  // TODO(codemod): "shouldDisableDropdownMenuTransitionRef" was a ref object passed as a value: pass an accessor (() => shouldDisableDropdownMenuTransitionRef) or a callback ref
  return { shouldDisableDropdownMenuTransitionRef, handleDropdownMenuTransitionEnd };
}
