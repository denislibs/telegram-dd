import { createMemo } from 'frameact';

import { debounce } from '../util/schedulers';

// TODO(codemod): useDebouncedCallback: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useDebouncedCallback<T extends AnyToVoidFunction>(
  fn: T,
  deps: any[],
  ms: number,
  noFirst = false,
  noLast = false,
) {
  // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
  const fnMemo = fn;

  return createMemo(() => {
    return debounce(fnMemo, ms, !noFirst, !noLast);
  });
}
