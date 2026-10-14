import { createEffect } from 'frameact';

import useLastCallback from '../useLastCallback';

// TODO(codemod): useTimeout: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
function useTimeout(callback: NoneToVoidFunction, delay?: number) {
  const savedCallback = callback;

  createEffect(
    () => delay,
    () => {
      if (typeof delay !== 'number') {
        return undefined;
      }

      const id = setTimeout(() => savedCallback(), delay);
      return () => clearTimeout(id);
    },
  );
}

export default useTimeout;
