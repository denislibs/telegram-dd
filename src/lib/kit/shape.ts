// Original tg-frameact code (GPL-3.0-or-later).
// TODO: import { $SHAPE } from 'frameact/store' once frameact exports it (frameact PR feat/public-engine-exports),
// then delete this file. It is the same registered symbol, so behaviour is identical.
/**
 * The key a store array proxy answers with a number that changes on every shape change (O(1): one
 * subscription link, no copy; `undefined` on a non-array). The counterpart of the exported `$TRACK`, which also
 * builds an O(n) items array.
 */
export const $SHAPE: unique symbol = Symbol.for('frameact.shape') as never;
