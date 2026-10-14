import type { Scheduler } from '../util/schedulers';

import { throttle, throttleWith } from '../util/schedulers';

// Deviation: `fn` reads accessors when called, so it is never stale: `deps` is ignored (kept for call sites).
export default function useThrottledCallback<T extends AnyToVoidFunction>(
  fn: T,
  deps: any[],
  msOrSchedulerFn: number | Scheduler,
  noFirst = false,
) {
  if (typeof msOrSchedulerFn === 'number') {
    return throttle(fn, msOrSchedulerFn, !noFirst);
  } else {
    return throttleWith(msOrSchedulerFn, fn);
  }
}
