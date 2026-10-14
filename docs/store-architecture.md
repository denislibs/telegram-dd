# Global state on frameact: the architecture

How telegram-tt's state layer (`src/global`: ~1000 action handlers in 63 files, 30 reducer files, 24 selector files,
`cache.ts`, multitab) runs on frameact's store (model B) without being rewritten. Status: decided and prototyped on
`design/store` (`src/global/index.ts`, `src/global/store/apply.ts`, tests, `pnpm bench:store`); the port plan is
[`plans/2026-10-14-store.md`](plans/2026-10-14-store.md). The porting guide's §3 summarises this document.

## 1. The decision

**Keep tt's immutable update model in the action layer and translate it into in-place store writes at the boundary.**

- `getGlobal()` returns the **raw store tree** (plain objects, read untracked). Handlers, reducers and selectors run on
  it exactly as in tt: a reducer spread-copies the path it changes and leaves every other branch as the same reference.
- `setGlobal(next)` walks `next` against the raw tree, **stops at every `===` branch** (tt's structural sharing makes
  the unchanged 99.9 % of the state free to skip) and writes each changed leaf through frameact's `setState`, which
  notifies only the signals of that leaf. Objects are merged in place, so every identity the UI holds (proxies, `For`
  rows) survives. The same walk records a journal in tt's `deepDiff` format, which feeds multitab and other
  change consumers.
- Components read the **tracked view** (`useGlobal()`, the store proxy) through `withGlobal(ownProps, mapStateToProps)`
  and `useSelector(selector)`; a read is a leaf subscription, so a chat row re-runs when its chat changes and nothing
  else does.
- Action ordering, `execAfterActions`, `forceOnHeavyAnimation`, `forceSyncOnIOs`, `forceOutdated`, `addCallback`, the
  cache's throttled serialiser and the multitab protocol keep tt's semantics; the pieces that depended on identity of
  the previous global (`deepDiff(prev, current)`, `global.chats.byId !== prevGlobal.chatsById`) use the journal instead.

What this buys: (a) the ~400 action/reducer/selector files port byte-identical apart from imports (the prototype runs
`actions/apiUpdaters/twoFaSettings.ts`, `reducers/tabs.ts`, `reducers/auth.ts`, `selectors/tabs.ts`,
`selectors/settings.ts` unchanged); (b) fine-grained reactivity in components with no global re-render cascade;
(c) tt's semantics, including DEV detection of an outdated global; (d) a cost per write proportional to the key width
along the changed path, measured at 0.24 ms for a message insert on a 2k-chat / 52k-message state (§4), while the tt
reducer that produces it costs 0.52 ms of spread copies on the same state.

### 1.1 Alternatives considered

| Option                                                                                                                                                                      | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Rewrite reducers as path writers** (`setState('chats','byId',id,merge(...))`), handlers write instead of returning (the plan in porting-guide §3 before this document) | Best per-write cost and no walk, but every one of the ~400 files changes in every function; ~1000 handlers re-authored by hand, each a chance to diverge from tt; upstream syncs (`gates:upstream`) become manual merges forever. Rejected as the default; kept as the opt-in for hot paths that measure badly (`setState(…, reconcile(chunk))` is a one-line change inside a handler and has the same semantics as the walk).                                                                                          |
| **B. `setGlobal(next)` = `setState(reconcile(next))` at the root** (frameact's reconcile does the structural-sharing diff)                                                  | Same semantics as the chosen walk (merge in place, replace on `id` mismatch), zero app code. Measured 1.6× slower on a message insert (0.39 vs 0.24 ms) and 4.5× on a chat-list reorder (0.12 vs 0.026 ms): keyed arrays get a `Map` pass and every index is compared and written, where tt's array semantics are "a value". It also produces no journal, so multitab and identity-based consumers have nothing to read. Kept as the reference implementation and the fall-back when the walk's semantics are in doubt. |
| **C. Replace the root as tt does and let components diff**                                                                                                                  | Impossible in model B (the root proxy is bound to one object) and would reintroduce the container cascade: replacing `chats.byId` notifies every reader under it.                                                                                                                                                                                                                                                                                                                                                       |
| **D. Snapshot per write (copy on write after `getGlobal()`), tt's `deepDiff` as before**                                                                                    | A snapshot of a 100k-object tree is O(n) per tick; multitab alone paid 0.5 ms per idle flush in tt for `deepDiff` (measured). The journal costs 4 µs for the same diff.                                                                                                                                                                                                                                                                                                                                                 |
| **The chosen walk (`src/global/store/apply.ts`)**                                                                                                                           | In app code, 150 lines, no engine change; byte-identical reducers; journal for free; semantics identical to `reconcile` so hot paths can move to the engine primitive later.                                                                                                                                                                                                                                                                                                                                            |

### 1.2 Semantics of the walk, precisely

For `setGlobal(next)` the walk compares `next` with the raw tree from the root:

| Case                                                                       | Action                      | Why                                                                                                                                                                                |
| -------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next[key] === raw[key]`                                                   | skip the whole branch       | structural sharing: an untouched branch is the same reference                                                                                                                      |
| both plain objects, same `id` (or none)                                    | recurse, merge in place     | keeps identities under it; only changed leaves notify                                                                                                                              |
| both plain objects, different `id`                                         | replace the object          | another entity; merging into the old object would corrupt an alias of it (`chat.lastMessage` is often the same object as `messages.byId[id]`). Same rule as frameact's `reconcile` |
| both arrays, same length, every item `===`                                 | nothing                     | tt's `deepDiff` treats arrays as values; a rebuilt-but-equal `listIds` is no change                                                                                                |
| arrays otherwise                                                           | replace the array           | one notification to `For`/`$TRACK` readers; items keep their references, so rows survive                                                                                           |
| a key missing in `next`, or `next[key] === undefined`                      | delete the key              | frameact deletes on `undefined` (`in` and `Object.keys` are honest; tt kept the key with `undefined`, a difference reads never see)                                                |
| class instances, Dates, frozen objects                                     | replace                     | values for frameact (never wrapped)                                                                                                                                                |
| a store proxy inside `next` (a component handed `props.chat` to an action) | unwrapped before comparison | `===` holds against the raw object; the engine unwraps on write too                                                                                                                |
| the DEV stamp `DEBUG_randomId` at the root                                 | never stored                | tt's outdated-global detection, kept (below)                                                                                                                                       |

Cost: O(sum of key counts of the objects on changed paths) + O(length of replaced arrays), not O(state). Containers
keep a cached own-key count (`WeakMap`), so a 2k-key `byId` costs one `Object.keys(next)` and one loop; in DEV the
count is verified on every visit and a write that bypassed the walk throws.

Two things are not the same as in tt, by design:

- **In-place merge keeps aliases in sync.** In tt `chat.lastMessage` and `messages.byId[id]` diverge after one of
  them is updated; here an update of the same entity (same `id`) through either path is visible through both. tt
  code always updates both anyway.
- **Identity no longer means change.** `prev.chats.byId !== global.chats.byId` is always `false` now. Code that used
  it (`util/folderManager.ts`, a few `addCallback` consumers, `util/memoized` selectors, `useMemo(..., [byId])` in
  components) reads the journal (`addCallback((global, diff) => …)`, keys of `diff.chats.byId` are the changed chats)
  or becomes a `createMemo` over the tracked view. The plan lists every site.

### 1.3 Outdated-global detection and the DEV copy

In DEV, `getGlobal()` returns `{ ...raw, DEBUG_randomId }` (a 110-key spread, 0.2 µs) and `setGlobal` throws
`[global] Attempt to set an outdated global` when the stamp is not the current one, unless `forceOutdated` is set —
tt's rule, same message shape. The copy also absorbs the sloppy `global.x = …; setGlobal(global)` writes tt has in a few
places, as tt's own DEBUG copy did. In production `getGlobal()` is the raw root itself (no copy).

## 2. The mapping: tt API → telegram-dd API

All of it is exported from `src/global/index.ts`; tt import paths stay (`from '../../global'`), only
`lib/teact/teactn` imports move to `../global`.

| telegram-tt (`global/index.ts`, `lib/teact/teactn.tsx`)   | telegram-dd                                                                                    | Notes                                                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `getGlobal()`                                             | `getGlobal()` — the raw tree (DEV: stamped shallow copy)                                       | handlers, reducers, selectors from handlers, event handlers, serialisation, `postMessage`                                          |
| `global` argument of a handler / reducer / selector       | the same raw object (a proxy when a selector is called from a component)                       | selectors are pure functions: they work on both                                                                                    |
| `setGlobal(global, options?)`                             | `setGlobal(global, options?)` — the structural walk + journal                                  | `forceOnHeavyAnimation` → `ungated` writes; `forceSyncOnIOs` → `ungated` + `flushSync()` + callbacks now; `forceOutdated` as in tt |
| `addActionHandler(name, handler)`                         | same                                                                                           | several handlers per name, in registration order; a returned global is applied after each handler, as in tt                        |
| `getActions()` / `getPromiseActions()`                    | same                                                                                           | one `defineActions` action per name, created at first registration (late bundles register later)                                   |
| action queue (FIFO, nested calls after the current one)   | frameact's queue (`defineActions`)                                                             | identical ordering; a throwing handler is reported and the queue goes on                                                           |
| `execAfterActions(fn)`                                    | `afterActions` (re-exported as `execAfterActions`)                                             | after the cascade; outside a cascade at once                                                                                       |
| `addCallback(cb)` / `removeCallback`                      | same, `cb(global, diff?, remoteDiff?)`                                                         | once per tick after writes (throttled to tick end), deferred while a heavy animation runs unless forced — tt's `runCallbacks`      |
| `forceOnHeavyAnimationOnce()`                             | same                                                                                           |                                                                                                                                    |
| `withGlobal(mapStateToProps, activationFn?)(Component)`   | `const props = withGlobal(ownProps, mapStateToProps, activationFn?)` in the component body     | mapper body unchanged; §5 and the codemod contract                                                                                 |
| `useSelector(sel)` and friends (`hooks/data/useSelector`) | same names, return accessors                                                                   | `createMemo(() => sel(useGlobal()))`; `useShallowSelector` uses `equals: areShallowEqual`                                          |
| —                                                         | `useGlobal()` — the tracked view                                                               | the only new name: for a direct store read in JSX / a memo / an effect                                                             |
| `ActionOptions` (from teactn)                             | `ActionOptions` (from `global`), plus `fromRemote` (multitab, §6)                              |                                                                                                                                    |
| `GlobalState`, `TabState`, `ActionReturnType`, `TabArgs`  | unchanged (`global/types`)                                                                     | `ActionReturnType` stays `GlobalState \| void \| Promise<void>`                                                                    |
| `typify()`                                                | gone; `RequiredGlobalActions`, `TabStateActionNames` are defined in `global/index.ts` verbatim |                                                                                                                                    |
| `DEBUG` double-click dump of containers                   | frameact's "why did this run" + the DEV write journal (§9)                                     |                                                                                                                                    |

## 3. Schema

One store, one root object that lives for the session; tt's `GlobalState` type, unchanged:

```
GlobalState (~110 keys)
├─ auth, config, appConfig, settings{byKey, notifyDefaults, themes…}, sharedState{settings…}
├─ users{byId, statusesById, fullInfoById…}   chats{byId, listIds{active,archived,saved}, orderedPinnedIds,
│                                                   lastMessageIds, topicsInfoById, notifyExceptionById, isFullyLoaded…}
├─ messages{byChatId[chatId]{byId, threadsById[threadId]{listedIds, lastViewportIds, threadInfo, localState…}}, sponsoredByChatId…}
├─ chatFolders, stickers, customEmojis, reactions, groupCalls, phoneCall, stories, payments, stars, wallet, …
├─ byTabId[tabId]: TabState  (id, messageLists, isLeftColumnShown, notifications, mediaViewer, audioPlayer, forwardMessages, …)
└─ passcode, push, serviceNotifications, …
```

- The root starts as `{ isInited: false }` and takes its shape from `initGlobal` (`util/init.ts` checks `'byTabId' in
global` to tell a fresh tab from one that got the master's global; a pre-shaped store would break that).
- `byTabId` stays inside the one tree (tt broadcasts all tabs' state to all tabs). `selectTabState(global, tabId)` over
  the proxy subscribes to `byTabId`, `byTabId[tabId]` and the fields read; `updateTabState` merges into the tab object,
  so the tab proxy is stable for the session.
- Dictionaries (`byId`) are plain objects; frameact's `keys()/values()/entries()` read them at plain-object speed with
  one subscription where a component has to walk one. Lists of ids are arrays (values, replaced whole).
- Nothing in the tree is frozen (frameact treats a frozen object as a value); `INITIAL_GLOBAL_STATE` is cloned into
  the store (`cloneDeep`, as tt does for `reset`).

## 4. Measured

`pnpm bench:store` (`scripts/bench/store.ts`; `NODE_ENV=production` for the production frameact build). State: 2 000
chats (ApiChat-shaped, 18 fields, each with a `lastMessage`), 5 000 users, 52 000 messages (100 chats × 500 + the last
messages), a 2 000-id chat list, one tab, 60 extra top-level slices. Subscribers model the rendered UI: one `createMemo`
per chat row (title, unread, last-message text, mute), one per message of the open chat (500), one `$TRACK` memo per
list. Each row times the operation alone (the memos are pulled afterwards, untimed; "recomputes" counts the memos that
re-ran). Apple M1 Pro, Node 24.3, 300 iterations, median / p90.

| Scenario (tt-style reducer, then `setGlobal`)                                      | compat walk    | writes | memo re-runs | `setState(reconcile(next))` | what tt pays                                           |
| ---------------------------------------------------------------------------------- | -------------- | ------ | ------------ | --------------------------- | ------------------------------------------------------ |
| apiUpdate new message: `byId` +1, `listedIds` +1, `chat.lastMessage`, list reorder | 0.24 / 0.29 ms | 4      | 2 of 2502    | 0.39 / 0.43 ms              | reducer 0.52 ms; `deepDiff` 0.49 ms per multitab flush |
| same, for a chat without an open history                                           | 0.26 ms        | 4      | 1            |                             |                                                        |
| edit one message of the open chat (`content.text`, `isEdited`)                     | 0.10 ms        | ≤3     | 1 row        |                             |                                                        |
| chat list reorder (new 2k-id array)                                                | 0.026 ms       | 1      | 1 (the list) | 0.12 ms                     |                                                        |
| `updateTabState` (one field)                                                       | 2.4 µs         | 1      | 0            |                             |                                                        |
| `updateUsers`: 100 of 5k changed, rest shared                                      | 0.62 ms        | 100    | 0            | 1.06 ms                     |                                                        |
| `replaceUsers`: 5k fresh copies, 100 changed (no sharing: the worst case)          | 2.3 ms         | 100    | 0            |                             |                                                        |
| journal → tt diff after the message batch                                          | 4 µs           |        |              | —                           | `deepDiff` 0.49 ms                                     |
| reducer + `setGlobal` end to end for the new message                               | 1.07 ms        |        |              |                             |                                                        |
| `setGlobal(cachedGlobal)` into the empty store at start (whole tree, 60k objects)  | 49 / 59 ms     |        |              |                             | tt: a pointer swap, then every container maps          |
| DEV `getGlobal()` copy of the root                                                 | 0.2 µs         |        |              |                             | same copy in tt DEBUG                                  |

Reading it:

- The walk costs less than the tt reducer that feeds it (the reducer's two 2k-key spreads dominate; we inherit tt's
  batching helpers — `batchMessageStoreUpdates` and friends — unchanged). A burst of 100 updates/s is ~25 ms/s of walk.
- Fine-grained reactivity holds under load: a message insert re-runs 2 memos out of 2 502 (the chat row and the
  list), an edit re-runs the row, a reorder only the list memo. tt re-ran every mounted container's `mapStateToProps`
  (hundreds) on each of those.
- The engine `reconcile` is 1.6–4.5× slower here because it treats arrays as keyed collections and compares each
  index; it stays the choice for server chunks (`reconcile(messagesChunk)` keeps row identity by `id`, which the
  "arrays are values" rule does not need because tt stores entities in `byId` dictionaries, not arrays).
- The cold start (49 ms once) is the price of writing 60k objects through `setState`; tt pays that time later, spread
  over the first render's container mapping. If it shows in start-up traces, the engine follow-up in §10 (adopt a
  subtree without per-leaf validation) brings it to the cost of the walk alone.
- DEV and production numbers are within 10 %: the DEV key-count verification and frameact's DEV counters are cheap.

## 5. Components: reading the store

### 5.1 The pattern

`withGlobal` moves from a HOC to a call in the component body and keeps the mapper body:

```tsx
const Chat = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, (global, { chatId }): Complete<StateProps> => {
    // …the tt body, unchanged…
    return { chat, isSelected, lastMessage: chat?.lastMessage /* … */ };
  });
  // props.chatId (own), props.chat (state) — getters, read where they are used
```

Mechanics (`src/global/index.ts`): the mapper runs in a `createMemo` over the tracked global with
`equals: areRecordsShallowEqual`. It re-runs when a leaf it read changes (or an own prop it read, since props are
getters) and notifies its readers only when the mapped record is not shallow-equal. The result is merged with the own
props (`mergeProps`, own props win as in tt's `{...mapped, ...own}`). Two consequences give the fine granularity:

1. Store objects in the mapped record (`chat`, `user`, `draft`) are **stable proxies**: a field edit does not change
   them, so the mapper's record stays shallow-equal and nothing downstream re-runs through the mapper.
2. The component reads `props.chat.title` in a binding: that read subscribes **the binding** to the `title` leaf
   directly. An edit of the title re-runs that one text binding, not the mapper and not the component.

So a mapper that reads 25 fields (tt's `Chat.tsx`) costs one memo per row and re-runs only when one of those 25 leaves
changes, and most edits never reach it. This is the per-container granularity tt had, minus the "every container on
every `setGlobal`" loop, plus per-field granularity for everything the body reads from a store object.

`useSelector(selector)` returns an accessor (`createMemo`), `useShallowSelector` the same with a shallow `equals`.
`getGlobal()` in an event handler stays as it is (raw, current). A read in JSX or a memo that is not through
`withGlobal`/`useSelector` uses `useGlobal()`; `getGlobal()` there would be a one-time read (the codemod flags it).

Memory: one memo per `withGlobal` component instance (~150 B + links) instead of tt's container record; per-key memos
were considered and rejected (25 × 2k rows = 50k nodes for the chat list) because leaf subscriptions through the
proxies already give per-field updates.

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
  const props = withGlobal(ownProps, (global, { userId }): Complete<StateProps> => {
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

The mapper reads `users.byId[userId]` and the name fields (`selectUser` + `getUserFirstOrLastName`): a status update of
that user does not re-run it; a rename does, and the text binding updates.

**List-heavy** — `components/left/main/ChatList.tsx` + `Chat.tsx`. `ChatList` gets its order from
`useFolderManagerForOrderedIds(folderId)` (an `addCallback` consumer, see §1.2 and the plan) and renders
`orderedIds.map(id => <Chat chatId={id} …/>)` with `teactFastList`. In telegram-dd: `<ManualFor each={orderedIds()}
orderKey={…}>{(id) => <Chat chatId={id} …/>}</ManualFor>` (framework guide §1); `orderedIds` is the accessor the ported
hook returns. `Chat.tsx` keeps its 40-line mapper verbatim inside `withGlobal(ownProps, …)`. Per row: one mapper memo
subscribed to `chats.byId[id]` (+ ~15 leaves of it), `currentMessageList`, `byTabId[tab].forumPanelChatId`, the
draft, the typing status; the body reads `props.chat.title`, `props.lastMessage.content…` through proxies. A new
message in chat X: the walk writes `chats.byId[X].lastMessage` (replace: another `id`), `unreadCount`, the list
array; X's mapper re-runs (it read `chat.isForum`? no — it read `chat` as an object: the `lastMessage` key is read by
the body) — measured above: 2 memo re-runs out of 2 502 for exactly this scenario. tt: 2 000 `mapStateToProps` calls
plus a shallow compare each, then the row render.

`useMemo(() => …, [chatsById])`-style identity memos inside list components become `createMemo` (R2 in the framework
guide); the plan has the grep.

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

`selectTabState(global)` with the default `tabId = getCurrentTabId()` works unchanged over the proxy. The test shows a
write to another field of the same tab (`isLeftColumnShown`) does not touch the rows, and that a reducer replacing
`messageLists` with `[first, second]` keeps the first row (same store object → same `For` row by reference), pushing
exactly one more history record. Deviation noted in the file: rows are keyed by the entry object, not by tt's
`${chatId}_${threadId}_${type}_${i}` string.

## 6. Multitab

The protocol, the role election (`util/establishMultitabRole.ts`, verbatim) and `util/browser/multitab.ts` are tt's;
`multitab.ts` changed 12 lines:

- `addCallback((global, diff) => …)`: instead of `deepDiff(lastBroadcastGlobal, currentGlobal)` the callback posts the
  **journal diff** it receives (`globalDiffUpdate`), one message per callback run, in order. Composing diffs across runs
  is not done: tt's diff format applies a value object by merging it into the receiver's object, so "replaced" can only
  be expressed against the state the receiver has at that moment (the journal does exactly that for one run: a
  whole-value write remembers the object it detached and emits `deepDiff(detached, current)`; a deletion followed by a
  write under the same key composes correctly within the run). Tested round-trip: `deepMerge(peerGlobal, diff)` equals
  the master's state after batches with adds, edits, deletions and entity replacements (`src/global/store/apply.test.ts`,
  `src/util/browser/multitab.test.ts`).
- The receiving side is unchanged (`deepMerge(getGlobal(), diff)` → `setGlobal(global, { fromRemote: true })`). The
  `fromRemote` option journals those writes apart (`remoteDiff` in callbacks) so the tab does not echo them back; tt
  prevented the echo with `currentGlobal === global`, which an in-place store cannot offer.
- `globalUpdate` (the full global for a new tab) posts `getGlobal()` — raw objects, so `structuredClone` works; the
  callbacks always receive the raw tree, never the DEV copy.
- The idle batching (`onFullyIdle` + 500 ms fallback) is kept for the posting; the callbacks themselves already wait
  for heavy animations.

Cost: the diff is 4 µs per batch (tt: 0.5 ms `deepDiff` of the whole global per flush). A master with no other tabs
pays only the journal (allocations proportional to the writes).

## 7. Cache and persistence

`src/global/cache.ts` ports unchanged except its two imports (`addCallback` from `../global`, `onFullyIdle` from
`frameact`): `setupCaching` → `addCallback(updateCacheThrottled)` (5 s throttle, `onFullyIdle`, skipped while a heavy
animation runs — `runCallbacks` already waits, and `updateCache` checks `getIsHeavyAnimating()` again as in tt);
`updateCache` → `reduceGlobal(getGlobal())` picks and trims the cached slices from the raw tree (plain objects: `pick`,
spreads and `MAIN_IDB_STORE.set` work as they are; nothing to `unwrap`); `loadCache`/`migrateCache` build a new global
object and `util/init.ts` does `setGlobal(global)` → the walk writes the cached tree into the store once at start (49 ms
for 60k objects, §4). `removeGlobalFromCache`, the passcode vault path (`serializeGlobal(global)` = `JSON.stringify` of
the raw reduce) and `clearGlobalForLockScreen` are unchanged. The round trip is tested with `fake-indexeddb` in
`src/global/index.test.ts`. The localStorage fallback and `beforeunload` flush are tt's code.

## 8. The update pipeline from the API worker

Unchanged end to end: `api/gramjs/worker/connector.ts` receives `postMessage` from the worker and calls the
`onUpdate` callback, which is `getActions().apiUpdate` (`util/init.ts` / `actions/api/initial.ts`). `apiUpdate` is one
queued action with ~12 registered handlers (`actions/apiUpdaters/*.ts`), run in registration order; each returns a new
global or `undefined`, and `setGlobal` applies each result before the next handler runs (so later handlers see earlier
results, as in tt). Nested actions from an updater (`actions.loadFullChat(…)`) queue after the cascade. The worker's
update objects are fresh plain objects; the walk adopts them into the tree (the store owns them from then on). A burst
of updates is N walks; tt's own batching (`batchMessageStoreUpdates`, `updateManager`'s update packs) is kept and is the
first lever if a sync burst shows in traces, before any handler is touched.

The multitab slave path is the same: `callApi` goes to the master over the channel, updates arrive through the master's
`globalDiffUpdate` broadcasts.

## 9. Parking, `live()` and `ungated()` policy

frameact parks a frame effect whose only reason to run is a store write while a heavy animation runs in its scope
chain; tickEnd effects, event handlers and imperative reads never wait, controlled inputs (`use:value`) never wait, and
tt's two escape hatches map to the engine's:

| tt                                                                     | telegram-dd                                                                                                                                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actions.x(payload, { forceOnHeavyAnimation: true })` (35 sites)       | the handler runs under `ungated`: its synchronous writes release parked effects at once. An async handler's writes after `await` need `ungated(() => setGlobal(…))` explicitly (the codemod marks them) |
| `{ forceSyncOnIOs: true }` (7 sites: iOS swipe-back, View Transitions) | `ungated` + `flushSync()` + callbacks now                                                                                                                                                               |
| `forceOnHeavyAnimationOnce()`                                          | same name; it forces the next callbacks run, and the next `setGlobal` writes `ungated` once                                                                                                             |
| `runCallbacks` deferred while animating                                | same (`getIsHeavyAnimating()`, re-armed on `rootScope.isAnimating.once`)                                                                                                                                |

What must never wait, and how it is guaranteed:

- **Composer and inputs**: `use:value`/`use:checked` bindings are pinned live by the engine; the draft text lives in
  the component / tiptap, not in the store; the "message sent" clearing of the input goes through a store write that an
  event handler initiated — the handler itself sees the current state; the DOM catches up when the slide ends (as in
  tt, where `setGlobal` from the handler also waited for `runCallbacks`). If a product decision wants the composer to
  update during a right-column slide, the composer's store reads are wrapped in `live(() => …)`.
- **Typing indicators, upload/download progress, call UI, audio player time**: `live()` reads in those components
  (they animate inside subtrees that often have their own `Transition` scope) — the list is in the plan.
- **Scopes**: a `<Transition>` creates a scope per subtree, so the chat list keeps updating while the right column
  slides; the global `beginHeavyAnimation` (page transitions, media viewer open) parks everything store-driven, which is
  what tt did with `getIsHeavyAnimating()` in `runCallbacks`.

## 10. Dev tooling

- **stricterdom** is unchanged by the store: writes happen in actions and event handlers (never in a render), reads
  are phase-free. The dev server runs `enableStrict()`; the strict e2e fixture fails on any violation.
- **Run log / "why did this run"**: frameact names store leaves `store.<key>` in DEV; the "Slow store update" warning
  (> 7 ms per cascade) is the engine's and replaces tt's "Slow containers update".
- **Write journal in DEV**: `addCallback((global, diff) => console.debug(diff))` is the tt-format log of every write per
  tick; a `window.__globalDiffLog` ring buffer is a one-line addition when debugging a screen.
- **Key-count verification** (DEV): every container the walk visits is recounted; a write that bypassed `setGlobal`
  (a direct `setState` from new code, a mutation of a raw object) throws with the path.
- **Alias audit** (planned, DEV, idle): walk the raw tree once a minute with a `WeakSet` and report objects reachable
  from two paths together with their `id`s — the one hazard of in-place merge (§1.2) made visible.
- `window.getGlobal/setGlobal/getActions` in DEV as in tt.

## 11. What frameact lacks (engine follow-ups, clean-room in the frameact repo)

Nothing blocks the port; three things would make it cleaner or faster. Each is engine-level because only the engine's
write funnel / reactive core has the information:

1. **`onStoreWrite((path, value, kind) => void)` — a write journal at the engine's single write funnel**
   (`setProperty`/`writeArray`, plus the path threaded through `setState`, `merge`, `produce`, `reconcile`). Today the
   journal exists only because every write goes through the compat walk; the moment a hot path is rewritten to
   `setState(…, reconcile(chunk))` or `produce`, its writes are invisible to multitab and to the DEV verification. Only
   the engine knows the path of a `produce` draft write or a `reconcile` leaf. With it, the compat layer's journal
   becomes a consumer of the engine's, and §1.2's "identity consumers" get a change feed independent of how a write was
   made.
2. **`isTracking()` (Solid's `getListener() !== null`)** from `frameact`: lets `getGlobal()` warn in DEV when called
   inside a tracked computation (a one-time read where `useGlobal()` was meant), or even return the tracked view there.
   The compat layer cannot detect a running computation from the outside.
3. **Bulk adopt for cold start**: `setState(…path, adopt(bigSubtree))` — write a subtree that has no readers yet without
   per-leaf validation and notification (49 ms → the walk's own cost for the cached global; `reconcile` at the root is
   the same order today). Optional: measured once per start.

Also useful but not blocking: `reconcile` with `arrays: 'value'` (tt's array semantics) so that `setState(reconcile(next))`
at the root performs like the walk (then the walk could retire except for the journal); the typed `setState` accepting
a path array (`setState(path: PropertyKey[], value)`) to avoid the spread per write.

## 12. Codemod contract (for `.worktrees/codemod`)

Exact before → after shapes for the call sites the codemod touches. Everything under `src/global/**` is left alone
except the import of `ActionOptions` and `addCallback` (moved from `lib/teact/teactn` to `../global`).

1. **Imports**

   ```ts
   import { withGlobal, getActions, getGlobal } from '../../global'; // unchanged
   import { addCallback, removeCallback } from '../../lib/teact/teactn'; // → from '../../global'
   import type { ActionOptions } from '../../lib/teact/teactn'; // → from '../../global'
   import { memo } from '../../lib/teact/teact'; // delete; `memo(X)` → `X`
   ```

2. **`withGlobal` HOC → body call** (the mapper and the activation function are moved verbatim)

   ```tsx
   // before
   const Comp: FC<OwnProps & StateProps> = ({ a, b, c }) => { BODY };
   export default memo(withGlobal<OwnProps>(MAPPER, ACTIVATION?)(Comp));
   // after
   const Comp = (ownProps: OwnProps) => {
     const props = withGlobal(ownProps, MAPPER, ACTIVATION?);   // OwnProps & StateProps, getters
     BODY with a → props.a, b → props.b (the hooks → primitives rewrite applies to BODY as usual)
   };
   export default Comp;
   ```

   `withGlobal(() => ({}))` (no mapper) → `withGlobal(ownProps, () => ({}))` or just `ownProps`. `Complete<StateProps>`
   stays. A mapper that destructures own props `(global, { chatId })` stays (it runs inside the memo).

3. **`useSelector` family** — call unchanged, usage gets a call:

   ```ts
   const chat = useSelector(selectCurrentChat); // unchanged line
   chat.title; // → chat().title
   const x = useShallowSelector(sel);
   x.y; // → x().y
   const sig = useSelectorSignal(sel);
   sig(); // unchanged (it was a signal already)
   ```

4. **`getGlobal()` in components** — unchanged inside event handlers, `useEffect` bodies that became `createEffect`
   computes/applies, timers; **flag** (do not rewrite) a `getGlobal()` in JSX or in a `useMemo`/`createMemo` callback:
   it should be `useGlobal()`.

5. **`getActions()`** — unchanged, including destructuring (`const { openChat } = getActions();`) and the options
   argument (`openChat({ id }, { forceSyncOnIOs: true })`).

6. **Handlers in `src/global/actions/**`** — no rewrite. One mechanical marker: an `async` handler whose action is
   called with `{ forceOnHeavyAnimation: true }` somewhere gets a `// TODO(port): writes after await need ungated()`
   comment (list in the plan).

7. **Identity-based memos** — `useMemo(() => f(x), [chatsById])` where a dependency is a store object: rewrite to
   `createMemo(() => f(x))` (dependency list dropped); flag `areShallowEqual`/`!==` guards on store objects.

## 13. Risks

| Risk                                                                                                  | Mitigation                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-place merge into an id-less object aliased at two paths (both paths change together)               | The `id` guard covers entities; the DEV alias audit (§10) finds the rest; tt's state is normalised (ids, not nested entities) outside `lastMessage`/`threadInfo` |
| Identity-based change detection silently stops working (folderManager, `memoized`, `useMemo` deps)    | Listed in the plan with a grep; the journal gives them a better signal; `gates:diff` keeps the rewrites small and visible                                        |
| A hot path is rewritten to direct `setState`/`produce` and leaves the journal (multitab, DEV check)   | Rule: no direct `setState` outside `src/global/store` until engine follow-up 1 lands; the DEV key-count check throws on the next walk of that object             |
| Walk cost on very wide dictionaries (10k+ messages of one chat, 10k chats)                            | Linear in the width that tt's spread already copies; measured 0.24 ms at 2k/500; `reconcile(chunk)` opt-in for the specific reducer if a trace shows it          |
| DEV `getGlobal()` copy and stamp differ from tt in edge cases (`forceOutdated` is unused in tt today) | Same algorithm as teactn; tests cover throw / bypass / tick expiry                                                                                               |
| `undefined` deletes the key (tt kept it)                                                              | Reads are identical; `in`/`Object.keys` consumers over the global are rare (`'byTabId' in global` is on a missing key, correct in both)                          |
| Cold start 49 ms for the cached global                                                                | Measured once per launch; engine follow-up 3 if it shows in the start-up trace                                                                                   |
