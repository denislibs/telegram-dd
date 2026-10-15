import { type Accessor, createEffect, createSignal } from 'frameact';

import { type MaybeAccessor, read } from '../../../util/accessors';
import { depsOf } from '../../../util/effectDeps';

// Deviation: `dependencies` and `delay` are `MaybeAccessor`s and the result is an accessor. tt reset the flag with
// `useSyncEffect` (during the render in which the dependencies changed); here one tickEnd effect resets it and books the
// timer, so the content of the previous dependencies shows until the tick end of the change.
export default function useAsyncRendering<T extends readonly unknown[]>(
  dependencies: MaybeAccessor<T>,
  delay?: MaybeAccessor<number | undefined>,
): Accessor<boolean> {
  const [shouldRender, setShouldRender] = createSignal(read(delay) === undefined);

  createEffect(
    depsOf(() => [...read(dependencies), read(delay)] as const),
    (deps) => {
      const delay2 = deps[deps.length - 1] as number | undefined;
      if (delay2 === undefined) {
        setShouldRender(true);
        return undefined;
      }

      setShouldRender(false);

      if (delay2 > 0) {
        const timeout = window.setTimeout(() => setShouldRender(true), delay2);

        return () => {
          clearTimeout(timeout);
        };
      }

      setShouldRender(true);
      return undefined;
    },
  );

  return shouldRender;
}
