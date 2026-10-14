// Original file (not in telegram-tt). Ported hooks run once, so a reactive parameter is passed as an accessor
// (`() => props.x`) and a constant as a plain value; `read` accepts both (porting guide §4.2, docs/codemod.md "hooks").
import type { Accessor } from 'frameact';

export type MaybeAccessor<T> = T | Accessor<T>;

export function read<T>(value: MaybeAccessor<T>): T {
  return typeof value === 'function' ? (value as Accessor<T>)() : value;
}
