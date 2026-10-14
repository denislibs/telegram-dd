// Original file (not in telegram-tt). teact compared the dependency array of an effect element by element; frameact's
// `createEffect` compares the value its compute returns with `!==`, so a compute that returns a NEW array each run
// re-applies the effect on every run of the compute, even when no dependency changed by value
// (`useInterval`'s `[delay, noFirst]` with a delay derived from a ticking signal reset its timer on every tick).
// `createEffect(depsOf(() => [a, b] as const), apply)` returns the previous array while its elements are the same;
// the codemod's `effectDeps` rule emits this shape.

export function depsOf<T extends readonly unknown[]>(compute: () => T): (last: T | undefined) => T {
  return (last) => {
    const next = compute();
    if (last && last.length === next.length && next.every((value, index) => Object.is(value, last[index]))) {
      return last;
    }
    return next;
  };
}
