# Global state on frameact: the architecture

How telegram-tt's state layer (`src/global`: ~1000 action handlers in 63 files, 30 reducer files, 24 selector files,
`cache.ts`, multitab) runs on frameact's store (model B) without being rewritten. Status: decided, prototyped on
`design/store` (`src/global/index.ts`, `src/global/store/apply.ts`, tests, `pnpm bench:store`) and revised after the
architecture review (`reviews/store-architecture-review.md`: C1, C2, I1–I6 and the minors are addressed below). The
port plan is [`plans/2026-10-14-store.md`](plans/2026-10-14-store.md); the porting guide's §3 summarises this document.
Implemented on `port/state` (plan tasks T1–T5: helpers, selectors, reducers, actions, cache, the identity consumers and
multitab, all tt's files; the report is [`reports/port-state.md`](reports/port-state.md), the deviations are listed at the
end of §12).

## 1. The decision

**tt's immutable global stays the source of truth; the frameact store is a reactive mirror of it that only components
read.**

- `setGlobal(next)` **commits `next` itself** — the object a tt reducer returns (`{ ...global, chats: { ...global.chats,
byId: { ...byId, [id]: chat } } }`), with fresh objects along the written path and the same references everywhere
  else. The committed global is exactly what tt's `currentGlobal` was.
- `getGlobal()` hands out a **shallow copy** of the committed global (what tt's DEBUG build did; here in both modes,
  0.3 µs for 107 keys), stamped in DEV for the outdated-global check. Handlers receive that copy. Reducers, selectors,
  `addCallback` consumers that compare with `prevGlobal`, identity caches (`util/memoized`, WeakMaps keyed by objects),
  optimistic rollbacks, constants spread into the global — all see tt's objects, never a store object.
- The store is a **mirror**: `setGlobal` walks the previous and the next global (both immutable), stops at every
  `===` branch and writes each change into the store through `setState`, which notifies only the signals of that leaf
  (`store/apply.ts`). The walk never writes into a tt object: **entities** (plain objects with an `id`) and **arrays**
  go into the store by reference and are replaced whole when they change; **containers** (the root, the slices,
  dictionaries, id-less records, `byTabId[id]`) are the store's own shallow copies, merged key by key so that a change
  under a dictionary wakes the readers of that key only.
- Components read the mirror through `withGlobal(ownProps, mapStateToProps)` (tt's mapper, verbatim, in a memo),
  `useSelector(selector)` (an accessor) or `useGlobal()`; a read is a leaf subscription.
- Action ordering, `execAfterActions`, `forceOnHeavyAnimation`, `forceSyncOnIOs`, `forceOutdated`, `addCallback`,
  `cache.ts` and `multitab.ts` keep tt's code and semantics; `multitab.ts` and `cache.ts` differ from tt by their
  import lines only, because `deepDiff(previous, current)` and `currentGlobal === global` work on immutable snapshots.

What this buys: (a) the action/reducer/selector layer and the `addCallback` consumers port byte-identical apart from
imports (the prototype runs `actions/apiUpdaters/twoFaSettings.ts`, `reducers/tabs.ts`, `reducers/auth.ts`,
`selectors/tabs.ts`, `selectors/settings.ts`, `util/browser/multitab.ts` unchanged); (b) fine-grained reactivity in
components with no "every container on every `setGlobal`" loop; (c) tt's value and identity semantics, verified by the
review's probes as regression tests; (d) a per-write cost bounded by the key width along the changed path: a message
insert mirrors in 0.68 ms on a 2k-chat / 52k-message state whose tt reducer costs 1.2 ms of spread copies (§4). The
price is memory: the store's container copies add 16 % to the tt global (3.9 MB on 24.5 MB, 8 218 objects of 350k).

### 1.1 Alternatives considered and measured

| Option                                                                                                             | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0. The first prototype: the store's raw tree _is_ the global; `setGlobal` merges every changed object in place** | Rejected by the review (C1, C2): an object tt code captured before `setGlobal` carried the new values (`updateChat`'s changedFields were always empty, optimistic rollbacks became no-ops, aliased slots corrupted lists, WeakMap caches went stale, `INITIAL_TAB_STATE` was mutated), and callbacks got the live root, so `prevGlobal` consumers (`ui/settings.ts` theme switch, `intervals.ts` master role, `sharedStateConnector`) never fired.                                                              |
| **A. Raw tree is the global; replace entities, merge only containers in place** (the review's proposal)            | Fixes C1 (tt objects are never written into) but not C2: `getGlobal()` and the callbacks still see one live root, so `prevGlobal.x` equals `global.x` for primitives too; 6 consumers would need rewriting and every upstream sync would reintroduce the class. Same walk as the chosen design, 3.9 MB less memory, 21 ms less on a `globalUpdate` cold start (no container copies). Measured: identical hot paths (the comparison loop is the same; the copies happen only when a container is first written). |
| **B. The mirror (chosen): committed immutable global + store mirror, replace entities, copy and merge containers** | Fixes C1, C2, I1 and most of I2 at the root; `multitab.ts`, `cache.ts`, `folderManager`, `intervals.ts`, `sharedStateConnector`, `memoized` selectors stay tt's code. Cost: +15 % memory for container copies, +2 ms (cache-sized) / +21 ms (full `globalUpdate`) once at start for copying them.                                                                                                                                                                                                               |
| **C. Rewrite reducers as path writers** (`setState('chats','byId',id,merge(…))`)                                   | Best per-write cost, no walk, but ~1000 handlers re-authored by hand and upstream syncs become manual merges forever. Kept as the opt-in for a reducer that a trace shows to be hot (`setState(…, reconcile(chunk))` inside one handler).                                                                                                                                                                                                                                                                       |
| **D. `setGlobal(next)` = `setState(reconcile(next, { key: 'id' }))` at the root**                                  | Zero app code, but `reconcile` merges same-`id` entities in place (C1 again), treats arrays as keyed collections (3.4× slower on a reorder: 120 vs 35 µs) and is slower on the message insert (0.82 vs 0.68 ms). Kept in the bench as the reference.                                                                                                                                                                                                                                                            |
| **E. Replace the root as tt does and let components diff**                                                         | Impossible in model B (the root proxy is bound to one object) and it would be the container cascade again.                                                                                                                                                                                                                                                                                                                                                                                                      |

### 1.2 Semantics of the mirror walk, precisely

`applyGlobal(prev, next)` compares the committed global with the next one and writes into the store at the same path:

| Case                                                                             | Action                                                                                                                                                                                                             | Why                                                                                                                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `next[key] === prev[key]`                                                        | skip the whole branch                                                                                                                                                                                              | structural sharing: an untouched branch is the same reference                                                                                |
| both **containers** (plain, unfrozen objects without an `id`; `byTabId[id]` too) | recurse: the store's copy of the container is merged key by key                                                                                                                                                    | a change under a dictionary wakes only the readers of that key; the copy is private to the store, tt's object stays untouched                |
| a container where `prev` had none (new chat history, new tab, cold start)        | write `copyContainer(next[key])`: shallow copies down to the entities                                                                                                                                              | the store needs an object it may mutate; entities and arrays inside are shared                                                               |
| an **entity** (plain object with an `id`) that changed                           | write `next[key]` by reference (replace)                                                                                                                                                                           | tt's value semantics: the previous object is never written into; the readers of `byId[id]` re-run, as tt's container did                     |
| an entity that is a fresh copy but shallow-equal                                 | nothing                                                                                                                                                                                                            | `replaceUsers` of 5k copies with 100 real changes is 100 writes, not 5000                                                                    |
| arrays, same length, every item `===`                                            | nothing                                                                                                                                                                                                            | tt's `deepDiff` treats arrays as values; a rebuilt-but-equal `listIds` is no change                                                          |
| arrays otherwise                                                                 | write by reference                                                                                                                                                                                                 | one notification to `For`/`$TRACK` readers; rows keep their references                                                                       |
| a key missing in `next`, or `next[key] === undefined`, in a container            | delete the key in the store's copy                                                                                                                                                                                 | frameact deletes on `undefined`; an entity written whole keeps its own `undefined` keys (M2)                                                 |
| frozen objects, class instances, Dates                                           | values: written by reference, replaced                                                                                                                                                                             | frameact never wraps them (M1: a frozen record is not descended into)                                                                        |
| a store proxy inside `next` (a component handed `props.chat` to an action)       | an entity proxy → its raw tt object; a **container** proxy or a store-owned copy → a fresh plain copy, written into `next` too; one level deep inside arrays and entities as well (a DEV scan reports deeper ones) | the committed global stays proxy-free and never references the store's private copies (N1: `GiftInfoModal → openGiftUpgradeModal({ gift })`) |
| the DEV stamp `DEBUG_randomId` at the root                                       | never mirrored                                                                                                                                                                                                     | tt's outdated-global detection, kept                                                                                                         |

Cost: O(sum of key counts of the containers on changed paths) + O(length of compared arrays), never O(state). tt's
reducer already paid a spread of every one of those containers, so the walk is bounded by the reducer that feeds it
(measured at 0.5–0.6× of it, §4).

Two things remain different from tt, both deliberate:

- **Granularity inside an entity is per entity**, as in tt: a changed chat is a new object, so every binding that
  reads `props.chat.*` in that row re-runs (the row's mapper re-runs because it read `byId[id]`). Other rows do not
  move. Per-field granularity exists for containers (tab state, settings, `byKey`) and is not needed for entities.
- **A nested mutation of the committed global is invisible** (`global.stories.stateHash = …` in
  `actions/api/stories.ts`, 4 lines): the mirror follows `prev → next` by identity, and the divergence **persists**
  until that very field changes again (a later legal write of the same slice compares against the already-mutated
  `prev`). Root-level mutation after `getGlobal()` (`init.ts`) is absorbed by the shallow copy. The 4 lines become
  `global = { ...global, stories: { … } }` with a `// Deviation:` note; `src/global/store/mutationGuard.test.ts` fails
  the suite on the pattern (§10). tt has a fifth line, `util/init.ts:48` (`global.auth.state = …` under
  `IS_MOCKED_CLIENT`), which is safe and stays byte-identical: `global` there is `cloneDeep(INITIAL_GLOBAL_STATE)` or the
  freshly loaded cache, not committed yet, and `setGlobal(global)` follows; the guard has it on a safe list with that
  reason.
- **Identity caches keyed by a container, inside a component** (N2): the store's container copies keep their identity
  while their content changes, so tt's `util/memoized` (`selectors/wallet.ts`, `selectActionMessageBg`) and the two
  WeakMaps of `selectors/audioPlayer.ts` would hit forever inside a mapper and skip the reads it tracks. `memoized`
  computes every time for a store-proxy argument (one `// Deviation:` line, tested); the two WeakMaps get the same
  guard when the file is imported. Caches keyed by an entity or an array work: those are new objects when changed. In
  actions the caches see tt's objects and work as in tt.
- **`getGlobal()` inside a mapper reads the mirror** (N3). tt re-ran every mapper on every `setGlobal`, so verbatim
  helpers that call `getGlobal()` (`getCanPostInChat`, `getPeerColorCount`, `getGroupStatus`,
  `getMessageTranscription` through `renderMessageSummary` in the chat row, `renderMessageSummaryHtml`, `sortChatIds`,
  `filterPeersByQuery`, `getCurrentMaxAccountCount` — 9 helpers, called from ~30 component files) were always fresh.
  `withGlobal` and `useSelector` run their mapper under `trackGlobal()`, where `getGlobal()` returns the tracked
  mirror: the helper subscribes the mapper to the leaves it reads. Measured against a version signal that re-runs every
  such mapper on every write (§4): 19 µs / 1 re-run vs 126 µs / 2 000 re-runs — before the mappers' own work and the
  `getGlobal()` copies, i.e. tt's `updateContainers` cascade back. A ported hook or effect that calls one of the 9
  helpers wraps the call in `trackGlobal(() => …)` (codemod rule 8); `getMirrorReadsInMappers()` (DEV) sizes the
  eventual conversion of the helpers to an explicit `global`.
  Two edges of the mapper context: a memo that is **first computed** inside a mapper also reads the mirror (the same
  memo computed outside would have got the committed copy), which is why rule §12.4 turns `getGlobal()` in a memo into
  `useGlobal()`; and an **action called synchronously from a mapper** does not get the mirror: `runHandlers` clears the
  mapper context for the handler (a DEV error names the action; mappers are pure in tt as well).

### 1.3 Outdated-global detection and the copy

In DEV, `getGlobal()` returns `{ ...committed, DEBUG_randomId }` and `setGlobal` throws `[global] Attempt to set an
outdated global` when the stamp is not the current one, unless `forceOutdated` is set — tt's rule. In production the
copy is made too (without the stamp), so `global.x = …; setGlobal(global)` behaves the same in both modes (I2); tt's
production build mutated `currentGlobal` there and skipped the containers' update until the next write.

## 2. The mapping: tt API → telegram-dd API

All of it is exported from `src/global/index.ts`; tt import paths stay (`from '../../global'`), only
`lib/teact/teactn` imports move to `../global`.

| telegram-tt (`global/index.ts`, `lib/teact/teactn.tsx`)   | telegram-dd                                                                                                 | Notes                                                                                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `getGlobal()`                                             | `getGlobal()` — a shallow copy of the committed immutable global (DEV: stamped)                             | handlers, reducers, selectors from handlers, event handlers, serialisation, `postMessage`                                          |
| `global` argument of a handler / reducer / selector       | the same copy (a store proxy when a selector is called from a component through `withGlobal`/`useSelector`) | selectors are pure functions: they work on both                                                                                    |
| `setGlobal(global, options?)`                             | `setGlobal(global, options?)` — commits `global`, mirrors the change into the store                         | `forceOnHeavyAnimation` → `ungated` writes; `forceSyncOnIOs` → `ungated` + `flushSync()` + callbacks now; `forceOutdated` as in tt |
| `addActionHandler(name, handler)`                         | same                                                                                                        | several handlers per name, in registration order; a returned global is applied after each handler, as in tt                        |
| `getActions()` / `getPromiseActions()`                    | same; every call returns a `Promise<void>` (synchronous actions too, M4)                                    | one `defineActions` action per name, created at first registration (late bundles register later)                                   |
| action queue (FIFO, nested calls after the current one)   | frameact's queue (`defineActions`)                                                                          | identical ordering; a throwing handler is reported and the queue goes on (tt rethrew after draining, M7)                           |
| `execAfterActions(fn)`                                    | `afterActions` (re-exported as `execAfterActions`)                                                          | after the cascade; outside a cascade at once                                                                                       |
| `addCallback(cb)` / `removeCallback`                      | same, `cb(global)` with the committed global                                                                | once per tick after writes (throttled to tick end), deferred while a heavy animation runs unless forced — tt's `runCallbacks`      |
| `forceOnHeavyAnimationOnce()`                             | same (forces the next callbacks run; unused in tt today)                                                    |                                                                                                                                    |
| `withGlobal(mapStateToProps, activationFn?)(Component)`   | `const props = withGlobal(ownProps, mapStateToProps, activationFn?)` in the component body                  | mapper body unchanged; §5 and the codemod contract                                                                                 |
| `useSelector(sel)` and friends (`hooks/data/useSelector`) | same names, return accessors                                                                                | `createMemo(() => sel(useGlobal()))`; `useShallowSelector` uses `equals: areShallowEqual`                                          |
| —                                                         | `useGlobal()` — the tracked view (the store mirror)                                                         | the only new name: for a direct store read in JSX / a memo / an effect                                                             |
| `ActionOptions` (from teactn)                             | `ActionOptions` (from `global`)                                                                             |                                                                                                                                    |
| `GlobalState`, `TabState`, `ActionReturnType`, `TabArgs`  | unchanged (`global/types`)                                                                                  | `ActionReturnType` stays `GlobalState \| void \| Promise<void>`                                                                    |
| `typify()`                                                | gone; `RequiredGlobalActions`, `TabStateActionNames` are defined in `global/index.ts` verbatim              |                                                                                                                                    |
| `DEBUG` double-click dump of containers                   | frameact's "why did this run" (§10)                                                                         |                                                                                                                                    |

## 3. Schema

The committed global is tt's `GlobalState`, unchanged. The store mirrors it: containers as copies, entities shared.

```
GlobalState (~110 keys)                                      store: container copy
├─ auth, config, appConfig, settings{byKey, …}, sharedState   containers
├─ users{byId → ApiUser (entity), statusesById → record}      byId: container copy; each user: shared
├─ chats{byId → ApiChat (entity), listIds{active: string[]}, lastMessageIds{all}, topicsInfoById, …}
├─ messages{byChatId[chatId]{byId → ApiMessage (entity), threadsById[threadId]{listedIds, …}}}
├─ chatFolders{byId → folder (entity)}, stickers{setsById → set (entity)}, groupCalls{byId → call (entity)}, …
├─ byTabId[tabId]: TabState (container, despite its `id`) → its records (mediaViewer, globalSearch, …) containers
└─ passcode, push, serviceNotifications, …
```

- The root starts as `{ isInited: false }` and takes its shape from `initGlobal` (`util/init.ts` checks `'byTabId' in
global` to tell a fresh tab from one that got the master's global).
- `byTabId` stays inside the one tree (tt broadcasts all tabs' state to all tabs). `selectTabState(global, tabId)` over
  the mirror subscribes to `byTabId`, `byTabId[tabId]` and the fields read; `updateTabState` merges into the store's
  tab copy, so the tab proxy is stable for the session.
- Dictionaries are plain objects; frameact's `keys()/values()/entries()` read them at plain-object speed with one
  subscription where a component has to walk one. Lists of ids are arrays (values, by reference).

## 4. Measured

`pnpm bench:store` (`scripts/bench/store.ts`; `NODE_ENV=production` for the production frameact build,
`NODE_OPTIONS=--expose-gc` for the memory rows). State as in tt `090e38f`: 2 000 chats (ApiChat-shaped, no
`lastMessage`), `chats.lastMessageIds.all`, 5 000 users, 51 900 messages (100 chats × 500 + every chat's last message),
one tab, 100 extra top-level slices — 349 624 objects. A cache-sized global (tt's `GLOBAL_STATE_CACHE_*` limits:
200 chats, 500 users, 30 messages per chat, 40 024 objects) for the cold start. Subscribers model the rendered UI:
one `createMemo` per chat row (title, unread, mute, the last message's text through `lastMessageIds`), one per message of
the open chat (500), one `$TRACK` memo per list — 2 502 memos. Each row times the operation alone (the memos are pulled
afterwards, untimed; "re-runs" counts the memos that re-ran). Apple M1 Pro, Node 24.3, 300 iterations, median.
Refreshed on `port/state` (after the review fixes N1–N5 and with the state layer imported): the numbers below are the
production build; the DEV build (proxy scan of N1/N5 on, limited to written arrays and entities) is within ~10 % of them
(new message 0.72 ms, edit 0.34 ms, `replaceUsers` 5.4 ms, cold starts 12.9 / 120 ms).

| Scenario (tt-style reducer, then `setGlobal`)                                                 | mirror walk | writes | memo re-runs | `setState(reconcile(next))` | what tt pays                                                                                       |
| --------------------------------------------------------------------------------------------- | ----------- | ------ | ------------ | --------------------------- | -------------------------------------------------------------------------------------------------- |
| apiUpdate new message: `byId` +1, `listedIds`, `chat.unreadCount`, `lastMessageIds`, reorder  | 0.68 ms     | 4      | 2 of 2 502   | 0.82 ms                     | reducer 1.20 ms; `updateContainers` 0.45 ms (2 500 mappers); `deepDiff` 1.32 ms per multitab flush |
| same, chat without an open history                                                            | 0.68 ms     | 4      | 1            |                             |                                                                                                    |
| edit one subscribed message (`content.text`, `isEdited`)                                      | 0.33 ms     | 1      | 1            |                             |                                                                                                    |
| chat list reorder (new 2k-id array)                                                           | 0.035 ms    | 1      | 1            | 0.12 ms                     |                                                                                                    |
| `updateTabState` (one field)                                                                  | 4.9 µs      | 1      | 0            |                             | `updateContainers` 0.42 ms (2 000 mappers read the tab)                                            |
| `globalSearch`: a new query with 5 000 fresh results                                          | 0.71 ms     | 2      | 0            |                             | (`adopt` walks the new result objects: I6 / E3′)                                                   |
| `globalSearch`: a keystroke that keeps the results array                                      | 6.2 µs      | 1      | 0            |                             |                                                                                                    |
| `updateUsers`: 100 of 5k changed, rest shared                                                 | 1.05 ms     | 100    | 0            | 1.12 ms                     |                                                                                                    |
| `replaceUsers`: 5k fresh copies, 100 changed                                                  | 4.9 ms      | 100    | 0            |                             |                                                                                                    |
| reducer + `setGlobal` end to end, new message (bench's tt-shaped reducer)                     | 2.05 ms     |        |              |                             |                                                                                                    |
| tt's **real** `apiUpdate` `newMessage` handler + `setGlobal` (vitest, DEBUG on, no memos)     | 0.18 ms     |        |              |                             | (`BENCH_STATE=1`, `actions/apiUpdaters/messages.test.ts`)                                          |
| cold start: `setGlobal(cached global)`, 40k objects                                           | 11.6 ms     |        |              |                             | tt: a pointer swap, then every container maps                                                      |
| cold start: `setGlobal(globalUpdate)` from the master, 350k objects                           | 113 ms      |        |              |                             | (21 ms of it is `copyContainer`; variant A would skip it)                                          |
| `getGlobal()` copy of the root (107 keys)                                                     | 0.3 µs      |        |              |                             | the same copy in tt DEBUG                                                                          |
| N3: 2 000 row mappers calling a `getGlobal()` helper, per new message — mapper-context mirror | 18.7 µs     |        | 1            |                             | version signal: 123 µs, 2 000 re-runs (+0.3 µs copy each, + the mapper's work)                     |
| `cache.ts` `reduceGlobal(getGlobal())` on this state (+ `JSON.stringify` 0.16 ms, 79 KiB)     | 0.61 ms     |        |              |                             | tt's code over plain objects (`BENCH_CACHE=1`, `cache.test.ts`)                                    |
| memory: tt global alone / + the store mirror (containers copied, entities shared)             |             |        |              |                             | 24.5 MB / +3.9 MB (8 218 container copies)                                                         |

Reading it:

- The mirror walk costs half of the tt reducer that feeds it (the reducer's four 2k-key spreads dominate); frameact's
  signals are not on the hot path of a write. A burst of 100 updates/s is ~68 ms/s of walk on top of 120 ms/s of
  reducers; tt's batching helpers (`batchMessageStoreUpdates`) are inherited unchanged.
- Fine-grained reactivity holds: a message insert re-runs 2 memos out of 2 502, an edit 1, a reorder 1, a tab field 0.
  tt's `updateContainers` re-ran all 2 500 mappers on each of those (0.4–0.45 ms per `setGlobal`, before any render).
- The engine `reconcile` at the root is slower on a reorder (keyed-array pass) and would merge same-`id` entities in
  place (C1); it stays the choice for server chunks inside a handler, not for the root.
- Variant A (no committed global, no copies) has the same hot-path numbers and saves 3.9 MB and 21 ms on a
  `globalUpdate`; it does not fix C2 or the `deepDiff` multitab flush. The mirror is chosen for the semantics.
- The cold start from the cache (what a launch does) is 12 ms; the 113 ms `globalUpdate` is paid once by a new tab of a
  heavy account and is the case for engine follow-up E3 if a trace shows it.

## 5. Components: reading the store

### 5.1 The pattern

`withGlobal` moves from a HOC to a call in the component body and keeps the mapper body:

```tsx
const Chat = (ownProps: OwnProps) => {
  const props = withGlobal<OwnProps>(ownProps, (global, { chatId }): Complete<StateProps> => {
    // …the tt body, unchanged…
    return { chat, isSelected, draft /* … */ };
  });
  // props.chatId (own), props.chat (state) — getters, read where they are used
```

Mechanics (`src/global/index.ts`): the mapper runs in a `createMemo` over the mirror with
`equals: areRecordsShallowEqual`. It re-runs when a leaf it read changes (or an own prop it read, since props are
getters) and notifies its readers only when the mapped record is not shallow-equal. As in tt's container: a throwing
mapper is reported through `handleError` and the previous props stay; an inactive container (`activationFn`) is never
mapped, the first run included; the result is `{ ...mapped, ...own }` — an own prop wins whenever its key is present,
with `undefined` too (I3). Both type arguments are inferred when the call has none (the codemod drops tt's
`<OwnProps>`); with an explicit `<OwnProps>` the state props default to `{}`, so `props.stateProp` is a compile error,
never `any` (N4; `src/global/withGlobal.types.ts` is the checked contract).

Granularity, stated honestly: an entity in the mapped record (`chat`) is a **new object when it changed** (tt
semantics), so the mapper re-runs and every binding of that row that reads a state prop re-runs — tt's per-container
granularity, without tt's loop over every other container. A field of a _container_ read through the mirror
(`props.tabState.isLeftColumnShown`, `settings.byKey.x`) is a leaf subscription.

`useSelector(selector)` returns an accessor (`createMemo`), `useShallowSelector` the same with a shallow `equals`.
`getGlobal()` in an event handler stays as it is (the committed global). A read in JSX or a memo that is not through
`withGlobal`/`useSelector` uses `useGlobal()`; `getGlobal()` there would be a one-time read (the codemod flags it;
engine follow-up E2 makes it a DEV warning).

### 5.2 Before / after on three tt components

**Simple connected** — `components/middle/PremiumRequiredPlaceholder.tsx` (one own prop, one state prop):

```tsx
// tt
function PremiumRequiredPlaceholder({ userName }: StateProps) {
  const lang = useOldLang();
  const { openPremiumModal } = getActions();
  const handleOpenPremiumModal = useLastCallback(() => openPremiumModal());
  return (
    <div>
      <div>{lang('Chat.MessagingRestrictedPlaceholder', userName)}</div>
      <Link isPrimary onClick={handleOpenPremiumModal}>
        {lang('Chat.MessagingRestrictedPlaceholderAction')}
      </Link>
    </div>
  );
}
export default memo(
  withGlobal<OwnProps>((global, { userId }): Complete<StateProps> => {
    const user = selectUser(global, userId);
    return { userName: getUserFirstOrLastName(user) };
  })(PremiumRequiredPlaceholder),
);

// telegram-dd
function PremiumRequiredPlaceholder(ownProps: OwnProps) {
  const props = withGlobal<OwnProps>(ownProps, (global, { userId }): Complete<StateProps> => {
    const user = selectUser(global, userId);
    return { userName: getUserFirstOrLastName(user) };
  });
  const lang = useOldLang();
  const { openPremiumModal } = getActions();
  const handleOpenPremiumModal = () => openPremiumModal();
  return (
    <div>
      <div>{lang('Chat.MessagingRestrictedPlaceholder', props.userName)}</div>
      <Link isPrimary onClick={handleOpenPremiumModal}>
        {lang('Chat.MessagingRestrictedPlaceholderAction')}
      </Link>
    </div>
  );
}
export default PremiumRequiredPlaceholder;
```

The mapper reads `users.byId[userId]`: an update of that user re-runs it (a new object), the mapped record changes only
when the derived name changed, and the text binding updates then. Other users' updates do nothing.

**List-heavy** — `components/left/main/ChatList.tsx` + `Chat.tsx`. `ChatList` gets its order from
`useFolderManagerForOrderedIds(folderId)` (`folderManager` is an `addCallback` consumer that compares
`global.chats.byId !== prevGlobal.chatsById`; it stays tt's code, the hook returns an accessor) and renders
`orderedIds.map(id => <Chat chatId={id} …/>)` with `teactFastList`. In telegram-dd: `<ManualFor each={orderedIds()}
orderKey={…}>{(id) => <Chat chatId={id} …/>}</ManualFor>`. `Chat.tsx` keeps its 40-line mapper verbatim inside
`withGlobal(ownProps, …)`. Per row: one mapper memo subscribed to `chats.byId[id]`, `currentMessageList`,
`byTabId[tab].forumPanelChatId`, the draft, the typing status. A new message in chat X writes `chats.byId[X]` (a new
chat object), `lastMessageIds.all[X]`, the list array; X's mapper re-runs — measured: 2 memo re-runs out of 2 502 for
this scenario. tt: 2 000 `mapStateToProps` calls plus a shallow compare each (0.43 ms), then the row render.

**Tab-specific** — `components/middle/MessageListHistoryHandler.tsx`, ported for real in this branch (with
`hooks/useHistoryBack.ts`), tested in `MessageListHistoryHandler.test.tsx`:

```tsx
// tt
export default memo(withGlobal((global): Complete<StateProps> => ({
  messageLists: selectTabState(global).messageLists,
}))(MessageListHistoryHandler));

// telegram-dd (inside the component)
const props = withGlobal(ownProps, (global): Complete<StateProps> => ({
  messageLists: selectTabState(global).messageLists,
}));
…
<For each={props.messageLists ?? []}>{(messageList) => <MessageHistoryRecord chatId={messageList.chatId} … />}</For>
```

`selectTabState(global)` with the default `tabId = getCurrentTabId()` works unchanged over the mirror. The test shows a
write to another field of the same tab (`isLeftColumnShown`) does not touch the rows, and that a reducer replacing
`messageLists` with `[first, second]` keeps the first row (the same tt object → the same `For` row by reference),
pushing exactly one more history record. Deviation noted in the file: rows are keyed by the entry object, not by tt's
`${chatId}_${threadId}_${type}_${i}` string.

## 6. Multitab

`util/establishMultitabRole.ts` and `util/browser/multitab.ts` are tt's code; `multitab.ts` differs by its two teact
import lines. It works because the globals are immutable snapshots again:

- the `addCallback` consumer keeps `currentGlobal` and posts `deepDiff(lastBroadcastDiffGlobal, currentGlobal)` at the
  idle flush (`onFullyIdle` + 500 ms fallback) — the diff of **final states**, so a local write that the master
  superseded before the flush is never broadcast (I1, regression-tested);
- a received `globalDiffUpdate` is applied with `deepMerge(getGlobal(), diff)` → `setGlobal(global)`; the callback
  then sees `currentGlobal === global` and does not echo it;
- `globalUpdate` posts `getGlobal()` (tt objects, no proxies: `structuredClone` works).

Cost: tt's `deepDiff` is 1.2 ms per flush on the bench state (tt paid the same). The journal of the first prototype is
gone: it had no consumer left and could not express "replace" in tt's diff format across flushes.

## 7. Cache and persistence

`src/global/cache.ts` ports unchanged except its two imports (`addCallback`/`removeCallback` from `./index`,
`getIsHeavyAnimating`/`onFullyIdle` from `frameact`): `setupCaching` → `addCallback(updateCacheThrottled)` (5 s
throttle, `onFullyIdle`, skipped while a heavy animation runs); `updateCache` → `reduceGlobal(getGlobal())` picks and
trims the cached slices from tt objects (`pick`, spreads, `MAIN_IDB_STORE.set` as they are); `loadCache`/`migrateCache`
build a new global and `util/init.ts` does `setGlobal(global)` → the mirror writes the cached tree once at start
(12 ms for a cache-sized global, §4). The passcode vault path and `clearGlobalForLockScreen` (which spreads
`INITIAL_GLOBAL_STATE` without cloning — safe now: constants are never written into) are unchanged. The round trip is
tested with `fake-indexeddb` in `src/global/index.test.ts`.

## 8. The update pipeline from the API worker

Unchanged end to end: `api/gramjs/worker/connector.ts` receives `postMessage` from the worker and calls the `onUpdate`
callback, which is `getActions().apiUpdate`. `apiUpdate` is one queued action with ~12 registered handlers
(`actions/apiUpdaters/*.ts`), run in registration order; each returns a new global or `undefined`, and `setGlobal`
commits and mirrors each result before the next handler runs (so later handlers see earlier results, as in tt). Nested
actions from an updater queue after the cascade. The worker's update objects are fresh plain objects; the walk writes
them into the store by reference. A burst of updates is N walks; tt's own batching (`batchMessageStoreUpdates`,
`updateManager`'s update packs) is the first lever if a sync burst shows in traces, before any handler is touched.

## 9. Parking, `live()` and `ungated()` policy

frameact parks a frame effect whose only reason to run is a store write while a heavy animation runs in its scope
chain; tickEnd effects, event handlers and imperative reads never wait, controlled inputs (`use:value`) never wait:

| tt                                                                     | telegram-dd                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actions.x(payload, { forceOnHeavyAnimation: true })` (35 sites)       | the handler runs under `ungated`: its synchronous writes release the parked readers of the written leaves at once (tt forced _every_ container; a reader parked by an earlier, unrelated write stays parked until the animation ends — M6). An async handler's writes after `await` need `ungated(() => setGlobal(…))` explicitly (the codemod marks them) |
| `{ forceSyncOnIOs: true }` (7 sites: iOS swipe-back, View Transitions) | `ungated` + `flushSync()` + callbacks now. Not callable from inside a frame pass (`flushSync` is not reentrant); the 7 sites are event handlers                                                                                                                                                                                                            |
| `forceOnHeavyAnimationOnce()`                                          | same name: the next callbacks run is forced (unused in tt today)                                                                                                                                                                                                                                                                                           |
| `runCallbacks` deferred while animating                                | same (`getIsHeavyAnimating()`, re-armed on `rootScope.isAnimating.once`)                                                                                                                                                                                                                                                                                   |

What must never wait, and how it is guaranteed: **composer and inputs** (`use:value`/`use:checked` bindings are pinned
live by the engine; the draft text lives in the component / tiptap, not in the store); **typing indicators, upload and
download progress, call UI, audio player time** — `live()` reads in those components (the list is in the plan, T6); a
`<Transition>` creates a scope per subtree, so the chat list keeps updating while the right column slides; the global
`beginHeavyAnimation` parks everything store-driven, which is what tt did in `runCallbacks`.

## 10. Dev tooling

- **stricterdom** is unchanged by the store: writes happen in actions and event handlers, reads are phase-free.
- **"Why did this run"**: frameact names store leaves `store.<key>` in DEV; its "Slow store update" warning (> 7 ms per
  cascade) replaces tt's "Slow containers update".
- **A write log in DEV**: `addCallback((global) => …)` with `deepDiff(prev, global)` is tt's own tool; a
  `window.__globalDiffLog` ring buffer behind `DEBUG_MORE` is a one-line addition when debugging a screen.
- **Nested-mutation guard**: oxlint 1.88 has no `no-restricted-syntax`, so `src/global/store/mutationGuard.test.ts`
  scans `src/global/**` and `src/util/**` for a nested write on any `…global` variable (`global.a.b = …`, compound
  assignment, `delete`, `global.a[k] = …`, `global.a.b.push(…)` and the other mutating methods; a line marked
  `// Deviation` is exempt, and so is the safe-listed `util/init.ts:48`) and fails `pnpm test`; the codemod flags
  `getGlobal()` in JSX/memos.
- **`getMirrorReadsInMappers()`** (DEV): the count of `getGlobal()` reads made from mappers — the helpers to convert.
- `window.getGlobal/setGlobal/getActions` in DEV as in tt; with `DEBUG_MORE` a `window.__globalDiffLog` ring buffer
  (the last 100 `deepDiff`s between consecutive callback runs).

## 11. What frameact lacks (engine follow-ups, clean-room in the frameact repo)

Nothing blocks the port. Re-decided against the review:

1. **E3′ `adopt` stops at objects the store already owns** — needed. When a record is written by reference and points
   at a large subtree the store already holds but nobody has read through a proxy, `adopt()` re-walks it on every
   write: a new `globalSearch` record with 5k fresh results costs 0.55 ms (§4). A "store-owned" mark (`WeakSet` at
   adopt time, or a node without a proxy) makes `adopt` O(new objects). Until it lands the container rule keeps the
   keystroke path at 4.5 µs (the results array is shared, only the record is merged).
2. **E2 `isTracking()`** — DEV only: a warning in `getGlobal()` when it is called inside a tracked computation (the
   caller wanted `useGlobal()`). The compat layer cannot see a running computation from outside. Never a behaviour
   switch: `getGlobal()` must mean the same thing everywhere.
3. **E3 bulk adopt** — low priority: the `globalUpdate` of a full master state is 113 ms for 350k objects (21 ms of it
   container copies, the rest `adopt`'s per-object work); the cache-sized start is 12 ms. Only if a start-up trace shows it.

Dropped: `onStoreWrite` (no consumer: there is no journal; multitab and the cache work on snapshots) and
`reconcile({ arrays: 'value' })` (the walk exists, and `reconcile` would merge same-`id` entities in place).

## 12. Codemod contract (for `.worktrees/codemod`)

Exact before → after shapes for the call sites the codemod touches. Under `src/global/**` and in the `addCallback`
consumers nothing changes except imports; the known deviations are listed at the end.

1. **Imports**

   ```ts
   import { withGlobal, getActions, getGlobal } from '../../global'; // unchanged
   import { addCallback, removeCallback } from '../../lib/teact/teactn'; // → from '../../global'
   import type { ActionOptions } from '../../lib/teact/teactn'; // → from '../../global'
   import { memo } from '../../lib/teact/teact'; // delete; `memo(X)` → `X`
   ```

2. **`withGlobal` HOC → body call** (the mapper and the activation function are moved verbatim; **the type argument
   is dropped** — with it, `StateProps` would default to `{}` and every state-prop read would fail to compile; without
   it both types are inferred from `ownProps` and the mapper's return type)

   ```tsx
   // before
   const Comp: FC<OwnProps & StateProps> = ({ a, b = 1, c }) => { BODY };
   export default memo(withGlobal<OwnProps>(MAPPER, ACTIVATION?)(Comp));
   // after
   const Comp = (ownProps: OwnProps) => {
     const props = withGlobal(ownProps, MAPPER, ACTIVATION?);   // OwnProps & StateProps, getters
     BODY with a → props.a, c → props.c, b → (props.b === undefined ? 1 : props.b)   // a destructuring default
   };
   export default Comp;
   ```

   (`props.b ?? 1` is not the same: a destructuring default applies to `undefined` only, not to `null`.)

   If `BODY` already binds `props`, name the statement `p` and rewrite to `p.a`. `withGlobal(() => ({}))` (no mapper) →
   `withGlobal(ownProps, () => ({}))` or just `ownProps`. `Complete<StateProps>` stays. A mapper that destructures own
   props `(global, { chatId })` stays (it runs inside the memo). The hooks → primitives rewrite applies to `BODY` as
   usual.

3. **`useSelector` family** — call unchanged, usage gets a call:

   ```ts
   const chat = useSelector(selectCurrentChat); // unchanged line
   chat.title; // → chat().title
   const x = useShallowSelector(sel);
   x.y; // → x().y
   const sig = useSelectorSignal(sel);
   sig(); // unchanged (it was a signal already)
   ```

4. **`getGlobal()` in components** — unchanged inside event handlers, effect bodies, timers; **flag** (do not rewrite)
   a `getGlobal()` in JSX, in a `useMemo`/`createMemo` callback, **or in the body of a component or a hook** (a frameact
   body runs once, so the read is a one-time snapshot): it should be `useGlobal()` or an accessor. The hook bodies in tt
   that do this: `hooks/media/useThumbnail.ts:11` (theme, thumb), `hooks/useMultiaccountInfo.ts:24`
   (`auth.rememberMe`), `hooks/reducers/useFoldersReducer.ts:61` (the initial folder state) and
   `components/story/hooks/useStoryPreloader.ts:76`; `components/common/hooks/useCustomEmoji.ts:15,17` read an initial
   value in a lazy `useState` initialiser and then follow `customEmojiManager`, which is fine.

5. **`getActions()`** — unchanged, including destructuring and the options argument.

6. **Handlers in `src/global/actions/**`** — no rewrite. Markers only: an `async` handler whose action is called with
   `{ forceOnHeavyAnimation: true }` somewhere gets `// TODO(port): writes after await need ungated()`; a nested
   mutation of `global` (`global.a.b = …`, the `\bglobal(\.\w+){2,}\s*=` pattern) is flagged for a `// Deviation:`
   rewrite to a spread.

7. **Identity-based memos and deps** — `useMemo(() => f(x), [chat])` is rewritten to `createMemo(() => f(x))` because
   `useMemo` does not exist. An **entity** prop is a new object when it changed, so identity deps on entities were
   sound; a **container** prop (a tab record, `settings`, an id-less record) keeps its identity while its content
   changes, so a `useEffect`/`useMemo` whose deps list a container must become an effect/memo over the fields it
   reads, never an identity comparison. The codemod flags deps whose type has no `id`.

8. **Helpers that read `getGlobal()`** (`getCanPostInChat`, `getPeerColorCount`, `getGroupStatus`,
   `getMessageTranscription`/`renderMessageSummary`, `renderMessageSummaryHtml`, `sortChatIds`, `filterPeersByQuery`,
   `getCurrentMaxAccountCount`) — inside `withGlobal`/`useSelector` mappers nothing to do (the mapper context tracks
   them); a call from a ported hook, a `createMemo` or an effect is wrapped: `trackGlobal(() => getCanPostInChat(chat))`.
   A call **in JSX** (`{getGroupStatus(lang, chat)}` in `GroupChatInfo`, `{renderMessageSummary(…)}` in `ChatMessage` /
   `WebLink`) needs no wrapper: it is a binding that re-runs with what it reads from props, which equals tt (there it
   refreshed only on a re-render); wrap it only where the value must follow the global on its own. A helper that caches
   by the identity of `getGlobal()`'s root must not be called from a mapper (the mirror's root is permanent, so the
   cache would hit forever); tt has none reachable from a mapper.

Known deviations after the port (each is marked `// Deviation:` in the file; everything else under `src/global` is
byte-identical to tt apart from import lines):

| File                                  | Deviation                                                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `global/index.ts`                     | the glue replacing TeactN (a rewrite, allowlisted at 95 %)                                                                               |
| `global/actions/api/stories.ts`       | 4 lines: `global.stories.stateHash = …` etc. become `global = { ...global, stories: { ...global.stories, … } }` (nested mutation, §1.2)  |
| `global/actions/apiUpdaters/users.ts` | `throttleWithFullyIdle(fn)` → `throttleWith(onFullyIdle, fn)`: frameact exports `throttleWith` and `onFullyIdle`, not tt's helper        |
| `global/actions/ui/bots.ts`           | `@ts-expect-error` → `@ts-ignore` on the `actions[action](…)` union call: tsc 7 does not report it, so tt's directive is unused (TS2578) |
| `global/selectors/audioPlayer.ts`     | 2 WeakMap guards (`unwrap(x) !== x` bypasses the cache for a store proxy, N2)                                                            |
| `util/memoized.ts`                    | the same guard in `memoized()` (an import and 5 lines)                                                                                   |
| `hooks/useFolderManager.ts`           | the four hooks return accessors backed by signals that the `folderManager` callbacks set (no `useForceUpdate`); allowlisted at 90 %      |

Not deviations of the state layer but listed here because they are edits outside tt's files: the FOUNDATION STUBs that
cut the state layer off from UI/teact code (`reports/port-state.md`), `src/index.tsx` (the boot order of tt, the actions
loaded as tt loads them), and `tests/e2e/strictMonitor*.ts` (the MockClient probe request is expected; an uncaught error
shows as `console.error` because tt's `handleError` calls `preventDefault()`).

## 13. Risks

| Risk                                                                                                              | Mitigation                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A nested mutation of the committed global is invisible to the mirror (and stays so until the field changes again) | 4 known lines in `stories.ts` → spreads; `mutationGuard.test.ts`; the codemod flag                                                                                                      |
| Memory: container copies (+15 % of the tt global on the bench state)                                              | Entities (the bulk) are shared; measured 3.9 MB on 24.5 MB; the `tests/perf` leak cycle watches long sessions                                                                           |
| `adopt` re-walks a large unread subtree when a record that references it is written (I6)                          | The container rule keeps the hot cases off that path (4.5 µs per keystroke); E3′ removes the rest (0.55 ms per new result set today)                                                    |
| Walk cost on very wide dictionaries (10k+ messages of one chat, 10k chats)                                        | Bounded by the spreads tt already pays (0.5–0.6× of the reducer); `BENCH_CHATS=10000 BENCH_MESSAGES_PER_CHAT=5000 pnpm bench:store`; the opt-in is `reconcile(byId)` inside one reducer |
| `forceOnHeavyAnimation` releases the readers of the written leaves, not every parked reader (M6)                  | Document; the 35 sites write what they want shown                                                                                                                                       |
| A thrown exception in a handler is reported, not rethrown (M7)                                                    | Document; tt's `handleError` still alerts in DEV                                                                                                                                        |
| `undefined` deletes a container key (tt kept it)                                                                  | Reads are identical; entities keep their own `undefined` keys; `in`/`Object.keys` consumers over the global are rare                                                                    |
| Cold start of a full `globalUpdate` (113 ms once for a heavy account's new tab)                                   | Measured once per tab open; E3 if a trace shows it; the cache-sized start is 12 ms                                                                                                      |
