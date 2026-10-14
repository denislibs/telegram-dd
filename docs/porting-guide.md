# Porting telegram-tt to frameact: the app-level guide

How a file from `reference/telegram-tt` becomes a file in `src/`. This guide covers the app: directory layout, the
global state, app-specific hooks and components, styles, workers, and the process. Two other documents cover the
framework, and this guide does not repeat them:

- **[`src/vendor/frameact/docs/guides/porting-from-teact.md`](../src/vendor/frameact/docs/guides/porting-from-teact.md)**:
  the framework-level guide. It has the hook → primitive table (§1), the traps (§2), phases and scroll anchoring (§4),
  and store model B (§5). Read §1 and §2 before porting your first component.
- **[`src/vendor/frameact/docs/llms-full.md`](../src/vendor/frameact/docs/llms-full.md)**: the API reference for app
  code.

**Reference baseline**: telegram-tt `master` @ `090e38f1dffec3e0a9aefbec8159a9931fbeec8f` (v12.0.46, 2026-10-12).
When you bump the baseline, update this line (see [§7.4](#74-tracking-upstream)).

Scale: about 990 `.tsx` components (743 wrapped in `memo`, 559 connected through `withGlobal`), about 1000 action
handlers in 63 files, 155 `*.async.tsx` wrappers, and 414 SCSS files. The rules below are designed so that most of this
code ports mechanically and the compiler shows what is left.

## 1. Licensing rules for porters

The app is GPL-3.0-or-later because it derives from telegram-tt. [`NOTICE.md`](../NOTICE.md) holds the attribution,
the modification notice and the third-party inventory.

**File-header rule (the only one):**

1. A ported file keeps every notice it already has, verbatim. Examples are the MIT header of `src/lib/fastBlur.js`,
   the twemoji header of `src/lib/twemojiRegex.js`, and every "Adapted from" or "Based on" comment. Never delete or
   shorten one.
2. A ported file gets **no added header** when it keeps its telegram-tt path. In that case the path itself, the import
   commit (which names the tt commit) and `NOTICE.md` record where it came from. A header line in hundreds of files
   would add noise to every diff against the reference.
3. A ported file that **cannot keep its tt path** (moved, split or merged) gets one first line,
   `// Ported from telegram-tt <original path> (GPL-3.0-or-later)`, so its provenance stays traceable.
4. A new original file gets no header. It is GPL-3.0-or-later as part of the work.

**Where code may go.** Two rules decide this: the licence boundary and the engine boundary.

- **Licence.** Never copy telegram-tt code into `src/vendor/frameact`, which is MIT. Do not edit anything under
  `src/vendor/frameact` in this repository either.
- **Engine.** frameact gets only engine-level things:
  - reactivity, rendering and the DOM runtime;
  - the scheduler and frame phases;
  - the store and stricterdom;
  - generic primitives tied to phases and animation gating. That last group is what `frameact/kit` already has:
    `Transition`, `ShowTransition`, `InfiniteScroll`, `createScrollAnchor`.
- **App and UI code stays in `src/`** and is never sent upstream to frameact, even if it looks reusable. Examples:
  Button, Modal, Menu, Avatar, Loading, ListItem, Icon, the chat list, the message list, the composer, and the app hooks
  of [§4.2](#42-app-specific-mapping).
- **The test.** When porting turns up something the framework seems to lack, ask whether it is an engine concern:
  phases, reactivity, scheduling, the DOM runtime, or gating.
  - If yes, implement it clean-room in the frameact repository. Work from behaviour and tests, without reading tt's
    implementation. Send it as a PR, then bump the submodule (`pnpm framework:update`).
  - If no, it belongs in the client.
- **Where teact-derived engine code comes from.** frameact's teact-derived code comes from
  [Ajaxy/teact](https://github.com/Ajaxy/teact), which is MIT as a standalone repository. It never comes from the copy in
  telegram-tt's `src/lib/teact`, because that copy sits inside a GPL tree.

## 2. Directory mapping

Keep the telegram-tt path. A tt file `src/components/left/main/Chat.tsx` becomes `src/components/left/main/Chat.tsx`
here, and its stylesheet, hooks and helpers move next to it under the same names. That way
`diff reference/telegram-tt/<path> <path>` always works.

| telegram-tt                                                                                                                          | tg-frameact                  | Status                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/gramjs/`                                                                                                                    | same                         | **Verbatim.** No UI dependencies (no teact or fasterdom imports).                                                                               |
| `src/api/gramjs/`, `src/api/types/`                                                                                                  | same                         | **Verbatim**, except one adaptation in `worker/connector.ts` ([§6](#6-workers-and-gramjs)).                                                     |
| `src/lib/{tlottie,mediaWorker,offscreen-canvas,fasttextweb,latex,ton,vibecalls,diamond,hljs-tl}`, `src/lib/*.js`, `src/lib/color.ts` | same                         | Verbatim. `diamond/index.ts` swaps its teact imports (`getIsHeavyAnimating`, `onFullyIdle`) for `frameact`.                                     |
| `src/util/`                                                                                                                          | same                         | Verbatim where DOM- and teact-free (most of it). 21 files import teact or fasterdom and are adapted ([§4.5](#45-fasterdom--frame-phases)).      |
| `src/global/types`, `initialState.ts`, `selectors/`, `helpers/`                                                                      | same                         | Verbatim. Selectors are pure functions and work over the store proxy.                                                                           |
| `src/global/reducers/`                                                                                                               | same                         | **Adapted**: they become writers ([§3.3](#33-reducers-become-writers)).                                                                         |
| `src/global/actions/**`                                                                                                              | same                         | **Adapted**: same `addActionHandler` calls; handlers write instead of returning state ([§3.5](#35-worked-example-an-action-handler)).           |
| `src/global/index.ts`                                                                                                                | same path, **rewritten**     | The store glue: `createStore` + an `addActionHandler` registry over `defineActions` ([§3.2](#32-the-tg-frameact-store)).                        |
| `src/global/cache.ts`, `src/util/browser/multitab.ts`, `src/global/shared/`                                                          | same                         | **Deferred** ([§3.7](#37-cache-and-multitab)).                                                                                                  |
| `src/components/**`, `src/bundles/`                                                                                                  | same                         | Adapted ([§4](#4-components)).                                                                                                                  |
| `src/components/ui/{Transition,ShowTransition,InfiniteScroll}.tsx`, `Portal.ts`                                                      | same path, **thin adapters** | Re-export `frameact/kit` / `frameact/dom` components and import tt's stylesheet, so call sites keep their imports.                              |
| `src/hooks/`                                                                                                                         | same                         | A hook with a framework primitive is **deleted**. Any other hook is **ported in place** under the same name ([§4.2](#42-app-specific-mapping)). |
| `src/styles/`, `src/assets/`, `public/`                                                                                              | same                         | Verbatim ([§5](#5-styles-and-assets)).                                                                                                          |
| `src/serviceWorker/`                                                                                                                 | same                         | Verbatim, ported with the PWA milestone.                                                                                                        |
| `dev/` (icons, lang types, TL hash), `plugins/gitInfo.ts`                                                                            | same                         | Ported when their scripts and Vite hooks are wired up (`virtual:git-info` feeds `APP_REVISION`).                                                |

**Not ported (decisions):**

| What                                                                                                                                                                                                                                                                                                                                                                                                 | Why                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/teact/` (teact, teact-dom, teactn, jsx runtime, heavyAnimation)                                                                                                                                                                                                                                                                                                                             | Replaced by `frameact`, `frameact/dom`, `frameact/store`. `@teact` path aliases go away.                                                                 |
| `src/lib/fasterdom/` (fasterdom, stricterdom, layoutCauses)                                                                                                                                                                                                                                                                                                                                          | frameact's scheduler owns the frame (`requestMeasure`, `requestMutation`, …) and `frameact/stricterdom` checks it. Two schedulers would split the frame. |
| teact hooks with frameact primitives (`useLastCallback`, `usePrevious*`, `useCurrentOrPrev`, `useFrozenProps`, `usePrevDuringAnimation`, `useSyncEffect*`, `useEffectWithPrevDeps`, `useLayoutEffectWithPrevDeps`, `useForceUpdate`, `useStateRef`, `useSignal*`, `useDerived*`, `useHeavyAnimation`, `useMountAfterHeavyAnimation`, `useModuleLoader`, `useShowTransition*`, `useMediaTransition*`) | The framework table maps each one to a primitive. A shim would hide the "component runs once" model.                                                     |
| `src/components/test/`                                                                                                                                                                                                                                                                                                                                                                               | teact renderer tests; frameact has its own suite.                                                                                                        |
| `eslint.config.js`, stylelint config, `eslint-plugin-tt-multitab`, husky/lint-staged                                                                                                                                                                                                                                                                                                                 | The repo uses oxlint + prettier (`pnpm check`). SCSS linting will be reconsidered once styles are in.                                                    |
| `tauri/`, `src/util/tauri/`, `src/hooks/tauri/`, `deploy/`                                                                                                                                                                                                                                                                                                                                           | Web first. `IS_TAURI` stays (always `false`) so call sites compile; Tauri may come back as a later decision.                                             |
| Bundle-stats and statoscope plugins, `public/statoscope-report.html`, `public/build-stats.json`, `public/google*.html`                                                                                                                                                                                                                                                                               | Build reporting and verification for web.telegram.org, not app code.                                                                                     |

## 3. Global state

### 3.1 What tt does

- A TeactN global is one immutable `GlobalState`. A reducer returns `{ ...global, … }`, and `setGlobal(newGlobal)`
  replaces the root. `setGlobal` throttles container updates and skips them during heavy animations unless
  `forceOnHeavyAnimation` is set.
- `withGlobal(mapStateToProps)` re-runs every container's mapping after each change and shallow-compares the result.
- `addActionHandler(name, (global, actions, payload) => newGlobal | void | Promise<void>)`. Several handlers may share a
  name (`apiUpdate`, `reset`, `sendMessage`, …). Calls are queued FIFO, and `execAfterActions` runs after the cascade.
- Tab state lives in `global.byTabId[tabId]`, read through `selectTabState(global, tabId)`.
- Cache: `addCallback` + a throttled serializer into IndexedDB/localStorage. Multitab: the master tab owns the API and
  broadcasts `deepDiff`s of the global over a `BroadcastChannel`.

### 3.2 The tg-frameact store

One store, written in place (model B). `src/global/index.ts` keeps tt's exported names so that ported code changes as
little as possible:

```ts
// src/global/index.ts — sketch of the glue; tt's types are kept (`ActionOptions` moves from teactn to ./types)
import { createStore, defineActions, ungated } from 'frameact/store';
import { flushSync } from 'frameact';

import type {
  ActionOptions,
  ActionPayloads,
  GlobalState,
  RequiredActionPayloads,
  RequiredGlobalActions,
} from './types';
import { INITIAL_GLOBAL_STATE } from './initialState';

type Payloads = ActionPayloads & RequiredActionPayloads;
type Handler<N extends keyof Payloads> = (
  global: GlobalState,
  actions: RequiredGlobalActions,
  payload: Payloads[N],
) => void | Promise<void>;

export const [state, setState] = createStore<GlobalState>(structuredClone(INITIAL_GLOBAL_STATE));
// The store type is deep-readonly; handlers and selectors keep tt's `GlobalState` signatures (writes through it throw).
const global = state as unknown as GlobalState;

const handlers: { [N in keyof Payloads]?: Handler<N>[] } = {};
const actions = {} as RequiredGlobalActions;

export function addActionHandler<N extends keyof Payloads>(name: N, handler: Handler<N>) {
  const list = handlers[name];
  if (list) {
    list.push(handler);
    return;
  }
  handlers[name] = [handler];
  // One action per name, created at the first registration (late bundles such as `calls.async.ts` register later).
  Object.assign(
    actions,
    defineActions({ [name]: (payload?: Payloads[N], options?: ActionOptions) => run(name, payload, options) }),
  );
}

function run<N extends keyof Payloads>(name: N, payload: Payloads[N] | undefined, options?: ActionOptions) {
  const runAll = () => {
    const pending: Promise<void>[] = [];
    for (const handler of handlers[name]!) {
      const result = handler(global, actions, payload!);
      if (result instanceof Promise) pending.push(result);
      else if (import.meta.env.DEV && result !== undefined) {
        throw new Error(`[global] action "${String(name)}" returned a value: write with setState instead`);
      }
    }
    return pending.length ? Promise.all(pending).then(() => undefined) : undefined;
  };
  if (!options?.forceOnHeavyAnimation && !options?.forceSyncOnIOs) return runAll();
  const result = ungated(runAll); // covers the synchronous writes; an async handler wraps its later writes itself
  if (options.forceSyncOnIOs) flushSync();
  return result;
}

export const getActions = () => actions;
export const getGlobal = () => global; // a live, read-only view: there is no setGlobal
export { afterActions as execAfterActions } from 'frameact/store';
```

- **There is no `setGlobal` and no `withGlobal`.** Every leftover use fails to compile, which makes the compiler your
  to-do list. In `src/global/types`, change `ActionReturnType` to `void | Promise<void>`. That flags every
  `return updateX(global, …)` as well.
- `getActions()` and the call shape `actions.foo({ …payload, tabId })` are unchanged. Destructuring
  `const { openChat } = getActions();` is fine: actions are stable functions, not props.
- `global` inside a handler is the live proxy. A read after a write sees the write, so a `global = getGlobal()`
  re-read after `await` is harmless but no longer needed.
- **Never put a proxy inside a new object you write or send.** `setState` unwraps the value you pass, but not
  proxies nested inside it. Copy with `unwrap(x)` (or `snapshot(x)` for a detached deep copy).
  `structuredClone(proxy)` and `postMessage(proxy)` throw.

### 3.3 Reducers become writers

Each reducer keeps its file, name and parameter list, including the leading `global`, which is now used only for reads.
It performs path writes and returns `void`. At the call site, delete `global = ` and `return`.

| tt reducer body                                              | Writer body                                                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `{ ...global, x: value }`                                    | `setState('x', value)`                                                                                |
| `{ ...global, a: { ...global.a, b: value } }`                | `setState('a', 'b', value)`                                                                           |
| `updateTabState(global, partial, tabId)` (spreads `byTabId`) | `setState('byTabId', tabId, merge(partial))`                                                          |
| a partial merge of a chat/user                               | `setState('chats', 'byId', id, merge(chatUpdate))` (a plain object at a path **replaces**)            |
| deleting a key (`omit(byId, [id])`)                          | `setState('chats', 'byId', id, undefined)`                                                            |
| a new array (`[...list, item]`, `filter`, `splice` copy)     | `setState(…path, produce((list) => { list.push(item) }))`                                             |
| a server chunk replacing a list or a `byId` slice            | `setState(…path, reconcile(chunk))` (matched by `id`; rows keep identity, only changed leaves notify) |
| several fields of one entity                                 | `setState(…path, produce((draft) => { … }))`                                                          |

```ts
// src/global/reducers/tabs.ts
// tt
export function updateTabState<T extends GlobalState>(
  global: T,
  tabStatePartial: Partial<TabState>,
  ...[tabId = getCurrentTabId()]: TabArgs<T>
): T {
  return { ...global, byTabId: { ...global.byTabId, [tabId]: { ...global.byTabId[tabId], ...tabStatePartial } } };
}
// tg-frameact
export function updateTabState<T extends GlobalState>(
  global: T,
  tabStatePartial: Partial<TabState>,
  ...[tabId = getCurrentTabId()]: TabArgs<T>
): void {
  setState('byTabId', tabId, merge(tabStatePartial));
}
```

Paths are typed up to 7 keys. For deeper writes, use `produce` at the 7th level.

### 3.4 Worked example: a connected component

`src/components/common/Notifications.tsx`, tt (the "before" snippets are shown prettier-formatted, as in the import
commit of [§7.2](#72-per-file-checklist)):

```tsx
import { memo } from '../../lib/teact/teact';
import { withGlobal } from '../../global';

import type { ApiNotification } from '../../api/types';

import { selectTabState } from '../../global/selectors';
import { pick } from '../../util/iteratees';

import Notification from '../ui/Notification';

type StateProps = {
  notifications: ApiNotification[];
};

const Notifications = ({ notifications }: StateProps) => {
  if (!notifications.length) {
    return undefined;
  }

  return (
    <div id="Notifications">
      {notifications.map((notification) => (
        <Notification key={notification.localId} notification={notification} />
      ))}
    </div>
  );
};

export default memo(
  withGlobal((global): Complete<StateProps> => pick(selectTabState(global), ['notifications']))(Notifications),
);
```

tg-frameact:

```tsx
import { For, Show } from 'frameact/dom';
import { getGlobal } from '../../global';

import { selectTabState } from '../../global/selectors';

import Notification from '../ui/Notification';

const Notifications = () => {
  // The old `mapStateToProps` becomes an accessor over the store; each read is a leaf subscription
  const notifications = () => selectTabState(getGlobal()).notifications;

  return (
    <Show when={notifications().length > 0}>
      <div id="Notifications">
        <For each={notifications()} keyed={(notification) => notification.localId}>
          {(notification) => <Notification notification={notification()} />}
        </For>
      </div>
    </Show>
  );
};

export default Notifications;
```

What changed, and the general rule behind each change:

- `withGlobal` + `StateProps` + `Complete<…>` are gone. Each state prop becomes an accessor
  (`const x = () => selectX(getGlobal(), props.id)`) or a direct read in JSX. If the mapping computes a list,
  wrap it in `createMemo`.
- `memo(...)` is gone, because a component runs once.
- An early `return undefined` becomes `<Show>`, because the body runs once.
- `.map` with `key={x.id}` becomes `<For keyed={(x) => x.id}>`. In that mode the child receives an **accessor**
  (`notification()`), which is the closest match to teact's keyed reconciliation. Use plain `<For each>` (keyed by
  reference) when rows are store proxies that are only edited in place.
- `OwnProps` stay: `(props: OwnProps)`, read as `props.userId`, never destructured.

### 3.5 Worked example: an action handler

`src/global/actions/ui/initial.ts`, tt:

```ts
addActionHandler('showNotification', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId(), ...notification } = payload;
  const hasLocalId = notification.localId;
  notification.localId ||= generateUniqueId();

  const newNotifications = [...selectTabState(global, tabId).notifications];
  const existingNotificationIndex = newNotifications.findIndex((n) =>
    hasLocalId ? n.localId === notification.localId : n.message === notification.message,
  );
  if (existingNotificationIndex !== -1) {
    newNotifications.splice(existingNotificationIndex, 1);
  }

  newNotifications.push(notification as ApiNotification);

  return updateTabState(
    global,
    {
      notifications: newNotifications,
    },
    tabId,
  );
});
```

tg-frameact:

```ts
addActionHandler('showNotification', (global, actions, payload): ActionReturnType => {
  const { tabId = getCurrentTabId(), ...notification } = payload;
  const hasLocalId = notification.localId;
  notification.localId ||= generateUniqueId();

  setState(
    'byTabId',
    tabId,
    'notifications',
    produce((notifications) => {
      const existingNotificationIndex = notifications.findIndex((n) =>
        hasLocalId ? n.localId === notification.localId : n.message === notification.message,
      );
      if (existingNotificationIndex !== -1) {
        notifications.splice(existingNotificationIndex, 1);
      }

      notifications.push(notification as ApiNotification);
    }),
  );
});
```

An alternative with an even smaller diff: keep the copied array and call the writer,
`updateTabState(global, { notifications: newNotifications }, tabId);`. The list is then replaced as a whole. With
`keyed={(n) => n.localId}` in the component, rows survive the replacement. Prefer `produce` on hot paths, and the writer
where the diff matters more.

Async handlers keep their shape. `const result = await callApi(…)` stays, the `global = getGlobal(); global = {…};
setGlobal(global)` tail becomes path writes, and a handler that ran under `forceOnHeavyAnimation` wraps its post-`await`
writes in `ungated(() => …)`:

```ts
addActionHandler('loadAvailableReactions', async (global): Promise<void> => {
  const result = await callApi('fetchAvailableReactions');
  if (!result) return;
  // … preload animations, unchanged …
  setState('reactions', 'availableReactions', reconcile(result, { key: 'reaction' }));
});
```

Before you write a `reconcile`, check the key of the items: the default is `id`, and `key: null` matches by index.

### 3.6 Selectors, identity and heavy animations

- **Selectors port verbatim.** `selectChat(global, id)` over the proxy tracks exactly what it reads. Keep them pure.
- **Identity caches go stale** (framework §5.3), because the same object is mutated in place. Delete
  `src/util/memoized.ts`-style caches over store objects, `useMemo(…, [chatsById])` identity dependencies and
  `areShallowEqual` guards on state. Replace them with `createMemo(() => selector(getGlobal(), …))`.
- **A local variable holding a state object is live.** Code that kept `const chat = selectChat(global, id)` across an
  `await` and expected a snapshot now sees later writes. Use `snapshot(chat)` when you really need the old value.
- Heavy animations:
  - `setGlobal(g, { forceOnHeavyAnimation: true })` and `forceOnHeavyAnimationOnce()` → `ungated(() => setState(…))`.
  - `forceSyncOnIOs` → `ungated(…)` followed by `flushSync()`.
  - A component read that must update while its subtree animates → `live(() => getGlobal().x)`.
  - `getIsHeavyAnimating()` and `onFullyIdle()` keep their names (from `frameact`). They look at `rootScope`, so pass
    `scope={rootScope}` to a `<Transition>` whose animation must pause lottie/video like tt does.

### 3.7 Cache and multitab

- **Cache: deferred to the milestone after the chat list.** `addCallback` has no equivalent yet (no store change feed).
  The planned interim keeps `src/global/cache.ts` with `serializeGlobal` and `migrateCache` unchanged, and replaces its
  trigger: after every action cascade, `afterActions(() => updateCacheThrottled())` from the registry's `run`. The
  throttled save itself runs in `onFullyIdle` and serializes `unwrap(state)` through tt's reducer of cached sections.
  All writes go through actions, so this misses nothing.
- **Multitab: deferred.** For the first milestones every tab is the master tab and owns its API connection.
  `deepDiff` broadcasting needs a change feed (or snapshots, which cost O(n) per write). That feed is an engine concern,
  so it is proposed clean-room in frameact first (`onStoreWrite` / a patch journal, see framework §5.5).

## 4. Components

### 4.1 Framework mapping

Use the hook → primitive table in
[framework §1](../src/vendor/frameact/docs/guides/porting-from-teact.md#1-hooks--primitives) and the traps in §2. Do not
re-derive them. The short version:

- `useState` → `createSignal`.
- `useEffect` → `createEffect`, or `createMeasureEffect` for layout reads. `useLayoutEffect` → `createMutationEffect`.
- `useEffect(…, [])` → `onMount`. An unmount cleanup → `onDestroy`.
- `useMemo` → `createMemo`. `useCallback`, `useLastCallback` and `memo` become plain functions.
- `useRef` → a `let` variable ([§4.3](#43-props-refs-and-events)).
- `teactFastList` / `teactOrderKey` → `<ManualFor orderKey>`.
- `teactExperimentControlled` → `use:value` / `use:checked`.
- `className=` → `class=`.

### 4.2 App-specific mapping

| telegram-tt                                                                         | tg-frameact                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useFlag()` (172 files)                                                             | Port `src/hooks/useFlag.ts` in place: `createSignal`, returning `[Accessor<boolean>, setTrue, setFalse]`. Call sites change `isOpen` to `isOpen()`.                                                                                                                                               |
| `useLang()`, `useOldLang()`                                                         | Port in place. `lang` reads the language signal, so `lang('Key')` in JSX is reactive. `lang.isRtl` becomes a getter.                                                                                                                                                                              |
| `useSelector`, `useShallowSelector*` (`src/hooks/data/useSelector.ts`)              | Delete. Read through the selector in JSX, or `createMemo(() => selector(getGlobal()))`.                                                                                                                                                                                                           |
| `getGlobal()` inside a handler                                                      | Unchanged (it returns the live proxy; reads are untracked outside computations).                                                                                                                                                                                                                  |
| `useInfiniteScroll(loadMore, listIds, isDisabled, slice)` (viewport id slicing)     | Port `src/hooks/useInfiniteScroll.ts` in place as an app primitive. Keep `getViewportSlice`. `listIds` comes in as an accessor, and it returns `[viewportIds: Accessor, getMore]` built on `createSignal`/`createMemo`. Pair it with `<InfiniteScroll onLoadMore={getMore}>` from `frameact/kit`. |
| `<Transition>`, `<ShowTransition>`, `<InfiniteScroll>` from `components/ui`         | Thin adapters over `frameact/kit` that import tt's `Transition.scss` etc. In `Transition`, use the render function and render by `slide.key` (framework §6). `slideOptimized`, swipe control and `nextKey` are not available: note it as a deviation.                                             |
| `useShowTransition`, `useShowTransitionDeprecated`, `useMediaTransition`            | `createShowTransition({ isOpen: () => props.isOpen, … })` (`t.ref`, `t.shouldRender()`), `createMediaTransition`. Same class names.                                                                                                                                                               |
| `Portal` (`components/ui/Portal.ts`)                                                | `<Portal mount>` from `frameact/dom`.                                                                                                                                                                                                                                                             |
| `*.async.tsx` + `useModuleLoader(Bundles.X, 'Name', !isOpen)`                       | `const X = lazy(() => loadBundle(Bundles.X).then((bundle) => ({ default: bundle.Name })))`, rendered as `<Show when={props.isOpen}><X …/></Show>`. Keep `src/bundles/*` and `src/util/moduleLoader.ts`, so chunking stays tt's.                                                                   |
| `useHeavyAnimation`, `useThrottleForHeavyAnimation`, `useMountAfterHeavyAnimation`  | `watchHeavyAnimation`, `onFullyIdle`, `deferUntilIdle`.                                                                                                                                                                                                                                           |
| `key={id}` on a single element to remount it                                        | `<Show when={id()} keyed>{(id) => …}</Show>`.                                                                                                                                                                                                                                                     |
| `FC`, `TeactNode`, `ElementRef`, `Complete<StateProps>`                             | `(props: OwnProps)`, `JSX.Element` (`import type { JSX } from 'frameact/jsx-runtime'`), a `let` element variable, nothing.                                                                                                                                                                        |
| Tiptap node views (`src/util/tiptap/TeactRenderer.ts`, `TeactNodeViewRenderer.tsx`) | Render each node view with `render(() => <View …/>, dom)` from `frameact/dom` and call the returned `dispose()` in the node view's `destroy`. Feed node attributes through a signal.                                                                                                              |
| `util/replaceWithTeact.ts`, `renderText`, `formatCurrency.tsx`                      | Port in place returning JSX node arrays. Render rich text with `<For>` keyed by entity, so that `CustomEmoji`/lottie nodes survive text edits. There is no `dangerouslySetInnerHTML`.                                                                                                             |
| `withSelectControl` and other HOCs (`hocs/`)                                        | Rewrite as wrapper components that pass `props` through with `splitProps`/`mergeProps`. Never spread server objects.                                                                                                                                                                              |

**Hook files rule.** If the framework table maps a hook to a primitive, delete the hook file and change its call sites.
Otherwise port the hook in place, with the same path and the same exported name. It runs once in the component body,
takes accessors instead of values, and returns accessors. Keeping the `use*` name keeps call sites and diffs readable.

### 4.3 Props, refs and events

- **Signature.** `const Chat = ({ chatId, isSelected }: OwnProps & StateProps) => {` becomes
  `const Chat = (props: OwnProps) => {` with `props.chatId` read where it is used. Defaults go through
  `const p = mergeProps({ size: 'medium' }, props)`. A default in a destructuring pattern silently becomes a one-time
  read, and the Vite plugin warns in dev.
- **Refs.** A teact `useRef` object passed as `ref={ref}` is **silently ignored**: frameact applies only functions and
  compiler-assigned variables.
  - DOM refs: `let el!: HTMLDivElement; <div ref={el}>`, then `el` everywhere `ref.current` was.
  - A ref passed to a child component or a hook (`useHorizontalScroll(containerRef)`): pass an accessor `() => el`, or a
    callback `ref={(node) => { el = node; }}`.
  - Non-DOM `useRef` values (timers, previous values, flags): a plain `let` in the component body, which runs once.
- **Events.** Handlers are delegated and bound once. `onClick={handleClick}` with a body-local function is fine.
  A handler that comes from props and can change is written `onClick={(e) => props.onClick?.(e)}`. A handler may read
  layout (it is a measure context), but it schedules DOM writes with `requestMutation`.

### 4.4 Styles in JSX

`className={buildClassName('Chat', isSelected && 'selected', props.className)}` becomes `class={buildClassName(…)}`.
Keep `src/util/buildClassName.ts` and `createClassNameBuilder`. `class` diffs string tokens, so imperative
`addExtraClass` survives. Use the array/object form (`class={['Chat', { selected: isSelected() }]}`) only in new code.
`style` strings and `buildStyle` stay as in tt. `setExtraStyles` is re-applied after every string `style=` write.

### 4.5 fasterdom → frame phases

tt imports `requestMeasure`, `requestMutation`, `requestNextMutation` and `requestForcedReflow` from
`src/lib/fasterdom/fasterdom.ts`. Import the same names from `frameact` (or `frameact/scheduler`) and keep the call
sites. The phase rules are tt's own (its `AGENTS.md` table), now checked by `enableStrict()`:

| tt context                                | frameact                                                                                  | Measure | Mutate                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- | ------- | --------------------- |
| `useLayoutEffect`                         | `createMutationEffect(compute, apply)`                                                    | no      | yes                   |
| `useEffect` reading layout, `useLayout`   | `createMeasureEffect(compute, apply)`, `onMount`                                          | yes     | via `requestMutation` |
| `useSyncEffect` + `forceMeasure` snapshot | `createMeasureEffect` on the same source (runs before the mutate phase of the same frame) | yes     | no                    |
| event handler                             | event handler                                                                             | yes     | via `requestMutation` |
| `requestMeasure` / `requestMutation`      | same names                                                                                | yes/no  | no/yes                |
| `requestForcedReflow`                     | same name, or `createEffect(c, a, frameForcedReflow)`                                     | yes     | the returned function |
| scroll anchoring in `MessageList`         | `createScrollAnchor` / `<InfiniteScroll>` (`frameact/kit`)                                | —       | —                     |

Some `src/util` modules use fasterdom or teact (`animateScroll.ts`, `animateHorizontalScroll.ts`, `animation.ts`,
`switchTheme.ts`, `windowSize.ts`, `folderManager.ts`, `emoji/customEmojiManager.ts`, `localization/*`, …). They change
only their imports, plus `getIsHeavyAnimating`/`onFullyIdle`/`beginHeavyAnimation` from `frameact`. Keep
`src/util/schedulers.ts` as it is: the API worker and the media workers use it, and its `debounce` keeps tt's semantics
for ported call sites (frameact's `debounce` differs, see framework §1).

## 5. Styles and assets

- **SCSS as in tt.** Keep global stylesheets (`src/styles/index.scss` with its `@use` partials, `_variables.scss`,
  `_mixins.scss`), component `.scss` files imported for side effects, and `*.module.scss` imported as `styles`. Vite's
  CSS-modules config must match tt's: `localsConvention: 'camelCase'`, `generateScopedName` `[name]__[local]` in dev,
  hashed in production. Bring tt's `postcss.config.ts` along. These settings land with the dependency import (`sass`,
  PostCSS plugins).
- **Themes and variables.** Copy `src/styles/themes.json`, `src/util/switchTheme.ts` and the CSS custom properties in
  `index.scss` unchanged. A theme switch writes `<html>` classes and variables inside `requestMutation`, as tt already
  does.
- **Fonts and icons.** `src/assets/fonts/*` + `roboto.css` (imported in `src/index.tsx`), and `src/styles/icons.*`
  generated from `src/assets/font-icons/*.svg` by `dev/buildIcons.ts`. The `IconName` types live in
  `src/types/icons`. `Icon` (`src/components/common/icons/Icon.tsx`) ports like any component.
- **Lottie.** `.tgs` files are assets (`assetsInclude: ['**/*.tgs']`). Rendering is `src/lib/tlottie` (wasm) running in
  `src/lib/mediaWorker`, verbatim. Only the components adapt: `AnimatedSticker`, `AnimatedIconFromSticker`. Pause on
  heavy animation through `watchHeavyAnimation` (or `getIsHeavyAnimating` with `rootScope`).
- **Emoji images** are copied at build time from the `emoji-data-ios` dependency, as in tt's `vite.config.ts`. Check the
  licensing note in `NOTICE.md` first.

## 6. Workers and GramJS

How tt wires it, and what stays identical:

- `src/api/gramjs/worker/connector.ts` (UI thread) starts `new Worker(new URL('./worker.ts', import.meta.url))`,
  exposes `initApi`, `callApi(name, …args)`, `cancelApiProgress` and `callApiLocal`, and forwards updates to the
  `onUpdate` callback.
- `worker.ts` runs `src/api/gramjs/methods/*` on top of `src/lib/gramjs`. Results are plain `Api*` objects built by
  `apiBuilders`, and inputs are built by `gramjsBuilders`.
- Updates enter through `src/api/gramjs/updates/mtpUpdateHandler.ts` and merge in `src/global/actions/apiUpdaters/*`
  (the `apiUpdate` handlers).
- **All of this is verbatim**: `src/lib/gramjs`, `src/api/gramjs/{methods,apiBuilders,gramjsBuilders,updates,helpers}`,
  `src/api/types`, the TL schema and `npm run gramjs:tl` (as a pnpm script once ported), the mocked client alias.

**The one adaptation.** `callApi` and `callApiLocal` in `connector.ts` must unwrap store proxies before `postMessage`.
Apply `unwrap(arg)` to each argument, and to each value of a plain-object argument (`{ chat, threadId }`), because the
structured clone throws on a proxy. A deeper nested proxy shows up in DEV as a `DataCloneError`: fix it at the call
site with `unwrap`. The API worker answers with fresh objects, so writing results into the store needs nothing.

The other workers (`mediaWorker`, `offscreen-canvas`, `fasttextweb`, `latex`, `src/global/shared/sharedState.worker.ts`)
use `src/util/createPostMessageInterface.ts` and port verbatim. The same `unwrap` rule applies wherever UI code posts
state to them.

## 7. Process

### 7.1 Port order

Each step ends with `pnpm check` green and a dev run with a clean stricterdom console.

1. **Foundation**: dependencies and Vite parity (SCSS, CSS modules, `.tgs`, workers, static copies, `virtual:git-info`),
   `src/config.ts`, `src/types`, `src/@types`, DOM-free `src/util`.
2. **GramJS + API**: `src/lib/gramjs`, `src/api` (verbatim, plus the `connector.ts` unwrap). Smoke-test `callApi` from
   the console.
3. **Global/store**: `src/global/types`, `initialState`, `selectors`, `helpers` (verbatim); `index.ts` (the glue);
   `reducers` (writers); `actions/**`; `init.ts`. Use the compiler errors as the checklist.
4. **Auth**: `src/components/auth/*`, `src/bundles/auth.ts`, the UI primitives they need (`components/ui`, `Transition`
   adapters), and the styles.
5. **Chat list**: `src/components/left/main/*` (`ChatList` with `<ManualFor orderKey>`, `Chat`), folders, archive.
6. **Message list**: `src/components/middle/MessageList*`, `message/*`, scroll anchoring (`createScrollAnchor`), the
   `useInfiniteScroll` port.
7. **Composer**: `src/components/middle/composer/*`, `util/tiptap`, controlled inputs (`use:value`), voice recording.
8. **Right column**: `src/components/right/*` (Profile and its `teactFastList` lists → `ManualFor`).
9. **Settings**: `src/components/left/settings/*`, including the License/About TODO below.

After that: media viewer, calls, stories, payments, wallet, cache, multitab, PWA.

**TODO (GPL notices in the UI).** tt shows `${APP_NAME} ${versionString}` as the footer of the main menu
(`src/components/common/MainMenuDropdown.tsx` → the `footer` prop of `src/components/left/main/LeftSideMenuItems.tsx`).
It has no license or source link. GPL-3.0 §5(d) does not force one on a work whose original UI lacks it, but this app
will add one when porting those two files: "GPL-3.0-or-later · Source code" next to the version, linking to the
repository and `LICENSE`.

### 7.2 Per-file checklist

1. **Copy** the file from `reference/telegram-tt` to the same path, with its stylesheet. Run `pnpm format` on it, then
   commit it unchanged as `port(<area>): import <paths> from tt@<sha>`. Each file's history then starts with tt's code.
2. **Adapt imports**: `@teact` / `lib/teact/*` → `frameact`, `frameact/dom`, `frameact/kit`; `lib/fasterdom/*` →
   `frameact` / `frameact/stricterdom`; delete imports of removed hooks.
3. **Replace teact APIs**:
   - Signature to `(props)`; remove `memo` and `withGlobal`; turn state props into accessors (§3.4).
   - Hooks to primitives (framework §1, §4.2 here); conditional returns and `.map` to `<Show>` / `<For>`.
   - Refs (§4.3); `className` → `class`.
   - Effects split by phase (§4.5).
   - Identity memos to `createMemo` (§3.6); reducers and handlers to writes (§3.3–3.5).
4. **`pnpm check`**: oxlint, prettier, tsc, the script gates (diff against the reference, tt unit tests, licenses),
   the build and the bundle budgets, with zero warnings. If `gates:diff` fails, shrink the diff (port, don't rewrite)
   or allowlist the file with a reason; if `gates:tests` fails, copy the tt test next to the code. Both are described
   in [`quality-gates.md`](quality-gates.md#script-gates).
5. **Run in dev** (`pnpm dev`) and exercise the screen. The stricterdom console must be clean, with no
   `[frameact/stricterdom]` violations and no destructured-props warnings. Fix the cause; never suppress it.
   `suppressStrict` is only for third-party code.
6. **Note deviations** in the commit message (`Deviation: …`) whenever behaviour differs from tt (a missing
   `Transition` option, a deferred feature) and add a `// TODO(port): …` at the spot.
7. Commit the adaptation separately: `port(<area>): adapt <component> to frameact`.
8. **Per slice** (before the PR): run `pnpm gates` once. Read the report, not only the exit code:
   - `gates:diff` top offenders (is a big ratio really required by teact -> frameact?) and the stub list (a
     `FOUNDATION STUB` you just replaced must lose its marker);
   - `gates:tests`: tests whose subject you ported are copied and pass under `pnpm test`;
   - `gates:size`: the deltas are expected; raise a budget (`pnpm gates:size --update`) only with a reason in the PR;
   - `gates:licenses`: a new dependency has a GPL-3.0-or-later compatible license and a row in `NOTICE.md`.

### 7.3 Keeping diffs readable

- Same paths, same file and symbol names, same import order, same helper functions. Do not refactor, rename or "clean
  up" while porting; that is a separate, later commit.
- Keep the import commit and the adaptation commit separate in the PR, and merge without squashing, so
  `git show <adapt-commit>` is exactly the teact → frameact change.
- Compare against a prettier-formatted reference, so formatting does not hide real changes:
  `pnpm exec prettier --stdin-filepath x.tsx < reference/telegram-tt/<path> | diff -u - <path>`.
  `pnpm gates:diff` does this for every ported file (both sides prettier-formatted, whitespace ignored, import lines
  counted separately) and fails above 40% changed non-import lines.

### 7.4 Tracking upstream

- The reference clone is shallow. Once, run `git -C reference/telegram-tt fetch --unshallow` (or `--shallow-since`
  with a date before the baseline) so the baseline commit is reachable.
- **Bump**: run `git -C reference/telegram-tt fetch origin master`, then list upstream changes to files we already
  ported:
  `git -C reference/telegram-tt diff --stat <baseline> origin/master -- $(git ls-files src ':!src/vendor')`.
  This works because paths are kept.
- `pnpm gates:upstream` automates the listing: it reports the ported files that changed between the baseline
  recorded in `NOTICE.md` and the reference's HEAD (`--remote` compares with upstream `master` without touching the
  reference clone).
- Port the relevant changes as `port(<area>): sync with tt@<sha>`. Then `git -C reference/telegram-tt checkout
origin/master` and update the **reference baseline** line at the top of this guide, plus the baseline in `NOTICE.md`.
- New files that upstream adds are ported when their feature's milestone comes, by the same checklist.
- Every import commit names the tt commit it came from, so files can sit at different baselines and the history still
  says which.
