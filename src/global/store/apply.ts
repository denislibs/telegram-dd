// The bridge between telegram-tt's immutable `setGlobal(newGlobal)` and frameact's in-place store (docs/store-architecture.md).
//
// A tt reducer returns `{ ...global, chats: { ...global.chats, byId: { ...byId, [id]: chat } } }`: every object on the
// written path is a fresh copy, everything else is the same reference as before (structural sharing). `applyGlobal`
// walks `next` against the raw store tree and stops at every `===` branch, so its cost is the key width along the
// changed paths, not the size of the state. Where it finds a difference it writes that leaf through `setState`, which
// notifies only the signals of that leaf — the component layer never sees a root replacement.
//
// Rules (they match frameact's `reconcile`, so a hot path can switch to `setState(…path, reconcile(chunk))` later
// without a change in behaviour):
//  - two plain objects are merged in place, key by key; an object with another `id` is another entity and replaces;
//  - arrays are values: replaced whole when their content differs (same length, every item `===` → nothing happens);
//  - `undefined` deletes the key (tt kept the key with an `undefined` value; `in` / `Object.keys` differ, reads do not);
//  - class instances, Dates, frozen objects are values (frameact never wraps them) and replace.
//
// Every effective write is also recorded in a journal, converted on demand into telegram-tt's `deepDiff` format
// (`{ key: value | subDiff | { __delete: true } }`), the format tt broadcasts between tabs and applies with `deepMerge`.
// `deepMerge` merges key by key, so a replaced object has to be spelled out against what the receiver holds: a
// whole-value write remembers the object it detached (`base`) and the entry it supersedes (`before`), and the conversion
// emits `before ⊕ deepDiff(base, current)`. One journal covers one callback run; it is never composed across runs.
import { unwrap } from 'frameact/store';

import { deepDiff } from '../../util/deepDiff';
import { isLiteralObject } from '../../util/iteratees';

/** The same `setState` shape frameact exports, without the 7-key typing: the walk builds paths at run time. */
export type UntypedSetState = (...pathAndValue: unknown[]) => void;

/** tt's deletion marker (`src/util/deepDiff.ts`). */
export const DELETE_MARK = { __delete: true } as const;

/** DEV stamp telegram-tt puts on the global it hands out (`getGlobal()`); never stored. */
export const DEBUG_RANDOM_ID_KEY = 'DEBUG_randomId';

/**
 * A journal node: per key, the latest effective write.
 *  - a sub-journal: the object at the key was merged in place (its own keys journaled below);
 *  - a value entry: the key was written whole. `cur` is the written value (the live object of the tree from now on,
 *    so later in-place writes into it need no record), `base` the value it detached, `before` the entry it supersedes.
 *    `live` (the base was not a plain object: the receiver has nothing to merge into) converts to the value itself,
 *    otherwise to `before ⊕ deepDiff(base, cur)` — what turns the receiver's object into `cur`;
 *  - a delete entry: the key is gone; it keeps what it deleted for a later write under the same key.
 */
type ValueEntry = { cur: unknown; base: unknown; live: boolean; before?: Entry };
type DeleteEntry = { del: true; base: unknown; before?: Entry };
type Entry = Journal | ValueEntry | DeleteEntry;
export type Journal = { [key: string]: Entry } & { __isJournal: true };

const JOURNAL_TAG = '__isJournal';

export function createJournal(): Journal {
  const j = {} as Journal;
  Object.defineProperty(j, JOURNAL_TAG, { value: true, enumerable: false });
  return j;
}

const isJournal = (e: unknown): e is Journal => Boolean(e) && (e as Journal)[JOURNAL_TAG] === true;
const isDeleteEntry = (e: unknown): e is DeleteEntry => Boolean(e) && (e as DeleteEntry).del === true;

function journalSet(journal: Journal | undefined, key: string, prev: unknown, value: unknown) {
  if (!journal) return;
  const existing = journal[key];
  if (value === undefined) {
    if (!isDeleteEntry(existing)) journal[key] = { del: true, base: prev, before: existing };
    return;
  }
  // After a deletion the receiver (once the diff is applied) still holds what was deleted: continue from there.
  const base = isDeleteEntry(existing) ? existing.base : prev;
  const before = isDeleteEntry(existing) ? existing.before : existing;
  const live = !(isLiteralObject(base) && isLiteralObject(value));
  journal[key] = { cur: value, base, live, before: live ? undefined : before };
}

function journalChild(journal: Journal | undefined, key: string): Journal | undefined {
  if (!journal) return undefined;
  const entry = journal[key];
  if (isJournal(entry)) return entry;
  if (entry === undefined) return (journal[key] = createJournal());
  return undefined; // a value entry: `cur` is the live object, the conversion diffs it as it is then
}

function diffOfEntry(entry: Entry): unknown {
  if (isJournal(entry)) return journalToDiff(entry) ?? {};
  if (isDeleteEntry(entry)) return DELETE_MARK;
  if (entry.live) return entry.cur;
  const own = deepDiff(entry.base, entry.cur);
  const ownDiff = typeof own === 'symbol' ? {} : (own as AnyLiteral);
  if (entry.before === undefined) return ownDiff;
  return mergeDiffs(diffOfEntry(entry.before) as AnyLiteral, ownDiff) ?? ownDiff;
}

/** The journal as a tt `deepDiff` object (`undefined` when nothing was written). */
export function journalToDiff(journal: Journal): AnyLiteral | undefined {
  const keys = Object.keys(journal);
  if (keys.length === 0) return undefined;
  const diff: AnyLiteral = {};
  for (const key of keys) {
    const entry = journal[key];
    const value = diffOfEntry(entry);
    if (isJournal(entry) && Object.keys(value as AnyLiteral).length === 0) continue;
    diff[key] = value;
  }
  return Object.keys(diff).length ? diff : undefined;
}

/**
 * Compose two tt diffs of the same base, `b` after `a`: a later value or deletion wins, two object diffs merge key by
 * key (what `deepMerge` produces when applying them in turn). A plain value cannot express "replace the receiver's
 * object" after a deletion, which is why the journal keeps `base` and this function is only used on its own output.
 */
export function mergeDiffs(a: AnyLiteral | undefined, b: AnyLiteral | undefined): AnyLiteral | undefined {
  if (!a) return b;
  if (!b) return a;
  const out: AnyLiteral = { ...a };
  for (const key of Object.keys(b)) {
    const av = out[key];
    const bv = b[key];
    out[key] =
      isLiteralObject(av) && isLiteralObject(bv) && !isDeletion(av) && !isDeletion(bv) ? mergeDiffs(av, bv) : bv;
  }
  return out;
}

const isDeletion = (v: AnyLiteral) => v.__delete === true || v.__deleteAllChildren === true;

/**
 * Own-key counts of the container objects the walk has visited. `Object.keys(raw)` on a 2k-key dictionary costs more
 * than the comparison loop itself, and it is needed only to tell whether `next` dropped keys; since every write into
 * the tree goes through this walk, the count can be kept instead. `verifyKeyCounts` (DEV) checks it on every visit.
 */
const keyCounts = new WeakMap<object, number>();
let verifyKeyCounts = false;

/** DEV: recount the keys of every visited object and throw when a write bypassed the walk. */
export function setStrictKeyCounts(enabled: boolean) {
  verifyKeyCounts = enabled;
}

function keyCountOf(raw: object): number {
  let count = keyCounts.get(raw);
  if (count === undefined || verifyKeyCounts) {
    const actual = Object.keys(raw).length;
    if (count !== undefined && count !== actual) {
      throw new Error(`[global] the store was written outside setGlobal: ${count} keys expected, ${actual} found`);
    }
    count = actual;
    keyCounts.set(raw, count);
  }
  return count;
}

function sameEntity(prev: AnyLiteral, next: AnyLiteral) {
  return prev.id === next.id;
}

function areArraysShallowEqual(prev: unknown[], next: unknown[]) {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== next[i]) return false;
  }
  return true;
}

/**
 * Merge `next` into the raw object `raw` (which lives in the store at `path`), writing changed leaves through
 * `setState` and recording them in `journal`. Returns `true` when anything was written.
 */
export function applyObject(
  setState: UntypedSetState,
  raw: AnyLiteral,
  next: AnyLiteral,
  path: PropertyKey[],
  journal: Journal | undefined,
  isRoot = false,
): boolean {
  let written = false;
  const rawCount = keyCountOf(raw);
  let count = rawCount;
  const nextKeys = Object.keys(next);
  let present = 0;

  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i];
    if (key === '__proto__') continue;
    let nv = next[key];
    let pv = raw[key];
    let has = pv !== undefined;
    if (!has) {
      has = Object.hasOwn(raw, key);
      pv = undefined;
    }
    if (has) present++;
    if (isRoot && key === DEBUG_RANDOM_ID_KEY) continue; // (counted as present or not like any key, never written)
    if (nv === pv) continue;
    if (nv && typeof nv === 'object') {
      nv = unwrap(nv); // a proxy handed in from a component
      if (nv === pv) continue;
    }

    if (Array.isArray(nv)) {
      if (Array.isArray(pv) && areArraysShallowEqual(pv, nv)) continue;
    } else if (isLiteralObject(nv) && isLiteralObject(pv) && sameEntity(pv, nv)) {
      if (applyObject(setState, pv, nv, path.concat(key), journalChild(journal, key))) written = true;
      continue;
    }

    setState(...path, key, nv);
    journalSet(journal, key, pv, nv);
    written = true;
    if (nv === undefined) {
      count--; // an explicit `undefined` in `next` deletes the key
    } else if (!has) {
      count++;
    }
  }

  if (present !== rawCount) {
    const rawKeys = Object.keys(raw);
    for (let i = 0; i < rawKeys.length; i++) {
      const key = rawKeys[i];
      if (Object.hasOwn(next, key)) continue;
      if (isRoot && key === DEBUG_RANDOM_ID_KEY) continue;
      const pv = raw[key];
      setState(...path, key, undefined);
      journalSet(journal, key, pv, undefined);
      written = true;
      count--;
    }
  }
  if (count !== rawCount) keyCounts.set(raw, count);

  return written;
}

/** `setGlobal(next)`: merge a tt-style immutable global into the raw root. */
export function applyGlobal(
  setState: UntypedSetState,
  root: AnyLiteral,
  next: AnyLiteral,
  journal: Journal | undefined,
): boolean {
  const target = unwrap(next);
  if (target === root) return false;
  return applyObject(setState, root, target, [], journal, true);
}
