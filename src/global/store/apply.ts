// The bridge between telegram-tt's immutable global and frameact's in-place store (docs/store-architecture.md §1).
//
// The committed global is exactly the object tt would hold: a reducer returns `{ ...global, chats: { ...global.chats,
// byId: { ...byId, [id]: chat } } }` — fresh objects along the written path, the same references everywhere else — and
// `setGlobal(next)` commits `next` as is. The frameact store is a *mirror* of it that only components read:
// `applyGlobal(prev, next)` walks the two immutable globals, stops at every `===` branch (tt's structural sharing makes
// the unchanged 99.9 % free to skip) and writes each change into the store through `setState`, which notifies only the
// signals of that leaf.
//
// What the store holds, and why tt's value semantics survive:
//  - **Entities** (plain objects with an `id`: chats, users, messages, stickers, folders, …) and **arrays** are written
//    into the store **by reference** and replaced whole when they change. The store never writes into them, so an
//    object tt code took from `getGlobal()` is never mutated: captured snapshots, optimistic-update rollbacks,
//    WeakMap caches keyed by object identity and module constants (`INITIAL_TAB_STATE`) behave as in tt.
//  - **Containers** (every other plain object: the root, the slices, dictionaries such as `chats.byId`,
//    `messages.byChatId[id]`, `byTabId[id]` and the id-less records) are the store's **own shallow copies**, merged key
//    by key so that a change under them wakes only the readers of the changed key, not everything under the container.
//    The copies are private to the store; tt's objects stay untouched. `byTabId[id]` is a container although it has an
//    `id` (tt's tab id).
//  - A changed entity that is shallow-equal to the previous one is not written (a `replaceUsers` of 5k fresh copies
//    with 100 real changes is 100 writes). A changed array with the same items in the same order is not written.
//  - `undefined` deletes a key in a container (tt kept the key with `undefined`; `in`/`Object.keys` differ, reads do
//    not). Frozen objects, class instances and Dates are values (replaced), as frameact treats them.
//  - A store proxy inside `next` (a component handed `props.chat` to an action) is unwrapped: the committed global
//    gets the raw object, so `structuredClone` / `postMessage` of the global keep working. When that raw object is one
//    of the store's own container copies (an id-less record such as `ApiSavedStarGift`), the committed global gets a
//    fresh plain copy instead — the store's copy stays private, the next walk cannot reach the committed object through
//    it. This is done one level deep inside entities and arrays a component hands over; a DEV scan reports deeper ones.
import { unwrap } from 'frameact/store';

import { isLiteralObject } from '../../util/iteratees';

/** The same `setState` shape frameact exports, without the 7-key typing: the walk builds paths at run time. */
export type UntypedSetState = (...pathAndValue: unknown[]) => void;

/** DEV stamp telegram-tt puts on the global it hands out (`getGlobal()`); never mirrored into the store. */
export const DEBUG_RANDOM_ID_KEY = 'DEBUG_randomId';

/** A plain, unfrozen object: something the store would wrap. Arrays are values here. */
export function isPlainObject(value: unknown): value is AnyLiteral {
  return isLiteralObject(value) && !Object.isFrozen(value);
}

/**
 * The container rule: a plain object without an `id` is a structural container (the store keeps its own copy and
 * merges into it); one with an `id` is an entity (shared by reference, replaced whole). `byTabId[tabId]` is the one
 * container with an `id`.
 */
export function isContainer(value: unknown, path: readonly PropertyKey[]): value is AnyLiteral {
  if (!isPlainObject(value)) return false;
  if (!Object.hasOwn(value, 'id')) return true;
  return path.length === 2 && path[0] === 'byTabId';
}

/** The containers the store owns: the copies `copyContainer` made. They must never end up in the committed global. */
const ownedCopies = new WeakSet<object>();

/** @internal tests */
export const isStoreOwned = (value: unknown): boolean =>
  Boolean(value) && typeof value === 'object' && ownedCopies.has(value as object);

/**
 * A tt global is shallower than this by far (a container walk reaches ~10 levels). A value nested deeper is a cycle (a
 * structured clone from IndexedDB keeps them) or a corrupted value: refused with a clear error instead of a stack
 * overflow on every start (appsec review, finding 2).
 */
const MAX_DEPTH = 64;
function assertDepth(depth: number, path: PropertyKey[]) {
  if (depth > MAX_DEPTH) {
    throw new Error(
      `[global] the value at ${path.slice(0, 6).map(String).join('.')} is nested deeper than ${MAX_DEPTH} levels ` +
        'or contains a cycle',
    );
  }
}

let devChecks = false;
/** DEV: scan values written by reference for store proxies / owned copies nested deeper than `sanitize` looks. */
export function setDevChecks(enabled: boolean) {
  devChecks = enabled;
}

/** A fresh tt-side copy of a store-owned container (nested owned containers copied too; entities and arrays shared). */
function detach(owned: AnyLiteral, path: PropertyKey[]): AnyLiteral {
  const copy: AnyLiteral = { ...owned };
  const keys = Object.keys(copy);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key === '__proto__') continue;
    const child = copy[key];
    if (child && typeof child === 'object') copy[key] = sanitize(child, path.concat(key));
  }
  return copy;
}

/**
 * The tt-side value of something that may have come from a component: a store proxy becomes its raw object, a
 * store-owned container copy becomes a fresh plain copy, and inside an array or an entity the same is done for the
 * direct children (writing the fixed child back into that fresh array / object). Values that are tt's own objects
 * come back unchanged, so the common case costs one `unwrap` and a `WeakSet` lookup.
 */
function sanitize(value: object, path: PropertyKey[], depth = 0): object {
  assertDepth(depth, path);
  const raw = unwrap(value);
  if (ownedCopies.has(raw)) return detach(raw, path);
  let leaf = false; // an array or an entity: the only values written whole, so the only ones the DEV scan needs
  if (Array.isArray(raw)) {
    leaf = true;
    const items = raw as unknown[];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && typeof item === 'object') {
        const fixed = sanitize(item, path, depth + 1);
        if (fixed !== item) items[i] = fixed;
      }
    }
  } else if (isPlainObject(raw) && Object.hasOwn(raw, 'id') && !(path.length === 2 && path[0] === 'byTabId')) {
    // an entity: one level (its own nested objects are tt's; a container proxy can only be a direct field)
    leaf = true;
    const entity = raw;
    const keys = Object.keys(entity);
    for (let i = 0; i < keys.length; i++) {
      const child = entity[keys[i]];
      if (child && typeof child === 'object') {
        const fixed = sanitizeShallow(child);
        if (fixed !== child) entity[keys[i]] = fixed;
      }
    }
  }
  // Containers are walked level by level anyway (each changed level reaches `sanitize` itself), so scanning them here
  // re-walked every changed container 4 levels deep per level: 0.65 -> 37.5 ms per message insert in DEV (review N5).
  if (devChecks && leaf) devScan(raw, path, 0);
  return raw;
}

/** A direct child of an entity: unwrap a proxy, detach an owned copy; no further descent. */
function sanitizeShallow(child: object): object {
  const raw = unwrap(child);
  return ownedCopies.has(raw) ? detach(raw, []) : raw;
}

const DEV_SCAN_DEPTH = 4;
function devScan(value: object, path: PropertyKey[], depth: number) {
  if (depth > DEV_SCAN_DEPTH) return;
  const values = Array.isArray(value) ? value : Object.values(value);
  for (const v of values) {
    if (!v || typeof v !== 'object') continue;
    const raw = unwrap(v);
    if (raw !== v || ownedCopies.has(raw)) {
      // eslint-disable-next-line no-console
      console.error(
        `[global] a store proxy or a store-owned copy is nested ${depth + 2} levels deep inside a value written at ${path.join('.')}: ` +
          'pass tt objects (or a copy) to actions, not nested props',
      );
      return;
    }
    devScan(raw, path, depth + 1);
  }
}

/** The store's own copy of a container: shallow, with nested containers copied too; entities and arrays shared. */
export function copyContainer(value: AnyLiteral, path: PropertyKey[]): AnyLiteral {
  assertDepth(path.length, path);
  const copy: AnyLiteral = { ...value };
  const keys = Object.keys(copy);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key === '__proto__') continue;
    let child = copy[key];
    if (child && typeof child === 'object') {
      const fixed = sanitize(child, path.concat(key));
      if (fixed !== child) value[key] = child = fixed; // the committed object gets the tt-side value too
      if (isContainer(child, path.concat(key))) child = copyContainer(child, path.concat(key));
      copy[key] = child;
    }
  }
  ownedCopies.add(copy);
  return copy;
}

function areRecordsShallowEqual(a: AnyLiteral, b: AnyLiteral) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (let i = 0; i < ka.length; i++) {
    const k = ka[i];
    if (!Object.hasOwn(b, k) || a[k] !== b[k]) return false;
  }
  return true;
}

function areArraysShallowEqual(prev: readonly unknown[], next: readonly unknown[]) {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== next[i]) return false;
  }
  return true;
}

/**
 * Mirror the difference between the committed container `prev` and the next one `next` (both tt objects, immutable)
 * into the store's container at `path`. Returns `true` when anything was written.
 */
export function applyContainer(
  setState: UntypedSetState,
  prev: AnyLiteral,
  next: AnyLiteral,
  path: PropertyKey[],
  isRoot = false,
): boolean {
  assertDepth(path.length, path);
  let written = false;
  const nextKeys = Object.keys(next);
  let present = 0;

  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i];
    if (key === '__proto__') continue;
    let nv = next[key];
    let pv = prev[key];
    let has = pv !== undefined;
    // `prev[key]` also finds inherited names (`constructor`, `toString`, `valueOf`, …): only an own key counts, or the
    // deletion pass below would be skipped when such a key is added next to a removed one (appsec review, finding 1)
    if (!has || typeof pv === 'function') {
      has = Object.hasOwn(prev, key);
      pv = has ? prev[key] : undefined;
    }
    if (has) present++;
    if (isRoot && key === DEBUG_RANDOM_ID_KEY) continue;
    if (nv === pv) continue;
    if (nv && typeof nv === 'object') {
      const fixed = sanitize(nv, path.concat(key));
      if (fixed !== nv) next[key] = nv = fixed; // a proxy / an owned copy from a component: the committed global gets a tt-side value
      if (nv === pv) continue;
    }

    const childPath = path.concat(key);
    if (Array.isArray(nv)) {
      if (Array.isArray(pv) && areArraysShallowEqual(pv, nv)) continue;
    } else if (isContainer(nv, childPath)) {
      if (isContainer(pv, childPath)) {
        if (applyContainer(setState, pv, nv, childPath)) written = true;
        continue;
      }
      setState(...path, key, copyContainer(nv, childPath));
      written = true;
      continue;
    } else if (isPlainObject(nv) && isPlainObject(pv) && areRecordsShallowEqual(pv, nv)) {
      continue; // a fresh but equal entity (replaceUsers): the store keeps the old object
    }

    setState(...path, key, nv);
    written = true;
  }

  if (present !== Object.keys(prev).length) {
    const prevKeys = Object.keys(prev);
    for (let i = 0; i < prevKeys.length; i++) {
      const key = prevKeys[i];
      if (Object.hasOwn(next, key)) continue;
      if (isRoot && key === DEBUG_RANDOM_ID_KEY) continue;
      setState(...path, key, undefined);
      written = true;
    }
  }

  return written;
}

/** `setGlobal(next)`: mirror the change from the committed global `prev` to `next` into the store. */
export function applyGlobal(setState: UntypedSetState, prev: AnyLiteral, next: AnyLiteral): boolean {
  if (next === prev) return false;
  return applyContainer(setState, prev, next, [], true);
}
