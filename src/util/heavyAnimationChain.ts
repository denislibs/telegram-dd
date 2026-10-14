// Original file (not in telegram-tt). tt's `useHeavyAnimation` and `getIsHeavyAnimating` are global: any heavy animation
// pauses a sticker or a video. In frameact `getIsHeavyAnimating` is the ROOT scope only, and `watchHeavyAnimation` hears
// only the scope of its own subtree (a `Transition` slide has its own); the effect gating, by contrast, walks the whole
// chain (scope -> parent -> ... -> root). A component that must behave like tt (pause for every animation, never wait for
// one it cannot hear) therefore asks the chain itself.
// TODO(frameact#engine-gaps): the engine fix (a scope listener that hears ancestor animations, plus an exported
// `isHeavyAnimating(scope)` with chain semantics, branch fix/engine-gaps-auth) makes this file a re-export.
import { currentHeavyAnimationScope, type HeavyAnimationScope, onDestroy, onHeavyAnimation } from 'frameact';

/** Is `scope` or any ancestor (root included) animating right now? */
export function isHeavyAnimatingInChain(scope: HeavyAnimationScope = currentHeavyAnimationScope()): boolean {
  for (let current: HeavyAnimationScope | null = scope; current; current = current.parent) {
    if (current.isAnimating.peek()) return true;
  }
  return false;
}

/**
 * `onStart` when the chain of the current owner's scope turns busy, `onEnd` when it is idle again (counting the
 * animating scopes of the chain: nested animations make one start and one end). Like `onHeavyAnimation` it calls
 * `onStart` at once when a scope is animating already. Call it in a component body: it unsubscribes with the owner.
 */
export function watchHeavyAnimationInChain(
  onStart: () => void,
  onEnd: () => void,
  scope: HeavyAnimationScope = currentHeavyAnimationScope(),
) {
  let busy = 0;
  const unsubscribe: (() => void)[] = [];
  for (let current: HeavyAnimationScope | null = scope; current; current = current.parent) {
    unsubscribe.push(
      onHeavyAnimation(
        () => {
          busy++;
          if (busy === 1) onStart();
        },
        () => {
          busy--;
          if (busy === 0) onEnd();
        },
        current,
      ),
    );
  }
  const stop = () => unsubscribe.forEach((fn) => fn());
  onDestroy(stop);
  return stop;
}
