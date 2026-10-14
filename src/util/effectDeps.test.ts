import { createEffect, createRoot, createSignal, flushSync } from 'frameact';
import { expect, it } from 'vitest';

import { depsOf } from './effectDeps';

it('depsOf: the apply runs when an element changes by value, not when the compute only re-ran', () => {
  const applied: unknown[] = [];
  const [tick, setTick] = createSignal(0);
  const [mode, setMode] = createSignal('a');
  const dispose = createRoot((stop) => {
    // `delay` depends on `tick` but keeps its value: the old `() => [delay(), mode()]` re-applied on every tick
    createEffect(
      depsOf(() => [(tick(), 1000), mode()] as const),
      (deps) => {
        applied.push(deps);
      },
    );
    return stop;
  });
  flushSync();
  expect(applied).toEqual([[1000, 'a']]);

  setTick(1);
  flushSync();
  setTick(2);
  flushSync();
  expect(applied).toHaveLength(1);

  setMode('b');
  flushSync();
  expect(applied).toEqual([
    [1000, 'a'],
    [1000, 'b'],
  ]);
  dispose();
});
