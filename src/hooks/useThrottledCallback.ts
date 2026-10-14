import { createMemo } from 'frameact';

import type { Scheduler } from '../util/schedulers';

import { throttle, throttleWith } from '../util/schedulers';

// TODO(codemod): useThrottledCallback: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useThrottledCallback<T extends AnyToVoidFunction>(
  fn: T,
  deps: any[],
  msOrSchedulerFn: number | Scheduler,
  noFirst = false,
) {
  // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
  const fnMemo = fn;

  return createMemo(() => {
    if (typeof msOrSchedulerFn === 'number') {
      return throttle(fnMemo, msOrSchedulerFn, !noFirst);
    } else {
      return throttleWith(msOrSchedulerFn, fnMemo);
    }
  });
}
