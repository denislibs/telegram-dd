import { type Accessor, createEffect, createSignal, untrack } from 'frameact';

import type { Scheduler } from '../util/schedulers';

import useDebouncedCallback from './useDebouncedCallback';
import useThrottledCallback from './useThrottledCallback';

export function useThrottledResolver<T>(
  resolver: () => T,
  deps: any[],
  msOrSchedulerFn: number | Scheduler,
  noFirst = false,
) {
  return useThrottledCallback(
    (setValue: (newValue: T) => void) => {
      setValue(resolver());
    },
    deps,
    msOrSchedulerFn,
    noFirst,
  );
}

// Deviation: tt's `Signal` (`useDerivedSignal` with an async resolver) is an accessor of a frameact signal that follows
// `getValue` through the throttled resolver.
export function useThrottledSignal<T>(getValue: Accessor<T>, ms: number, noFirst = false): Accessor<T> {
  const [value, setValue] = createSignal<T>(untrack(getValue) as T);
  const throttledResolver = useThrottledResolver(() => getValue(), [getValue], ms, noFirst);

  createEffect(
    () => getValue(),
    () => throttledResolver((newValue) => setValue(() => newValue)),
  );

  return value;
}

export function useDebouncedResolver<T>(resolver: () => T, deps: any[], ms: number, noFirst = false, noLast = false) {
  return useDebouncedCallback(
    (setValue: (newValue: T) => void) => {
      setValue(resolver());
    },
    deps,
    ms,
    noFirst,
    noLast,
  );
}

// Deviation: see `useThrottledSignal`. The value is available at once (tt's derived signal was filled by its sync effect
// at the first render).
export function useDebouncedSignal<T>(getValue: Accessor<T>, ms: number, noFirst = false, noLast = false): Accessor<T> {
  const [value, setValue] = createSignal<T>(untrack(getValue) as T);
  const debouncedResolver = useDebouncedResolver(() => getValue(), [getValue], ms, noFirst, noLast);

  createEffect(
    () => getValue(),
    () => debouncedResolver((newValue) => setValue(() => newValue)),
  );

  return value;
}
