import { createEffect, previous } from 'frameact';

import useForceUpdate from './useForceUpdate';
import usePreviousDeprecated from './usePreviousDeprecated';
import useSyncEffect from './useSyncEffect';

const SWAP_CLOSE_DURATION = 150;

// TODO(codemod): useShowTransitionSwap: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useShowTransitionSwap(isOpen: boolean, contentKey?: string): boolean {
  const prevIsOpen = previous(() => isOpen);
  const prevContentKey = previous(() => contentKey);
  let isSwappingRef = false;
  // TODO(codemod): useForceUpdate: a component runs once; make the changing value a signal and delete the force update
  const forceUpdate = useForceUpdate();

  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (
    isOpen &&
    prevIsOpen() &&
    contentKey !== undefined &&
    prevContentKey() !== undefined &&
    prevContentKey() !== contentKey &&
    !isSwappingRef
  ) {
    isSwappingRef = true;
  }

  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(
    () => contentKey,
    () => {
      if (!isSwappingRef) return undefined;
      const timer = window.setTimeout(() => {
        isSwappingRef = false;
        forceUpdate();
      }, SWAP_CLOSE_DURATION);
      return () => clearTimeout(timer);
    },
  );

  return isOpen && !isSwappingRef;
}
