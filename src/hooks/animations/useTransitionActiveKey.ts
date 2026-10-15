import { createEffect } from 'frameact';
import { depsOf } from '../../util/effectDeps';

import useSyncEffect from '../useSyncEffect';

/**
 * Use this hook to bind `<Transition />` animation to changes in the dependency array.
 * Use optional parameter `noAnimation` if you want to prevent the animation even if the dependency array changes.
 */
// TODO(codemod): useTransitionActiveKey: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export function useTransitionActiveKey(deps: unknown[], noAnimation?: boolean): number {
  let activeKeyRef = 0;

  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(
    depsOf(() => [...deps]),
    () => {
      if (!noAnimation) activeKeyRef += 1;
      // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
    },
  );

  return activeKeyRef;
}
