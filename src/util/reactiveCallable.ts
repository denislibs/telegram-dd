// Original file (not in telegram-tt). `lang` of telegram-tt is a function object that `useLang()` re-creates for a
// component whenever the language changes (`useForceUpdate`). A frameact component body runs once, so the hooks return
// ONE stable function object instead, whose calls and property reads track a version signal: `lang('Key')` inside
// JSX, a memo or an effect compute re-runs when the language (or the time format) changes, and outside a computation
// (a handler) it is an ordinary call.
import { createSignal } from 'frameact';

export function createReactiveCallable<F extends (...args: any[]) => unknown>(
  getCurrent: () => F,
  subscribe: (callback: NoneToVoidFunction) => unknown,
): F {
  const [version, setVersion] = createSignal(0);
  subscribe(() => setVersion((value) => value + 1));

  return new Proxy(function reactiveCallable() {} as unknown as F, {
    apply(_target, thisArg, args) {
      version();
      return Reflect.apply(getCurrent(), thisArg, args);
    },
    get(_target, property) {
      version();
      return Reflect.get(getCurrent(), property);
    },
    has(_target, property) {
      return Reflect.has(getCurrent(), property);
    },
  });
}
