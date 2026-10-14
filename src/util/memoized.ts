import { unwrap } from 'frameact/store';

import { areSortedArraysEqual } from './iteratees';

const cache = new WeakMap<AnyFunction, {
  lastArgs: any[];
  lastResult: any;
}>();

export default function memoized<T extends AnyFunction>(fn: T) {
  return (...args: Parameters<T>): ReturnType<T> => {
    // Deviation: a store proxy (a component's mapper) keeps its identity while its content changes, and a cache hit
    // would also skip the reads the mapper tracks — compute every time for proxies (the mapper is a memo anyway).
    if (args.some((arg) => arg && typeof arg === 'object' && unwrap(arg) !== arg)) {
      return fn(...args);
    }

    const cached = cache.get(fn);
    if (cached && areSortedArraysEqual(cached.lastArgs, args)) {
      return cached.lastResult;
    }

    const result = fn(...args);
    cache.set(fn, { lastArgs: args, lastResult: result });
    return result;
  };
}
