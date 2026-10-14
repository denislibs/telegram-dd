import { debounce } from '../util/schedulers';

// Deviation: `fn` reads accessors when called, so it is never stale: `deps` is ignored (kept for call sites).
export default function useDebouncedCallback<T extends AnyToVoidFunction>(
  fn: T,
  deps: any[],
  ms: number,
  noFirst = false,
  noLast = false,
) {
  return debounce(fn, ms, !noFirst, !noLast);
}
