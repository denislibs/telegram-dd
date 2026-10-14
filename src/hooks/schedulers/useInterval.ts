import { createEffect } from 'frameact';

import { type MaybeAccessor, read } from '../../util/accessors';

function useInterval(
  callback: NoneToVoidFunction,
  delay?: MaybeAccessor<number | undefined>,
  noFirst: MaybeAccessor<boolean> = false,
) {
  createEffect(
    () => [read(delay), read(noFirst)] as const,
    ([delay2, noFirst2]) => {
      if (delay2 === undefined) {
        return undefined;
      }

      const id = setInterval(() => callback(), delay2);
      if (!noFirst2) callback();

      return () => clearInterval(id);
    },
  );
}

export default useInterval;
