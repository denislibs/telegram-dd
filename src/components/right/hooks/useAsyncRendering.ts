import { createEffect } from 'frameact';

import useForceUpdate from '../../../hooks/useForceUpdate';

// TODO(codemod): useAsyncRendering: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useAsyncRendering<T extends any[]>(dependencies: T, delay?: number) {
  const isDisabled = delay === undefined;
  let shouldRenderRef = isDisabled;
  let timeoutRef: number | undefined;
  // TODO(codemod): useForceUpdate: a component runs once; make the changing value a signal and delete the force update
  const forceUpdate = useForceUpdate();

  // TODO(codemod): useSyncEffect without a dependency array ran after every render: name the tracked reads in the compute half
  createEffect(
    () => undefined,
    () => {
      if (isDisabled) {
        return;
      }

      shouldRenderRef = false;

      if (timeoutRef) {
        clearTimeout(timeoutRef);
        timeoutRef = undefined;
      }
      // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
    },
    dependencies,
  );

  // TODO(codemod): useEffect without a dependency array ran after every render: name the tracked reads in the compute half
  createEffect(
    () => undefined,
    () => {
      if (isDisabled || shouldRenderRef) {
        return;
      }

      const exec = () => {
        shouldRenderRef = true;
        forceUpdate();
      };

      if (delay > 0) {
        timeoutRef = window.setTimeout(exec, delay);
      } else {
        exec();
      }
      // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
    },
    dependencies,
  );

  return shouldRenderRef;
}
