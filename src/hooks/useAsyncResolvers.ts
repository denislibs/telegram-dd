import { createMemo } from 'frameact';

import type { Scheduler } from '../util/schedulers';
import type { Signal } from '../util/signals';

import useDebouncedCallback from './useDebouncedCallback';
import useDerivedSignal from './useDerivedSignal';
import useThrottledCallback from './useThrottledCallback';

// TODO(codemod): useThrottledResolver: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export function useThrottledResolver<T>(
  resolver: () => T,
  deps: any[],
  msOrSchedulerFn: number | Scheduler,
  noFirst = false,
) {
  return useThrottledCallback(
    (setValue: (newValue: T) => void) => {
      setValue(resolver());
      // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
    },
    deps,
    msOrSchedulerFn,
    noFirst,
  );
}

// TODO(codemod): useThrottledSignal: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export function useThrottledSignal<T>(getValue: Signal<T>, ms: number, noFirst = false): Signal<T> {
  const throttledResolver = useThrottledResolver(() => getValue(), [getValue], ms, noFirst);

  return createMemo(throttledResolver);
}

// TODO(codemod): useDebouncedResolver: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export function useDebouncedResolver<T>(resolver: () => T, deps: any[], ms: number, noFirst = false, noLast = false) {
  return useDebouncedCallback(
    (setValue: (newValue: T) => void) => {
      setValue(resolver());
      // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
    },
    deps,
    ms,
    noFirst,
    noLast,
  );
}

// TODO(codemod): useDebouncedSignal: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export function useDebouncedSignal<T>(getValue: Signal<T>, ms: number, noFirst = false, noLast = false): Signal<T> {
  const debouncedResolver = useDebouncedResolver(() => getValue(), [getValue], ms, noFirst, noLast);

  return createMemo(debouncedResolver);
}
