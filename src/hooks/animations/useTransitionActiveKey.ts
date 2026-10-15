import { type Accessor, createMemo } from 'frameact';

import { type MaybeAccessor, read } from '../../util/accessors';

/**
 * Use this hook to bind `<Transition />` animation to changes in the dependency array.
 * Use optional parameter `noAnimation` if you want to prevent the animation even if the dependency array changes.
 */
// Deviation: `deps` is an accessor of the array (read where tt re-rendered); the hook returns an accessor of the key.
// teact's `useSyncEffect` bumped the key during render, a memo bumps it when it is read: read the key continuously
// (it is the `activeKey` of a `<Transition>`).
export function useTransitionActiveKey(
  deps: Accessor<readonly unknown[]>,
  noAnimation?: MaybeAccessor<boolean | undefined>,
): Accessor<number> {
  let activeKey = 0;
  let prevDeps: readonly unknown[] | undefined;

  return createMemo(() => {
    const nextDeps = deps();
    const noAnimation2 = read(noAnimation);

    // teact compared the dependencies one by one, the memo reruns for every changed read inside `deps`.
    if (!prevDeps || prevDeps.length !== nextDeps.length || nextDeps.some((dep, i) => !Object.is(dep, prevDeps![i]))) {
      prevDeps = nextDeps;
      if (!noAnimation2) activeKey += 1;
    }

    return activeKey;
  });
}
