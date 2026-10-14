# The teact → frameact codemod

`scripts/codemod/` rewrites a telegram-tt component or hook file into frameact idioms mechanically, so that the person
(or agent) porting it only finishes what has no safe mechanical mapping. It is step 2 of the per-file checklist in
[`porting-guide.md`](porting-guide.md#72-per-file-checklist); the mappings are the ones of the framework guide
(`src/vendor/frameact/docs/guides/porting-from-teact.md` §1) and of porting guide §4.

```bash
pnpm codemod src/components/ui/Button.tsx            # from the reference clone into src/ (the same path), in place if the file is already in src/
pnpm codemod 'src/components/left/main/*.tsx' --dry --report   # print the result (single file) / the per-file report, write nothing
pnpm codemod src/hooks/useFlag.ts --out .cache/try   # write somewhere else
pnpm codemod <files> --only props,state --skip jsx   # run a subset of rules (names below)
pnpm codemod:sweep                                   # every tt component and hook → .cache/codemod/out + report.json (gitignored)
pnpm codemod:typecheck [tt paths…]                   # does a sample typecheck against frameact once its imports resolve?
```

`--report` only adds the summary: without `--dry` the files are still written, and running the codemod twice over the same file doubles the rewrite (`x()()`, doubled TODOs), so preview with `--dry --report` and run it once.

A path that exists in the repository is rewritten in place; one that only exists in `reference/telegram-tt` (found like
the gates find it: `$TT_REFERENCE`, `reference/telegram-tt`, the main worktree) is read from there and written to the
same path under `src/`. Copy the stylesheet and commit the unchanged import first (checklist step 1): the codemod's
output is the "adapt" commit.

## How it works

Babel (`@babel/parser` + `@babel/traverse`, TypeScript + JSX) parses the file; every rule edits **source ranges** through
`magic-string` (overwrite / insert / remove) and never reprints the AST, so each line the rule does not touch stays
byte-identical. telegram-tt is not prettier-formatted, and a byte-identical remainder is what keeps the output a
readable diff against the reference (`pnpm gates:diff` counts changed non-import lines; the four proof components below
sit at 32–35%). Rules run in a fixed order and **each rule gets a fresh parse of the previous rule's output**, so rules
never share a mutated AST and can be run, skipped and tested one by one. Scope questions (which `isOpen` is the prop,
which one is a shadowing parameter) go through Babel's bindings, never through text search.

Where a rule has no safe mapping it inserts `// TODO(codemod): <reason>` (or `{/* … */}` inside JSX children) on the
line above and records it. A file is **fully transformed** when it has no TODO; the report (`--report`, `--json`) lists
per-rule hit counts and the TODO kinds.

## Transforms (rules, in order)

| Rule                | What it rewrites                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `types`             | `memo(X)` → `X`; `const X: FC<P> = (…)` → `const X = (…: P)`; `TeactNode` → `JSX.Element`; `ElementRef<T>` → `(el: T) => void`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `moduleLoader`      | `*.async.tsx`: `useModuleLoader(Bundles.B, 'X', noLoad)` + `X ? <X {...props}/> : undefined` → module-level `const X = lazy<Props>(() => loadBundle(Bundles.B).then((m) => ({ default: m.X })), { placeholder: () => <Loading /> })` (the props type of the wrapper, `Record<string, never>` without one; the `: <Loading />` fallback of tt becomes the placeholder) rendered in `<Show when={!noLoad}>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `props`             | `({ a, b = 1, ...rest }: P) =>` → `(props: P) =>`; every read `a` → `props.a` (scope-aware; shorthand `{ a }` → `{ a: props.a }`); defaults → `const props = mergeProps({ b: 1 }, rawProps) as P & Required<Pick<P, 'b'>>` (a default that reads another prop becomes a getter); rest → `const [, rest] = splitProps(props, [...])`; a body-level `const { a } = props` is folded the same way; an expression body gets a block when a merge line is needed. Connected components: see the store contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `withGlobal`        | Removes the `memo(withGlobal(mapper, activation?)(X))` wrapper → `export default X`; the body call is emitted by `props`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `state`             | `useState` / `useSignal` → `createSignal` (lazy initialiser → IIFE, `useState<T>()` → `createSignal<T \| undefined>(undefined)`); `useMemo` / `useDerivedState` / `useDerivedSignal` → `createMemo` (deps dropped); `useMemo(fn, [])` → the plain value; `useCallback(fn, deps)` / `useLastCallback(fn)` → `fn` (parentheses kept where a bare arrow would not parse).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `refs`              | `useRef<T>()` → `let x!: T` for element refs (`ref={x}` stays: the compiler assigns it; `x as ElementRef<T>` → `x as T`) or `let x: T` / `let x = init` for value refs; `x.current` → `x`; a ref handed to a hook → `() => x`; a ref passed as a non-`ref` JSX prop → `(el) => { x = el; }`. Other object uses and reassignments (forwarded refs) → TODO.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `derivedHooks`      | `usePrevious*` → `previous(() => x[, { skipUndefined }])`; `useCurrentOrPrev` → `currentOrPrev(() => x, { skipUndefined, forceCurrent })`; `useFrozenProps(props, flag)` → `frozenWhile(() => props, () => flag)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `kit`               | `useShowTransition({ isOpen, withShouldRender, shouldForceOpen, … })` → `createShowTransition({ isOpen: () => …, forceOpen: () => …, … })` (`src/lib/kit`); `getIsClosing` → `isClosing`; `useMediaTransition` → `createMediaTransition`; the `Deprecated` class-name variants are converted and flagged; `useInfiniteScroll(loadMore, listIds, isDisabled)` gets accessors for `listIds` / `isDisabled`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `effects`           | `useEffect(fn, deps)` → `createEffect(() => deps, fn)` (the deps are the tracked compute, the old body is the untracked apply and may return its cleanup; a body that reads layout → `createMeasureEffect`); `useLayoutEffect` → `createMutationEffect`; `[]` or only static deps → `onMount`; `useUnmountCleanup` → `onDestroy`; `*WithPrevDeps` → `(_deps, prev) => { const [prevA] = prev ?? []; … }`. Accessor dependencies and `props.x` dependencies are received as **values** by the apply half (`createEffect(() => [props.error, isOpen()] as const, ([error2, isOpen2]) => …)`): the body keeps teact's closure semantics, TypeScript narrows it, the tuple is `as const` so every element keeps its type, and the parameter is `name2` because tt's `no-shadow` is on. A `props.x` dependency matters beyond style: an apply cannot read a prop whose getter frameact's compiler wrapped in a memo (a conditional / logical expression at the call site: `error={key && lang(key)}`), it throws "no owner" in DEV. |
| `hooks`             | `useHeavyAnimation` → `watchHeavyAnimation`; hooks without a mapping → TODO (`useForceUpdate`, `useStateRef`, `useSignalEffect`, `usePrevDuringAnimation`, …); every other app hook is ported in place and takes accessors, so a reactive **value** argument becomes `() => value` (callbacks and callback props pass through; the kind comes from the file's `OwnProps` type, else a name heuristic); a hook body gets one `hook-params` TODO at its signature.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `accessorReads`     | Reads of signal / memo / flag accessors (`createSignal`, `useFlag`, `useInfiniteScroll`, `createMemo`, `previous`, `useSelector`, the transition's `shouldRender`…) → `x()`; a hook returns its accessors bare.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `derived`           | A body const computed from props / signals / `lang()` / `getGlobal()` (`const isOff = props.a \|\| open`) → `createMemo(() => …)` + reads `x()`; a destructuring of a reactive object → one accessor per field (`const duration = () => props.notification.duration ?? DEFAULT`); any other body statement that reads reactive values (an `if`, an assignment) → `runs-once` TODO; `getGlobal()` inside a memo / JSX → TODO (contract §12.4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `trackGlobal`       | A call to one of the nine `getGlobal()`-reading helpers inside a memo / effect / JSX binding / hook body → `trackGlobal(() => …)` (store contract §12.8).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `earlyReturn`       | Trailing `if (cond) return X;` chains before the final `return` (render helpers in between are allowed) → `<Show when={!cond} fallback={X}>…</Show>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `jsx`               | `className` → `class` on elements (components keep their `className` prop); a reactive `.map()` child → `<For each>` (by reference; `keyed={(x) => key}` + `x()` reads when the row had `key=`); `teactFastList` + `teactOrderKey` → `<ManualFor orderKey>`; `teactExperimentControlled` → `use:value` / `use:checked`; a static `key=` is removed, a reactive one on a single element and non-function `<Transition>` children are TODOs. `{cond && <X/>}` and ternaries are left alone: the compiler evaluates JSX expressions reactively.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `inputEvents`       | `onChange` on an intrinsic non-`select` element → `onInput`: teact fires `onChange` on the `input` event (per keystroke), frameact's `onChange` is the native `change` event (blur / Enter). A component that passes both handlers gets a `// TODO(codemod) on-change`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `attributes`        | `autoComplete` / `autoPlay` / `autoFocus` / `autoCorrect` / `playsInline` / `spellCheck` / `enterKeyHint` / `disablePictureInPicture` → the HTML attribute name on intrinsic elements (frameact's JSX types and runtime take `autocomplete`, ...).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `effectDeps`        | An effect compute that returns an array → `depsOf(() => [...])` (`src/util/effectDeps.ts`): `createEffect` compares the compute's value with `!==` and teact compared the deps element by element, so a new array on every run re-applied the effect each time one of its reads re-ran (`useInterval`'s timer reset on every tick of the signal its delay came from). Idempotent; run with `--only effectDeps,imports` over files ported earlier.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `forwardedHandlers` | `on*={props.x}` on an intrinsic element → `on*={(e) => props.x?.(e)}`: frameact binds a handler prop once, teact re-bound it on every render and call sites pass handlers that change (`onClick={isOpen ? close : open}`). A zero-argument handler type needs the `e` dropped by hand (tsc: "Expected 0 arguments"). Components keep `on*={props.x}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `imports`           | teact / teact-dom / fasterdom / stricterdom specifiers → `frameact`, `frameact/dom`, `frameact/stricterdom`; `lib/teact/teactn` → `../global`; replaced hook imports go when unreferenced; everything the rules introduced (`createSignal`, `For`, `JSX`, `createShowTransition`, `loadBundle`…) is imported; a teact name without a mapping stays on its old line with a TODO.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### Store contract (`docs/store-architecture.md` §12)

Implemented in `rules/props.ts` (the body call and the inline defaults), `rules/withGlobal.ts` (the wrapper, the
module-level mapper) and `rules/trackGlobal.ts`:

```tsx
// before
const Comp: FC<OwnProps & StateProps> = ({ a, b = 1 }) => { BODY };
export default memo(withGlobal<OwnProps>(MAPPER, ACTIVATION?)(Comp));
// after
const Comp = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps, ACTIVATION?); // no type argument: both types are inferred
  BODY with a → props.a, b → (props.b === undefined ? 1 : props.b)   // a destructuring default applies to undefined only
};
const mapStateToProps = (global: GlobalState, { userId }: OwnProps): Complete<StateProps> => { …tt body, unchanged… };
export default Comp;
```

- **Mapper placement**: `MAPPER_PLACEMENT = 'module'` (`rules/withGlobal.ts`, the controller's decision): the mapper
  stays where tt had it, with `global: GlobalState` (and the own-props parameter) annotated, and only the call sits in the
  body; a module with several connected components suffixes the name (`mapStateToPropsChat`). `'inline'` moves the
  text into the call instead.
- A StateProps-only component takes no parameter and calls `withGlobal({}, mapStateToProps)`; if the body already binds
  `props` the statement is named `p`. `withGlobal`, `getActions()`, `getGlobal()` keep their imports from `../global`.
- **§12.3** `useSelector` / `useShallowSelector` keep their calls; their results are read as accessors (`x().y`);
  `useSelectorSignal` is untouched.
- **§12.4** `getGlobal()` in JSX or a memo callback is flagged (`getGlobal-tracked`: it should be `useGlobal()`), never
  rewritten; in handlers, effects and timers it stays.
- **§12.7** `useMemo(…, [x])` → `createMemo` (deps dropped); a dependency of `useMemo` / `useEffect` whose declared prop
  type is a **container** (an inline object type, `Record<…>`, a name ending in `State` / `Settings` / `Config` /
  `Options` / `Info` / `Record` / `Map` / `Tab` / `Dict` / `Params` / `Props`, an indexed access type) is flagged
  (`identity-dep`); `Api*` names count as entities with an `id`. Heuristic: there is no type checker.
- **§12.8** A call to one of the nine `getGlobal()`-reading helpers (`getCanPostInChat`, `getPeerColorCount`,
  `getGroupStatus`, `getMessageTranscription`, `renderMessageSummary`, `renderMessageSummaryHtml`, `sortChatIds`,
  `filterPeersByQuery`, `getCurrentMaxAccountCount`) inside a `createMemo` / effect / derived memo / JSX binding / hook
  body is wrapped as `trackGlobal(() => …)`; inside a `withGlobal` / `useSelector` mapper or an event handler it is
  left alone.
- **§12.1** `lib/teact/teactn` imports (`addCallback`, `removeCallback`, `ActionOptions`) move to `../global`.

## Measured on telegram-tt (`pnpm codemod:sweep`, tt @ 090e38f)

1099 files (964 components, 135 hooks; `components/test` and `hooks/tauri` excluded), 0 parse or rule errors.

- **Fully transformed (no TODO): 627 files, 57.1%** — components 616/964 (63.9%), hooks 11/135 (every hook with
  parameters gets the `hook-params` TODO by design; 73 hooks have no other TODO). The final store contract added two
  flags that are manual by definition (`identity-dep` 130 sites, `getGlobal-tracked` 57): before them the figure was
  61.4%.
- `withGlobal` 371 components, `trackGlobal` 42 wrapped calls.
- Largest hit counts: `propsReads` 19 475, `derivedRead` 10 091, `accessorRead` 5 197, `class` 3 715,
  `derivedMemo` 2 462, `useLastCallback` 2 253, `derivedDestructure` 1 387, `hookArgAccessor` 939, `propsParam` 839,
  `useMemo` 771, `createEffect` 736, `useState` 665, `elementRef` 445, `effectValueDeps` 407, `memo` 393,
  `withGlobal` 371, `valueRef` 304, `earlyReturnShow` 189, `lazyModule` 154, `onMount` 111, `forKeyed` 105,
  `createMutationEffect` 74, `createMeasureEffect` 39, `useShowTransition` 35, `manualFor` 2.

Remaining TODO kinds (occurrences / files), the manual work in order of size:

| kind                                                                   |     n     | files | what the human does                                                                                                 |
| ---------------------------------------------------------------------- | :-------: | :---: | ------------------------------------------------------------------------------------------------------------------- |
| `runs-once`                                                            |    166    |  132  | a body `if` / assignment that read reactive values on every teact render: move it into an effect, a memo or the JSX |
| `hook-params`                                                          |    137    |  125  | port the hook in place: accessors in, accessors out (porting guide §4.2)                                            |
| `transition-children`                                                  |    95     |  75   | `<Transition>` with JSX children: use the render function and render by `slide.key` (framework guide §6)            |
| `key-remount`                                                          |    72     |  50   | `key={x}` on a single element: `<Show when={x} keyed>{() => …}</Show>`                                              |
| `getGlobal-tracked`                                                    |    57     |  45   | `getGlobal()` in a memo / JSX → `useGlobal()` (store contract §12.4)                                                |
| `sync-effect`                                                          |    50     |  36   | `useSyncEffect`: `createMemo` for derived state or `createMeasureEffect` for a pre-update snapshot                  |
| `transition-classes`                                                   |    48     |  35   | `useShowTransitionDeprecated` / `useMediaTransitionDeprecated` class strings: apply `ref={t.ref}` instead           |
| `hook:useForceUpdate`                                                  |    42     |  39   | make the changing value a signal                                                                                    |
| `ref-value`                                                            |    40     |  28   | a ref object passed as a value: an accessor or a callback ref                                                       |
| `hook:useStateRef`                                                     |    21     |  16   | read the accessor                                                                                                   |
| `hook:usePrevDuringAnimation`                                          |    21     |   5   | `frozenWhile` / `currentOrPrev`                                                                                     |
| `transition-ref`, `transition-ref-current`                             |    23     |  19   | a `ref` option / `.current` on the transition result: keep the element in a `let`                                   |
| `fast-list`                                                            |    14     |   9   | `teactFastList` without a single `.map()` child                                                                     |
| `ref-reassign`                                                         |    12     |  12   | a forwarded ref (`if (ref) elementRef = ref`): a callback ref                                                       |
| `reactive-pattern`, `no-deps`, `jsx-tag-accessor`, `teact-leftover`, … | ≤ 11 each |       | see the message at the site                                                                                         |

### Sample typecheck (`pnpm codemod:typecheck`)

The transformed sample is checked with `tsc` over three merged roots (`rootDirs`: the sample, our `src/`, the
reference), so an import resolves to the ported module when there is one and to tt's teact-typed module otherwise.
Diagnostics are counted only inside the sample files.

| component                             | kind           | result once imports resolve                                                                                                                                |
| ------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/Spinner`, `ui/Loading`, `ui/Link` | small          | **typechecks**, no TODO (ported for real, below)                                                                                                           |
| `ui/RippleEffect`                     | animated       | **typechecks**, no TODO (ported for real)                                                                                                                  |
| `common/CalendarModal.async`          | async          | no TODO; 1 error: `lazy()` expects a frameact `Component`, tt's `FC` type from the not-yet-ported bundle module (goes away with that port)                 |
| `common/Notifications`                | connected+list | no TODO; errors only from the store glue (`withGlobal` not exported by our `src/global` stub yet)                                                          |
| `middle/PremiumRequiredPlaceholder`   | connected      | no TODO; store glue + a `global/helpers` stub                                                                                                              |
| `common/CustomEmojiSetsModal`         | modal+list     | 1 TODO (`getGlobal` in a memo); store glue; `useIntersectionObserver` still takes a ref object (hook not ported)                                           |
| `ui/Button`                           | small, refs    | 2 TODOs (forwarded ref); errors from tt's `React.HTMLAttributes` augmentation (`onFileHoverOpen`) that frameact's JSX types do not have                    |
| `ui/Modal`                            | modal          | 4 TODOs (ref objects passed to `useContextMenuHandlers`, `.current` on the transition ref); errors from hooks that still take values (`useHistoryBack`, …) |
| `ui/Notification`                     | animated       | 2 TODOs (deprecated transition classes, `key=` remount); store glue; `renderText` stub; accessor narrowing (`title()` in two branches)                     |
| `hooks/useFlag`                       | hook           | 1 TODO (signature): the return type must say `Accessor<boolean>`                                                                                           |

What blocks the rest, in order: (1) app hooks ported in place with accessor signatures (every hook the sample touches:
`useHistoryBack`, `useContextMenuHandlers`, `useIntersectionObserver`, `useOldLang`…); (2) type-only foundation stubs
and not-yet-ported selectors/helpers (`renderText`, `selectUser`, `getUserFirstOrLastName`); (3) the remaining TODOs
of the file itself (forwarded refs, deprecated transition classes); (4) tt's `React.HTMLAttributes` augmentation (`teactFastList`,
`onFileHoverOpen`, `teactOrderKey`) — the first two go away with the rewrite, `onFileHoverOpen` needs either a
`frameact/jsx-runtime` module augmentation or a `on:fileHoverOpen` native listener (open question).

### Proof: four components ported with the codemod alone

`src/components/ui/{Spinner,Loading,Link,RippleEffect}.tsx` are the codemod's output with no manual edit (plus
`pnpm format`), their stylesheets and `src/util/buildClassName.ts` copied verbatim. `src/components/ui/ui.test.tsx`
renders them under `enableStrict()` with the stricterdom handler collecting violations (vitest + jsdom, the kit's fake
rAF harness): props defaults through `mergeProps`, delegated `onClick`, `preventDefault` in `Link`, and RippleEffect's
`mousedown` → signal → `<For>` row → debounce cleanup, all with zero stricterdom violations. `pnpm check` (diff gate:
32–35% changed non-import lines) and `pnpm gates` pass.

## Known limits

- **It is not type-aware.** Prop kinds (callback vs value) come from the file's own `type OwnProps = {…}` or a name
  heuristic (`on*`, `handle*`, `render*`, `*Handler`); an imported props type falls back to the heuristic. Hook
  argument thunking (`useX(() => value)`) therefore assumes the hook's port takes accessors.
- **Semantics that need the human:** a body statement that teact re-ran on every render (`runs-once`), `useSyncEffect`,
  `useForceUpdate`, forwarded refs, `<Transition>` children, `key=` remounts, `teactFastList` without a single `.map`.
  The codemod flags them; it does not guess.
- **Accessor narrowing:** `if (!x()) return; x().y` compiles, but TypeScript no longer narrows across the call. Effects
  receive their dependencies as values for this reason; elsewhere introduce `const value = x()` by hand.
- **`React.*` event types** stay as they are: `src/@types/react-compat.d.ts` maps them to native events with a typed
  `currentTarget` (keeps the diff small; no React code involved). `onFileHoverOpen`-style JSX augmentations are not
  covered.
- **Diff size:** with `MAPPER_PLACEMENT = 'module'` (the default) a connected component's mapper lines stay where tt
  had them; `'inline'` moves them into the body and the diff gate counts them twice.
- Hooks (`src/hooks/**`) get the mechanical rewrites (signals, memos, effects, refs) but their parameters stay values:
  the `hook-params` TODO is the port in place.
- Component bodies without a block (`const X = () => <div/>`) are only touched by the props rule when it has to add a
  merge line.

## How to add a rule

1. Create `scripts/codemod/rules/<name>.ts` exporting a `Rule` (`{ name, description, run(ctx) }`). `ctx` is one parse
   of the current code (`ctx.ast`, `ctx.program` for Babel traversal, `ctx.scope`) and a `MagicString`: use
   `ctx.overwrite(node | [start, end], text)`, `ctx.insertBefore/After`, `ctx.remove`, `ctx.removeStatement(node)`
   (whole lines, no blank line left behind), `ctx.text(node)`, `ctx.textWithParens(node)`, `ctx.thunk(node)`
   (`() => expr`, parenthesised when needed), `ctx.memoWrap(node)`.
2. Report with `ctx.hit('key')` (counted per file and in the sweep) and `ctx.todo(node, 'kind', 'message')` (a comment
   above the node, JSX-aware, once per line).
3. Reuse `analysis.ts`: `findBodies(ctx)` (components and hooks), `findConnected(ctx)`, `collectPropKinds(ctx)`,
   `classifyBindings(ctx, body, propKinds)` (props / accessor / thunk / reactive / callback / lang / hook / static),
   `isReactiveExpr(ctx, node, kinds)`, `rewriteReads(ctx, binding, replacement)` (scope-aware, shorthand-safe).
4. Add it to `RULES` in `rules/index.ts` at the right place in the order (the header comment explains the coupling),
   a test in `transform.test.ts` (`run(code, ['<name>'])` runs it alone), and a row in the table above. Run
   `pnpm codemod:sweep` and compare the summary (`.cache/codemod/report.json`) before and after: a new rule must not add
   parse errors or TODOs it does not own.
