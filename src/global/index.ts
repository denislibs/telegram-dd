// The global state of the app on frameact's store (docs/store-architecture.md). This module keeps telegram-tt's
// `src/global/index.ts` API (`getGlobal`, `setGlobal`, `getActions`, `addActionHandler`, `execAfterActions`,
// `withGlobal`, `addCallback`) so that the action, reducer and selector layers port unchanged; the TeactN binding
// behind it (`src/lib/teact/teactn.tsx` in tt) is replaced by the store glue below.
//
//  - The **committed global** is tt's immutable global, exactly the object tt would hold: `setGlobal(next)` commits
//    `next` itself. `getGlobal()` hands out a shallow copy of it (as tt's DEBUG build did, in both modes here), so
//    reducers, `prevGlobal` comparisons in callbacks, identity caches and constants behave as in tt.
//  - The frameact store is a **mirror** of the committed global that only components read: `setGlobal` walks the
//    previous and the next global and writes the changed leaves into the store (`store/apply.ts`).
//  - `useGlobal()` is the tracked view (the store proxy) for component bodies, JSX, memos and effects. `withGlobal`
//    and `useSelector` read through it.
import { createMemo, flushSync, getIsHeavyAnimating, rootScope } from 'frameact';
import { afterActions, createStore, defineActions, ungated, unwrap } from 'frameact/store';

import type { ActionPayloads, GlobalState, RequiredActionPayloads, RequiredGlobalState } from './types';

import { DEBUG, DEBUG_MORE } from '../config';
import { areRecordsShallowEqual } from '../util/areShallowEqual';
import { deepDiff } from '../util/deepDiff';
import { handleError } from '../util/handleError';
import { throttleWithTickEnd } from '../util/schedulers';
import { applyGlobal, setDevChecks, type UntypedSetState } from './store/apply';

export interface ActionOptions {
  forceOnHeavyAnimation?: boolean;
  // Workaround for iOS gesture history navigation
  forceSyncOnIOs?: boolean;
  forceOutdated?: boolean;
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

/** A store callback gets the committed global (tt's immutable global), as in tt: `prevGlobal` comparisons work. */
export type GlobalCallback = (global: GlobalState) => void;

// ---- the store --------------------------------------------------------------------------------------------------

// As in tt, the global starts as `{ isInited: false }` and gets its shape from `initGlobal` (`'byTabId' in global`
// tells a fresh tab from one that received the master's global).
let currentGlobal = { isInited: false } as GlobalState;

// The mirror. Its root object is permanent (`setGlobal` writes into it); it starts as a copy of the committed root.
const [trackedGlobal, setStateTyped] = createStore<GlobalState>({ ...currentGlobal });
const setState = setStateTyped as unknown as UntypedSetState;
setDevChecks(DEBUG);

// ---- DEV: outdated-global detection (tt's DEBUG_randomId) -------------------------------------------------------

let DEBUG_currentRandomId: number | undefined;

const DEBUG_invalidateGlobalOnTickEnd = throttleWithTickEnd(() => {
  DEBUG_currentRandomId = Math.random();
});

// ---- callbacks (cache, multitab, folderManager) ------------------------------------------------------------------

const callbacks: GlobalCallback[] = [];
let forceOnHeavyAnimation = true;

function runCallbacks() {
  if (forceOnHeavyAnimation) {
    forceOnHeavyAnimation = false;
  } else if (getIsHeavyAnimating()) {
    rootScope.isAnimating.once(runCallbacksThrottled);
    return;
  }

  callbacks.forEach((cb) => cb(currentGlobal));
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

// DEV tool (docs/store-architecture.md §10): the last `deepDiff`s between consecutive callback runs, newest last, for
// debugging "who changed that" in the console (`window.__globalDiffLog`).
const DIFF_LOG_SIZE = 100;
if (DEBUG_MORE) {
  const diffLog: { time: number; diff: unknown }[] = [];
  let prevLogged: GlobalState | undefined;
  (window as any).__globalDiffLog = diffLog;
  addCallback((global) => {
    if (prevLogged) {
      diffLog.push({ time: Date.now(), diff: deepDiff(prevLogged, global) });
      if (diffLog.length > DIFF_LOG_SIZE) diffLog.shift();
    }
    prevLogged = global;
  });
}

// ---- getGlobal / setGlobal --------------------------------------------------------------------------------------

// ---- the mapper context (N3) ------------------------------------------------------------------------------------

let mapperDepth = 0;
let mirrorReadsInMappers = 0;

/**
 * Run `fn` as a component's state mapper: inside it `getGlobal()` returns the tracked mirror instead of the committed
 * copy, so a verbatim helper that reads `getGlobal()` (`getCanPostInChat`, `getPeerColorCount`,
 * `getMessageTranscription`, `renderMessageSummary`, `sortChatIds`, …) subscribes the mapper to exactly the leaves it
 * reads. tt re-ran every mapper on every `setGlobal`, which made those reads safe; a version signal would bring that
 * cascade back for every row whose mapper touches such a helper. `withGlobal` and `useSelector` use this; a ported
 * hook or effect that calls one of those helpers wraps the call the same way.
 */
export function trackGlobal<T>(fn: () => T): T {
  mapperDepth++;
  try {
    return fn();
  } finally {
    mapperDepth--;
  }
}

/** DEV: how many `getGlobal()` calls ran inside a mapper (the helpers to convert to an explicit `global` over time). */
export function getMirrorReadsInMappers() {
  return mirrorReadsInMappers;
}

/**
 * The committed global — tt's immutable global — as a shallow copy, for handlers, reducers, selectors called from
 * handlers, event handlers and anything that serialises or posts the state. The copy (0.2 µs) is what tt's DEBUG build
 * handed out; here it is handed out in production too, so `global.x = …; setGlobal(global)` (tt has a few) behaves
 * the same in both modes. In DEV the copy is stamped, so that `setGlobal` can detect a global taken before another
 * write (`forceOutdated` skips the check). Inside a component's mapper (`trackGlobal`) it is the tracked mirror.
 */
export function getGlobal<T extends GlobalState>(): T {
  if (mapperDepth > 0) {
    if (DEBUG) mirrorReadsInMappers++;
    return trackedGlobal as unknown as T;
  }
  if (DEBUG) {
    const copy = { ...currentGlobal, DEBUG_randomId: DEBUG_currentRandomId } as unknown as T;
    DEBUG_invalidateGlobalOnTickEnd();
    return copy;
  }
  return { ...currentGlobal } as T;
}

/**
 * The tracked view of the global (the store proxy, typed as `GlobalState`; writes through it throw). Read it inside
 * component bodies, JSX, `createMemo` and effects: every property read subscribes to that leaf.
 */
export function useGlobal(): GlobalState {
  return trackedGlobal as unknown as GlobalState;
}

/**
 * Commit a tt-style immutable global and mirror the change into the store: unchanged branches (`===`) are skipped,
 * changed leaves are written and notify their readers. `forceOnHeavyAnimation` writes `ungated` (parked effects run
 * now), `forceSyncOnIOs` also flushes the frame synchronously; both run the store callbacks at once instead of at tick end.
 */
export function setGlobal(newGlobal: GlobalState, options?: ActionOptions) {
  if (!newGlobal || typeof newGlobal !== 'object' || newGlobal === currentGlobal) return;

  if (DEBUG) {
    const stamp = (newGlobal as AnyLiteral).DEBUG_randomId;
    if (!options?.forceOutdated && stamp && stamp !== DEBUG_currentRandomId) {
      throw new Error('[global] Attempt to set an outdated global');
    }
    DEBUG_currentRandomId = Math.random();
  }

  const prev = currentGlobal;
  currentGlobal = newGlobal;
  const apply = () => applyGlobal(setState, prev, newGlobal);
  try {
    if (options?.forceOnHeavyAnimation || options?.forceSyncOnIOs) ungated(apply);
    else apply();
  } catch (error) {
    // Atomic: a walk that throws (a value the glue refuses, a getter, a frozen object) must not leave `newGlobal`
    // committed with a half-applied mirror — later walks diff from the committed global and would skip the unwritten
    // branches for good. Back to `prev`, and the mirror is walked back to it (appsec review, finding 3).
    currentGlobal = prev;
    try {
      applyGlobal(setState, unwrap(trackedGlobal), prev);
    } catch (resyncError) {
      handleError(resyncError as Error);
    }
    throw error;
  }

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
    // An action called synchronously from a component's mapper must not get the mirror: `getGlobal()` below would be
    // the tracked proxy, `{ ...global, x }` would put store containers into `setGlobal` and subscribe the mapper to
    // every root key. The handler runs outside the mapper context (the caller is a pure mapper in tt too: a bug).
    const outerMapperDepth = mapperDepth;
    if (outerMapperDepth > 0) {
      if (DEBUG) {
        // eslint-disable-next-line no-console
        console.error(`[global] Action "${name}" was called from a mapper; mappers must be pure.`);
      }
      mapperDepth = 0;
    }
    try {
      for (const handler of actionHandlers[name]) {
        const result = handler(getGlobal(), actions, payload);
        if (!result) continue;
        if (typeof (result as Promise<void>).then === 'function') {
          pending.push(result as Promise<void>);
          continue;
        }
        setGlobal(result as GlobalState, options);
      }
    } finally {
      mapperDepth = outerMapperDepth;
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
  // tt's action call always returned a promise (`getPromiseActions().x().then(…)` on a synchronous action works)
  return pending.length ? Promise.all(pending).then(() => undefined) : Promise.resolve();
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

// Frozen: it is the first value of every mapper memo and was the target of every props proxy — one mutable object
// shared by all components (appsec review, finding 5).
const EMPTY_PROPS = Object.freeze({}) as AnyLiteral;
const readOnly = () => false; // a write through the props proxy: a TypeError in strict mode

/**
 * The component-side replacement of tt's `withGlobal(mapStateToProps)(Component)` HOC, called in the component body:
 *
 *   const Chat = (ownProps: OwnProps) => {
 *     const props = withGlobal(ownProps, (global, { chatId }): StateProps => ({ chat: selectChat(global, chatId) }));
 *     …props.chat, props.chatId…
 *
 * `mapStateToProps` keeps its tt body. It runs in a memo over the tracked global, so it re-runs when a leaf it read
 * (or an own prop it read) changes — an entity it returned (`chat`) is a new object when it changed, as in tt — and
 * nothing downstream re-runs while the mapped record stays shallow-equal. As tt's container: a throwing mapper is
 * reported through `handleError` and the previous props stay; an inactive container (`activationFn`) is not mapped,
 * on the first run included; own props win over state props, a key present in the own props with `undefined` too
 * (`{ ...mapped, ...own }`). Call it without type arguments so both are inferred (the codemod drops tt's
 * `<OwnProps>`); with an explicit `<OwnProps>` the state props default to `{}`, so a state prop read is a compile
 * error rather than `any` (N4).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the default must be the empty record, not `any`
export function withGlobal<OwnProps extends AnyLiteral, StateProps extends AnyLiteral = {}>(
  ownProps: OwnProps,
  mapStateToProps: MapStateToProps<OwnProps, StateProps>,
  activationFn?: ActivationFn<OwnProps>,
): OwnProps & StateProps {
  let stuckTo: unknown;
  let last: StateProps = EMPTY_PROPS as StateProps;
  const stickToFirst: StickToFirstFn = (stickTo) => {
    if (stuckTo) return stuckTo === stickTo;
    if (stickTo !== undefined) stuckTo = stickTo;
    return true;
  };
  const global = useGlobal();
  const mapped = createMemo<StateProps>(
    () => {
      return trackGlobal(() => {
        if (activationFn && !activationFn(global, ownProps, stickToFirst)) return last;
        try {
          last = mapStateToProps(global, ownProps);
        } catch (err: any) {
          handleError(err);
        }
        return last;
      });
    },
    { equals: areRecordsShallowEqual },
  );
  // `{ ...mappedProps, ...props }` of tt's container, with lazy getters: an own prop wins whenever its key is present.
  // The target is a fresh object per component (a frozen target would break the `ownKeys` invariants of the traps).
  return new Proxy(
    {},
    {
      set: readOnly,
      defineProperty: readOnly,
      deleteProperty: readOnly,
      setPrototypeOf: readOnly,
      get: (_target, key) => (key in ownProps ? ownProps[key as string] : mapped()[key as string]),
      has: (_target, key) => key in ownProps || key in mapped(),
      ownKeys: () => [...new Set([...Reflect.ownKeys(mapped()), ...Reflect.ownKeys(ownProps)])],
      getOwnPropertyDescriptor: (_target, key) =>
        key in ownProps || key in mapped()
          ? {
              configurable: true,
              enumerable: true,
              get: () => (key in ownProps ? ownProps[key as string] : mapped()[key as string]),
            }
          : undefined,
    },
  ) as OwnProps & StateProps;
}

if (DEBUG) {
  (window as any).getGlobal = getGlobal;
  (window as any).setGlobal = setGlobal;
  (window as any).getActions = getActions;
  // Not in tt: the store mirror that components read (raw object), for the e2e checks of docs/quality-gates.md
  (window as any).getMirror = () => unwrap(trackedGlobal);
}
