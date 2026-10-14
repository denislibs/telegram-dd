import { createEffect } from 'frameact';

import useLastCallback from '../useLastCallback';

// TODO(codemod): useInterval: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
function useInterval(callback: NoneToVoidFunction, delay?: number, noFirst = false) {
  const savedCallback = callback;

  createEffect(
    () => [delay, noFirst],
    () => {
      if (delay === undefined) {
        return undefined;
      }

      const id = setInterval(() => savedCallback(), delay);
      if (!noFirst) savedCallback();

      return () => clearInterval(id);
    },
  );
}

export default useInterval;
