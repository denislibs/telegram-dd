import { type Accessor, createSignal } from 'frameact';

import type { MaybeAccessor } from '../../util/accessors';

import useInterval from './useInterval';

// Deviation: there is no force update in a component that runs once. The hook returns a tick accessor that changes
// every `interval` ms: a computation that depends on the time (a relative "last seen") reads it.
export default function useIntervalForceUpdate(interval?: MaybeAccessor<number | undefined>): Accessor<number> {
  const [tick, setTick] = createSignal(0);

  useInterval(() => setTick((value) => value + 1), interval, true);

  return tick;
}
