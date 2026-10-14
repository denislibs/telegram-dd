import { type Accessor, createEffect, createSignal } from 'frameact';

import { type MaybeAccessor, read } from '../util/accessors';

function useAsync<T>(
  fn: () => Promise<T>,
  deps: MaybeAccessor<unknown[]>,
  defaultValue: T,
): {
  isLoading: Accessor<boolean>;
  error: Accessor<Error | undefined>;
  result: Accessor<T>;
};
function useAsync<T>(
  fn: () => Promise<T>,
  deps: MaybeAccessor<unknown[]>,
): {
  isLoading: Accessor<boolean>;
  error: Accessor<Error | undefined>;
  result: Accessor<T | undefined>;
};
// Deviation: `deps` is an array or an accessor of one; the effect re-runs when a tracked read in it changes.
function useAsync<T>(fn: () => Promise<T>, deps: MaybeAccessor<unknown[]>, defaultValue?: T) {
  const [isLoading, setIsLoading] = createSignal<boolean>(false);
  const [error, setError] = createSignal<Error | undefined>(undefined);
  const [result, setResult] = createSignal<T | undefined>(defaultValue);
  createEffect(
    () => [...read(deps)],
    () => {
      setIsLoading(true);
      setError(undefined);
      let wasCancelled = false;
      fn().then(
        (res) => {
          if (wasCancelled) return;
          setIsLoading(false);
          setResult(res);
        },
        (err) => {
          if (wasCancelled) return;
          setIsLoading(false);
          setError(err);
        },
      );
      return () => {
        wasCancelled = true;
      };
    },
  );
  return { isLoading, error, result };
}

export default useAsync;
