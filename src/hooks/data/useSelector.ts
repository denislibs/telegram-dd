import { type Accessor, createMemo } from 'frameact';
import { useGlobal } from '../../global';

import type { GlobalState } from '../../global/types';

import areShallowEqual from '../../util/areShallowEqual';

type Selector<T> = (global: GlobalState) => T;
type EqualityFn<T> = (oldValue: T, newValue: T) => boolean;

// In telegram-tt these hooks kept one signal per selector, refreshed from `addCallback` after every `setGlobal`. On the
// frameact store a selector over the tracked global subscribes to exactly the leaves it reads, so each hook is a memo:
// it returns an accessor (`const chat = useSelector(selectCurrentChat); chat()`), and its callers read it where tt read the value.

/**
 * @param selector - A stable or memoized selector function.
 */
export function useSelectorSignal<T>(selector: Selector<T>): Accessor<T> {
  const global = useGlobal();
  return createMemo(() => selector(global));
}

/**
 * @param selector - A stable or memoized selector function.
 */
function useSelector<T>(selector: Selector<T>): Accessor<T> {
  return useSelectorSignal(selector);
}

export function useSelectorSignalWithEquality<T>(selector: Selector<T>, equalityFn: EqualityFn<T>): Accessor<T> {
  const global = useGlobal();
  return createMemo(() => selector(global), { equals: equalityFn });
}

export function useSelectorWithEquality<T>(selector: Selector<T>, equalityFn: EqualityFn<T>): Accessor<T> {
  return useSelectorSignalWithEquality(selector, equalityFn);
}

export function useShallowSelectorSignal<T extends AnyLiteral | undefined>(selector: Selector<T>): Accessor<T> {
  return useSelectorSignalWithEquality(selector, areShallowEqual);
}

export function useShallowSelector<T extends AnyLiteral | undefined>(selector: Selector<T>): Accessor<T> {
  return useSelectorWithEquality(selector, areShallowEqual);
}

export default useSelector;
