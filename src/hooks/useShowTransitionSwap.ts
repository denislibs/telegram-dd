import { type Accessor, createEffect, createMemo, createSignal } from 'frameact';

import { type MaybeAccessor, read } from '../util/accessors';
import { depsOf } from '../util/effectDeps';

const SWAP_CLOSE_DURATION = 150;

// Deviation: arguments are `MaybeAccessor`s and the result is an accessor. teact kept `isSwappingRef` + `usePrevious*` in
// the render body and forced an update from the timer; here one memo remembers the previous values itself (it runs
// whenever either input changes, as the render did) and the timer bumps a version signal that the memo reads.
export default function useShowTransitionSwap(
  isOpen: MaybeAccessor<boolean>,
  contentKey?: MaybeAccessor<string | undefined>,
): Accessor<boolean> {
  const [version, setVersion] = createSignal(0);
  let wasOpen = false;
  let prevContentKey: string | undefined;
  let isSwapping = false;

  const effectiveIsOpen = createMemo(() => {
    version();
    const isOpen2 = read(isOpen);
    const contentKey2 = read(contentKey);

    if (
      isOpen2 &&
      wasOpen &&
      contentKey2 !== undefined &&
      prevContentKey !== undefined &&
      prevContentKey !== contentKey2 &&
      !isSwapping
    ) {
      isSwapping = true;
    }

    wasOpen = isOpen2;
    prevContentKey = contentKey2;

    return isOpen2 && !isSwapping;
  });

  createEffect(
    depsOf(() => [read(contentKey), effectiveIsOpen()] as const),
    () => {
      if (!isSwapping) return undefined;
      const timer = window.setTimeout(() => {
        isSwapping = false;
        setVersion((current) => current + 1);
      }, SWAP_CLOSE_DURATION);
      return () => clearTimeout(timer);
    },
  );

  return effectiveIsOpen;
}
