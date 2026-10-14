import { createEffect } from 'frameact';

import { type MaybeAccessor, read } from '../../util/accessors';

function useTimeout(callback: NoneToVoidFunction, delay?: MaybeAccessor<number | undefined>) {
  createEffect(
    () => read(delay),
    (delay2) => {
      if (typeof delay2 !== 'number') {
        return undefined;
      }

      const id = setTimeout(() => callback(), delay2);
      return () => clearTimeout(id);
    },
  );
}

export default useTimeout;
