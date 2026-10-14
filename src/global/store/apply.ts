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
//    gets the raw object, so `structuredClone` / `postMessage` of the global keep working.
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

/** The store's own copy of a container: shallow, with nested containers copied too; entities and arrays shared. */
export function copyContainer(value: AnyLiteral, path: PropertyKey[]): AnyLiteral {
  const copy: AnyLiteral = { ...value };
  const keys = Object.keys(copy);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key === '__proto__') continue;
    let child = copy[key];
    if (child && typeof child === 'object') {
      const raw = unwrap(child);
      if (raw !== child) value[key] = child = raw; // a proxy from a component: the committed global gets the raw object
      if (isContainer(child, path.concat(key))) child = copyContainer(child, path.concat(key));
      copy[key] = child;
    }
  }
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
  let written = false;
  const nextKeys = Object.keys(next);
  let present = 0;

  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i];
    if (key === '__proto__') continue;
    let nv = next[key];
    let pv = prev[key];
    let has = pv !== undefined;
    if (!has) {
      has = Object.hasOwn(prev, key);
      pv = undefined;
    }
    if (has) present++;
    if (isRoot && key === DEBUG_RANDOM_ID_KEY) continue;
    if (nv === pv) continue;
    if (nv && typeof nv === 'object') {
      const raw = unwrap(nv);
      if (raw !== nv) next[key] = nv = raw; // a proxy from a component: the committed global gets the raw object
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
