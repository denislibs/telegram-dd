// The global state of the app on frameact's store (docs/store-architecture.md). This module keeps telegram-tt's
// `src/global/index.ts` API (`getGlobal`, `setGlobal`, `getActions`, `addActionHandler`, `execAfterActions`,
// `withGlobal`, `addCallback`) so that the action, reducer and selector layers port unchanged; the TeactN binding
// behind it (`src/lib/teact/teactn.tsx` in tt) is replaced by the store glue below.
//
//  - `getGlobal()` is the raw store tree: the current state as plain objects, read untracked. Reducers spread-copy
//    it and `setGlobal(next)` merges the copy back in place (`store/apply.ts`), notifying only the changed leaves.
//  - `useGlobal()` is the tracked view (the store proxy) for component bodies, JSX, memos and effects. `withGlobal`
//    and `useSelector` read through it.
import { createMemo, flushSync, getIsHeavyAnimating, rootScope } from 'frameact';
import { mergeProps } from 'frameact/dom';
import { afterActions, createStore, defineActions, ungated, unwrap } from 'frameact/store';

import type { ActionPayloads, GlobalState, RequiredActionPayloads, RequiredGlobalState } from './types';

import { DEBUG } from '../config';
import { areRecordsShallowEqual } from '../util/areShallowEqual';
import { throttleWithTickEnd } from '../util/schedulers';
import {
  applyGlobal,
  createJournal,
  type Journal,
  journalToDiff,
  setStrictKeyCounts,
  type UntypedSetState,
} from './store/apply';

export interface ActionOptions {
  forceOnHeavyAnimation?: boolean;
  // Workaround for iOS gesture history navigation
  forceSyncOnIOs?: boolean;
  forceOutdated?: boolean;
  /**
   * telegram-dd: the global comes from another tab (multitab). Its writes are journaled apart (`remoteDiff` in the
   * store callbacks), so the receiving tab does not broadcast them back — tt relied on `currentGlobal === global` for that.
   */
  fromRemote?: boolean;
}

type ProjectActionTypes = ActionPayloads & RequiredActionPayloads;

type ProjectActionNames = keyof ProjectActionTypes;

type Helper<T, E> = Exclude<T, E> extends never ? unknown : Exclude<T, E>;

export type TabStateActionNames = {
  [ActionName in ProjectActionNames]: 'tabId' extends keyof Helper<ProjectActionTypes[ActionName], undefined>
    ? ActionName
    : never;
}[ProjectActionNames];
// `Required` actions are called from actions to ensure the `tabId` is always provided if needed.
// There are three types of actions:
// 1. With tabId, which is made required when calling action from another action handler
// 2. Without payload (= undefined), hence made the payload not required
// 3. With payload, hence made the payload required
export type RequiredGlobalActions = {
  [ActionName in ProjectActionNames]: ActionName extends TabStateActionNames
    ? (payload: ProjectActionTypes[ActionName] & { tabId: number }, options?: ActionOptions) => void
    : undefined extends ProjectActionTypes[ActionName]
      ? (payload?: ProjectActionTypes[ActionName], options?: ActionOptions) => void
      : (payload: ProjectActionTypes[ActionName], options?: ActionOptions) => void;
} & { _: never };

type ActionHandlers = {
  [ActionName in keyof ProjectActionTypes]: (
    global: RequiredGlobalState,
    actions: RequiredGlobalActions,
    payload: ProjectActionTypes[ActionName],
  ) => GlobalState | void | Promise<void>;
};

type ProjectActions<ReturnType = void> = {
  [ActionName in ProjectActionNames]: undefined extends ProjectActionTypes[ActionName]
    ? (payload?: ProjectActionTypes[ActionName], options?: ActionOptions) => ReturnType
    : (payload: ProjectActionTypes[ActionName], options?: ActionOptions) => ReturnType;
};

/**
 * A store callback gets the current global and, in tt's `deepDiff` format, what was written since its previous run:
 * `diff` by this tab's own actions, `remoteDiff` by globals received from other tabs (`fromRemote`).
 */
export type GlobalCallback = (global: GlobalState, diff?: AnyLiteral, remoteDiff?: AnyLiteral) => void;

// ---- the store --------------------------------------------------------------------------------------------------

// As in tt, the global starts as `{ isInited: false }` and gets its shape from `initGlobal` (`'byTabId' in global`
// tells a fresh tab from one that received the master's global). The root object is permanent: `setGlobal` merges into it.
const [trackedGlobal, setStateTyped] = createStore<GlobalState>({ isInited: false } as GlobalState);
const setState = setStateTyped as unknown as UntypedSetState;
const rawGlobal = unwrap(trackedGlobal) as unknown as GlobalState;
setStrictKeyCounts(DEBUG);

// ---- DEV: outdated-global detection (tt's DEBUG_randomId) -------------------------------------------------------

let DEBUG_currentRandomId: number | undefined;

const DEBUG_invalidateGlobalOnTickEnd = throttleWithTickEnd(() => {
  DEBUG_currentRandomId = Math.random();
});

// ---- callbacks (cache, multitab, folderManager) ------------------------------------------------------------------

const callbacks: GlobalCallback[] = [];
let journal: Journal = createJournal();
let remoteJournal: Journal = createJournal();
let forceOnHeavyAnimation = true;

function runCallbacks() {
  if (forceOnHeavyAnimation) {
    forceOnHeavyAnimation = false;
  } else if (getIsHeavyAnimating()) {
    rootScope.isAnimating.once(runCallbacksThrottled);
    return;
  }

  const diff = journalToDiff(journal);
  const remoteDiff = journalToDiff(remoteJournal);
  journal = createJournal();
  remoteJournal = createJournal();
  for (const cb of callbacks) cb(rawGlobal, diff, remoteDiff);
}

const runCallbacksThrottled = throttleWithTickEnd(runCallbacks);

export function addCallback(cb: GlobalCallback) {
  callbacks.push(cb);
}

export function removeCallback(cb: GlobalCallback) {
  const index = callbacks.indexOf(cb);
  if (index !== -1) {
    callbacks.splice(index, 1);
  }
}

export function forceOnHeavyAnimationOnce() {
  forceOnHeavyAnimation = true;
}

// ---- getGlobal / setGlobal --------------------------------------------------------------------------------------

/**
 * The current global as plain objects (the raw store tree), read untracked — for handlers, reducers, selectors
 * called from handlers, event handlers and anything that serialises or posts the state. In DEV it is a stamped
 * shallow copy, as in tt, so that `setGlobal` can detect a global taken before another write (`forceOutdated` skips the check).
 */
export function getGlobal<T extends GlobalState>(): T {
  if (DEBUG) {
    const copy = { ...rawGlobal, DEBUG_randomId: DEBUG_currentRandomId } as unknown as T;
    DEBUG_invalidateGlobalOnTickEnd();
    return copy;
  }
  return rawGlobal as T;
}

/**
 * The tracked view of the global (the store proxy, typed as `GlobalState`; writes through it throw). Read it inside
 * component bodies, JSX, `createMemo` and effects: every property read subscribes to that leaf.
 */
export function useGlobal(): GlobalState {
  return trackedGlobal as unknown as GlobalState;
}

/**
 * Merge a tt-style immutable global into the store: unchanged branches (`===`) are skipped, changed leaves are
 * written in place and notify their readers. `forceOnHeavyAnimation` writes `ungated` (parked effects run now),
 * `forceSyncOnIOs` also flushes the frame synchronously; both run the store callbacks at once instead of at tick end.
 */
export function setGlobal(newGlobal: GlobalState, options?: ActionOptions) {
  if (!newGlobal || typeof newGlobal !== 'object') return;

  if (DEBUG) {
    const stamp = (newGlobal as AnyLiteral).DEBUG_randomId;
    if (!options?.forceOutdated && stamp && stamp !== DEBUG_currentRandomId) {
      throw new Error('[global] Attempt to set an outdated global');
    }
    DEBUG_currentRandomId = Math.random();
  }

  const apply = () => applyGlobal(setState, rawGlobal, newGlobal, options?.fromRemote ? remoteJournal : journal);
  const changed = options?.forceOnHeavyAnimation || options?.forceSyncOnIOs ? ungated(apply) : apply();
  if (!changed) return;

  if (options?.forceSyncOnIOs) {
    forceOnHeavyAnimation = true;
    flushSync();
    runCallbacks();
  } else {
    if (options?.forceOnHeavyAnimation) {
      forceOnHeavyAnimation = true;
    }
    runCallbacksThrottled();
  }
}

// ---- actions ----------------------------------------------------------------------------------------------------

type ActionHandler = (global: any, actions: any, payload: any) => GlobalState | void | Promise<void>;

const actionHandlers: Record<string, ActionHandler[]> = {};
const actions = {} as Record<string, (payload?: unknown, options?: ActionOptions) => Promise<void> | undefined>;

function runHandlers(name: string, payload: unknown, options?: ActionOptions) {
  const pending: Promise<void>[] = [];
  const exec = () => {
    for (const handler of actionHandlers[name]) {
      const result = handler(DEBUG ? getGlobal() : rawGlobal, actions, payload);
      if (!result) continue;
      if (typeof (result as Promise<void>).then === 'function') {
        pending.push(result as Promise<void>);
        continue;
      }
      setGlobal(result as GlobalState, options);
    }
  };
  // The options cover the handler's synchronous writes (its returned global and any `setGlobal` it makes before an
  // `await`); an async handler wraps its later writes itself.
  if (options?.forceOnHeavyAnimation || options?.forceSyncOnIOs) {
    ungated(exec);
    if (options.forceSyncOnIOs) flushSync();
  } else {
    exec();
  }
  return pending.length ? Promise.all(pending).then(() => undefined) : undefined;
}

export const addActionHandler = (<ActionName extends ProjectActionNames>(
  name: ActionName,
  handler: ActionHandlers[ActionName],
) => {
  if (!actionHandlers[name]) {
    actionHandlers[name] = [];
    // One queued action per name (frameact's FIFO queue: a nested call runs after the current handler, `afterActions`
    // after the cascade), created at the first registration so that late bundles (`calls.async.ts`) can add handlers.
    Object.assign(
      actions,
      defineActions({ [name]: (payload?: unknown, options?: ActionOptions) => runHandlers(name, payload, options) }),
    );
  }

  actionHandlers[name].push(handler as ActionHandler);
}) as <ActionName extends ProjectActionNames>(name: ActionName, handler: ActionHandlers[ActionName]) => void;

export const getActions = (() => actions) as unknown as () => ProjectActions;
export const getPromiseActions = (() => actions) as unknown as () => ProjectActions<Promise<void>>;
export const execAfterActions: (fn: NoneToVoidFunction) => void = afterActions;
export type GlobalActions = ReturnType<typeof getActions>;

// ---- components -------------------------------------------------------------------------------------------------

type StickToFirstFn = (value: any) => boolean;
type MapStateToProps<OwnProps, StateProps> = (global: GlobalState, ownProps: OwnProps) => StateProps;
type ActivationFn<OwnProps> = (global: GlobalState, ownProps: OwnProps, stickToFirst: StickToFirstFn) => boolean;

/**
 * The component-side replacement of tt's `withGlobal(mapStateToProps)(Component)` HOC, called in the component body:
 *
 *   const Chat = (ownProps: OwnProps) => {
 *     const props = withGlobal(ownProps, (global, { chatId }): StateProps => ({ chat: selectChat(global, chatId) }));
 *     …props.chat, props.chatId…
 *
 * `mapStateToProps` keeps its tt body. It runs in a memo over the tracked global, so it re-runs when a leaf it read
 * (or an own prop it read) changes, and nothing else re-runs when the mapped record is shallow-equal to the previous
 * one. Store objects it returns (`chat`) are stable proxies: a field the component reads from them (`props.chat.title`)
 * is a direct leaf subscription that does not go through the mapper at all. Own props win over state props, as in tt.
 */
export function withGlobal<OwnProps extends AnyLiteral, StateProps extends AnyLiteral>(
  ownProps: OwnProps,
  mapStateToProps: MapStateToProps<OwnProps, StateProps>,
  activationFn?: ActivationFn<OwnProps>,
): OwnProps & StateProps {
  let stuckTo: unknown;
  let last: StateProps | undefined;
  const stickToFirst: StickToFirstFn = (stickTo) => {
    if (stuckTo) return stuckTo === stickTo;
    if (stickTo !== undefined) stuckTo = stickTo;
    return true;
  };
  const global = useGlobal();
  const mapped = createMemo<StateProps>(
    () => {
      if (activationFn && last && !activationFn(global, ownProps, stickToFirst)) return last;
      last = mapStateToProps(global, ownProps);
      return last;
    },
    { equals: areRecordsShallowEqual },
  );
  return mergeProps(() => mapped(), ownProps) as OwnProps & StateProps;
}
