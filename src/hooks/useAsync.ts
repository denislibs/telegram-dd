import { createEffect, createSignal } from 'frameact';

function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  defaultValue: T,
): {
  isLoading: boolean;
  error: Error | undefined;
  result: T;
};
function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
): {
  isLoading: boolean;
  error: Error | undefined;
  result: T | undefined;
};
// TODO(codemod): useAsync: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
function useAsync<T>(fn: () => Promise<T>, deps: unknown[], defaultValue?: T) {
  const [isLoading, setIsLoading] = createSignal<boolean>(false);
  const [error, setError] = createSignal<Error | undefined>(undefined);
  const [result, setResult] = createSignal<T | undefined>(defaultValue);
  // TODO(codemod): useEffect without a dependency array ran after every render: name the tracked reads in the compute half
  createEffect(
    () => undefined,
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
      // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
    },
    deps,
  );
  return { isLoading, error, result };
}

export default useAsync;
