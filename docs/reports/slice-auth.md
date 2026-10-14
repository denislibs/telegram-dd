# Port report: the auth slice

Branch `port/auth` (from `port/state`), tt baseline `090e38f`. The first UI slice of telegram-dd: the app shell
(`App.tsx`), the five auth screens (phone number, code, password, registration, QR code), the UI primitives and common
components they reach, the real localization runtime, `useLang`/`useOldLang`/`useAppLayout`, the module loader and
the global styles. `pnpm dev` (no mock) opens tt's auth entry: the QR code screen on a desktop UA, the phone number
screen on a mobile UA or after "Log in by phone number"; with the mocked client (`APP_MOCKED_CLIENT`) the app boots
logged in (tt's `util/init.ts`) into the main placeholder, and the flow phone number -> code -> password ->
registration -> main is walked by `tests/e2e/auth.spec.ts`, which plays the server with `apiUpdate` actions.

## Summary

| Step        | Result                                                                                                                                                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 inventory | `pnpm slice:inventory` (`scripts/slice/inventory.ts`): 362 files not yet in `src/` (table at the end); follows imports, `import()`, `new URL(…, import.meta.url)`, SCSS `@use`/`url()`, the `Bundles.X` edge of `*.async.tsx`, type-only imports into files that are missing |
| 2 unblock   | 7 FOUNDATION STUBs replaced by real ports: `util/localization/{index,format}`, `util/moduleLoader`, `hooks/useAppLayout`, `hooks/useOldLang`, `components/common/helpers/renderText`, `components/App`                                                                       |
| 3 port      | 92 components/hooks/bundles through the codemod (13 need no hand edit, 79 got hand edits), 169 files verbatim (28 util, 8 lib: tlottie + workers + wasm, 39 SCSS + CSS, fonts and 94 assets of which 49 TGS), 2 kit adapters written by hand, 3 original files               |
| 4 wire      | `index.tsx` imports the global styles and fonts; `App` -> `UiLoader` -> `Transition` (render function by `slide.key`) -> `Auth` / `Main` placeholder; `Notifications`                                                                                                        |
| 5 gates     | see "Gate results"                                                                                                                                                                                                                                                           |

Commits (conventional, `port(auth): …`): inventory; import (3 commits, tt bytes); codemod output (one commit, unedited);
hand adaptation (foundation, App/auth/icons, hooks + avatar/sticker, ui, lint/tests); tests; docs.

## Files ported

| Kind                   | Count | Notes                                                                                                                                                                                                                                  |
| ---------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| verbatim               |   169 | 28 `src/util` (localization data/dateFormat, qrCode, emoji, fonts, workers glue, …), 8 `src/lib` (tlottie + worker + wasm, mediaWorker, offscreen-canvas, fastBlur), 12 `styles/**`, 27 component SCSS, fonts, 94 `assets/**` (49 TGS) |
| codemod only           |    13 | `bundles/{auth,main}`, `auth/helpers/*`, `animatedAssets`, `renderText`, `GramIcon`, `StarIcon`, `AppInactive`, `useUniqueId`, `useWindowSize`, `useTauriDrag`, `preventMessageInputBlur`                                              |
| codemod + hand edits   |    79 | every other component and hook; the edits are `// Deviation:` commented where behaviour differs (62 comments)                                                                                                                          |
| hand-written adapters  |     2 | `components/ui/Transition.tsx` (over `src/lib/kit`), `components/ui/Portal.ts` (over frameact `Portal`)                                                                                                                                |
| original (not in tt)   |     3 | `util/accessors.ts` (`MaybeAccessor`/`read`), `util/reactiveCallable.ts` (reactive `lang`), tests                                                                                                                                      |
| import-line / small TS |     6 | `util/localization/index.ts`, `util/replaceWithTeact.ts` (TeactNode type), `lib/tlottie/TLottie.ts`, `util/emoji/emoji.ts`, `util/svgController.ts`, `util/element/jsxToHtml.ts`                                                       |

`pnpm gates:diff`: 820 ported files, 669 identical, 24 import-only, 113 with code changes (4413 of 19 846 changed
non-import lines, 22 %); 37 files above the 40 % line are allowlisted in `scripts/gates/diff-allowlist.json` (41 entries with the state layer's), each with
a reason and a cap (component-model rewrites: `props.x` reads, accessors, effects split by phase; hooks with accessor
signatures; the two adapters). The five largest: `Transition` 87 %, `Portal` 79 %, `useCustomEmoji` 77 %, `AnimatedIcon`
74 %, `useMedia` 71 %. The stale entry `components/App.tsx` was removed.

### Deviations from tt worth knowing (all marked `// Deviation:` in the files)

- **Localization**: tt's runtime verbatim over the bundled fallback pack; `useLang()`/`useOldLang()` return ONE stable
  Proxy function over a version signal (`util/reactiveCallable.ts`), so `lang('Key')` in JSX, a memo or an effect compute
  re-runs on a language/time-format change. `useAppLayout()` returns accessors. `NEXT_ARROW_REPLACEMENT` is a getter (a JSX
  element is one DOM node).
- **Hooks** take `MaybeAccessor<T>` for reactive values, element refs as `MaybeAccessor<El | undefined>` read inside
  applies, return accessors; `useForceUpdate`-style hooks are version signals; `useThrottledCallback`/`useDebouncedCallback`
  ignore `deps`.
- **Transition** children are render functions keyed by `slide.key`; unsupported: `shouldWrap` (the kit always wraps).
  `nextKey`, swipe control, `slideOptimized` and the `reveal`/`slideFadeAndroid` slide selection were completed after this
  slice (branch `port/transition`, see `src/lib/kit/transition.ts`). `Auth` and `App` render the screen of each slide's
  own key.
- **Modal**: scalar props are snapshotted while closing; children/header are live (callers whose content disappears with
  its data must keep it with `currentOrPrev`). `Button`/`Menu`/`InputText`/`Checkbox`: handlers are bound once, so
  render-time conditions moved into the callbacks; inputs are always controlled (`use:value`/`use:checked`).
- **AuthQrCode**: tt's `disableStrict()` + 50 ms timer around qr-code-styling is `data-stricterdom-ignore` on the container.
- **TLottie**: under `APP_ENV=test` no media worker exists and tt's `TLottie` throws; an inert worker keeps the animation blank.
- **App**: `activeKey`/`page` are one memo; the body classes go through `requestMutation`; `useSignalEffect` is a subscription started in `onMount`.
- **PasswordForm**: `focus()`/`select()` through `requestMeasure` (they are layout reads for stricterdom).

## Codemod on this slice

95 files (54 components, 39 hooks, 2 bundles), run once from the import commit.

- **Without a TODO after the codemod: 39 of 95 (41 %)**: components 32 of 54 (59 %), hooks 5 of 39 (13 %: the `hook-params`
  TODO is on every hook with parameters by design), bundles 2 of 2. All 92 TODOs were resolved by hand.
- **TODOs by kind** (92): `hook-params` 36, `runs-once` 13, `hook:useForceUpdate` 5, `hook:useStateRef` 5,
  `transition-classes` 4, `sync-effect` 4, `ref-reassign` 3, `identity-dep` 3, `heavy-animation-disabled` 3,
  `transition-children` 2, `key-remount` 2, `ref-value` 2, `transition-ref-current` 2, one each of `hook:useSignalEffect`,
  `teact-leftover`, `hook:useMountAfterHeavyAnimation`, `getGlobal-tracked`, `transition-ref`, `props-assign`,
  `reactive-pattern`, `no-deps`.
- Biggest hit counts: `propsReads` 911, `derivedRead` 372, `accessorRead` 179, `class` 143, `derivedMemo` 103,
  `useLastCallback` 84, `createEffect` 57, `useState` 57, `lazyModule` 5.
- **Codemod gaps found by this slice and fixed in `scripts/codemod`** (with tests; the files of this slice were hand-fixed):
  `inputEvents` (teact fires `onChange` per keystroke: `onChange` -> `onInput` on intrinsic non-select elements),
  `attributes` (`autoComplete` -> `autocomplete`, `playsInline`, `autoPlay`, `spellCheck`, …), `lazy<Props>()` with the
  loading placeholder of the `*.async` wrapper, effect dependency tuples `as const` (a mixed array widens its destructured
  parameter), `props.x` dependencies passed to the apply as values (see "Engine gaps" 1), apply parameters renamed
  `name2` (tt's `no-shadow` is on; shadowing the accessor failed lint).
- **Still manual** (not covered by a rule): a hook call wrapped in `createMemo(() => useX(…))` by the `derived` rule
  (hooks run once: the wrapper must go), a render-prop `FC` defined inside a component (`CountryCodeInput`'s `CodeInput`
  takes `props`), `className` on a component that spreads onto an element, `ref={let}` on a component with a function ref
  type, compound prop expressions that child applies read.
- `--report` writes the files unless `--dry` is given (documented in `docs/codemod.md`): the first run on this slice was
  doubled that way (`x()()`) and redone from the import commit.

## Gate results

| Gate               | Result                                                                                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`       | green (oxlint 0 warnings, prettier, tsc, gates:diff/tests/licenses, build, gates:size)                                                                                                                                                         |
| `pnpm test`        | 28 files, 304 passed + 2 opt-in skipped (new: `hooks.test.tsx` 4, `ui/uiPorted.test.tsx` 9, `localization.test.ts` 2; `stubs.test.ts` lost its localization stub test; vitest setup got `fake-indexeddb/auto`)                                 |
| `pnpm gates`       | diff / tests (3 of 3 tt tests copied) / licenses pass, upstream reported; size re-baselined: JS +168 KiB brotli (UI, localization, qr-code-styling, TLottie, global code), CSS +36 KiB (`index.css` 33 KiB: tt's global styles + the screens)  |
| `pnpm test:e2e`    | 12 passed: `auth.spec.ts` (full flow, QR code screen and back, country picker), boot, multitab, strict-monitor self-tests; zero console / page / request / stricterdom problems                                                                |
| `pnpm test:a11y`   | 11 passed: one axe test per auth screen; baseline entries (tt's markup, ported verbatim): `label` of `#sign-in-phone-code` and `#sign-in-password` (floating `<label>` without `for`), `color-contrast` of the floating label (code, password) |
| `pnpm test:perf`   | 5 passed: QR <-> phone number toggling 30 runs after 5 warm-ups: +105 KB (limit 512 KB); typing on the phone and code screens under 4x CPU throttling: no task over 50 ms                                                                      |
| `pnpm test:visual` | 8 passed, 3 skipped (`main-*`, `chat-with-history`, not ported)                                                                                                                                                                                |

### Visual diff vs tt (1280x800, mock `default`, threshold 0.05 %)

| Screen              | Differing pixels |
| ------------------- | ---------------: |
| `auth-phone-number` |      0 (0.000 %) |
| `auth-code`         |      0 (0.000 %) |
| `auth-password`     |      0 (0.000 %) |
| `auth-registration` |      0 (0.000 %) |
| `auth-qr-code`      |      0 (0.000 %) |

The mocked client boots logged in, so both targets play the server with the same `apiUpdate` after the mocked sync has
settled. (The mock has no country list: the country field shows tt's spinner in both apps; the lottie animations are
blank in both because `APP_ENV=test` starts no media workers.)

## frameact engine gaps found (engine-only; to go to the frameact repo clean-room, not implemented here)

1. **A prop getter that the compiler wrapped in a memo throws when read in an effect apply.** `error={key && lang(key)}`,
   `size={big ? A : B}`, `play={flag ? a : b}` compile to a getter that calls `memo()`; `props.error` read in an `apply`
   (no owner) fails in DEV: "onCleanup()/createEffect()/createMemo() inside an effect apply has no owner". Hit by
   `PasswordForm`, `AnimatedSticker`, `TrackingMonkey`, `AnimatedIcon`, `Modal`, `Menu`, `App`. Either the compiler should
   not memo a prop read from a non-tracked context, or the getter should create its memo under the component's owner once.
   Worked around in the app (props as values through the compute half; a memo of the props an apply needs).
2. **stricterdom attributes the mutation of `requestForcedReflow`'s returned function to the next measure phase** (suspected):
   tt's `setScrollbarWidthProperty` (`body.appendChild` in `requestMutation`, `el.remove()` in the forced-reflow mutation)
   is reported as `Unexpected mutation childList of <body> outside an effect [measure]` when the action runs again after
   the first frame (plain `pnpm dev` with an invalid api id reconnecting every few seconds). The mocked boot does not show it.
3. `lazy<P>()` cannot infer `P` from `loadBundle(...).then((m) => ({ default: m.X }))`; the props type has to be given
   (`lazy<OwnProps>`, `lazy<Record<string, never>>`).
4. `createMutationEffect` applies synchronously at creation, before a `ref` of the same component is assigned (hooks that
   write to a ref'd element use `createEffect(c, a, frameMutation)`).
5. `watchHeavyAnimation` has no disable flag (tt's `useHeavyAnimation(cb, cb, isDisabled)`): guarded inside the callbacks.
6. Custom DOM events in JSX types (`onFileHoverOpen`): the app uses `on:filehoveropen`; typing needs a module augmentation.

## Remaining stubs (14, `pnpm gates:diff` lists them)

`bundles/{extra,calls,stars,editor,wallet}.ts` (empty; `editor` carries the `buildMessageCopyContent` signature),
`components/main/{Main,LockScreen}.tsx` (placeholders: `#Main`), `components/common/helpers/{renderTextWithEntities,renderMessageText}`
(plain text; the real ones pull CustomEmoji, message components), `components/payment/PaymentModal.tsx`,
`components/middle/composer/helpers/parseCheckList.ts`, `hooks/{useReducer,reducers/useFoldersReducer}.ts`,
`util/notifications.tsx` (not reached by the auth screens). Removed: 7 (list in the Summary).

Known gaps: `renderText`'s emoji `<img onLoad>` relies on a non-bubbling `load` event (delegated handlers do not see it;
only without native emoji support); `Notification` shows `renderTextWithEntities` as plain text; the allowlisted a11y
findings above; `pnpm dev` has no country list without an API.

<!-- inventory:start -->

## Inventory (generated by `pnpm slice:inventory`)

Roots: `src/components/auth/**`, `src/components/App.tsx`, `src/components/main/AppInactive.tsx`, `src/components/common/UiLoader.tsx`, `src/components/common/Notifications.tsx`, `src/styles/index.scss`, `src/assets/fonts/roboto.css`. Walk stops at: `src/components/main/Main.tsx`, `src/components/main/LockScreen.tsx`, `src/components/common/helpers/renderTextWithEntities.tsx`, `src/components/common/helpers/renderMessageText.ts`.
Reference: `../../reference/telegram-tt`. Closure of files not yet in `src/`; a file that is already ported is listed once and not descended into.

| status                 | files | lines |
| ---------------------- | ----: | ----: |
| stub to replace        |     7 |  1446 |
| port via codemod       |    92 |  9573 |
| port verbatim          |   169 | 10499 |
| kit adapter            |     2 |   596 |
| replaced by frameact   |    23 |  3244 |
| deferred (other slice) |     3 |  1809 |
| already ported         |    66 | 10159 |

| file                                                   | kind           | status                 | needed by                                         | note                                                        |
| ------------------------------------------------------ | -------------- | ---------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| `components/App.tsx`                                   | component      | stub to replace        | root                                              | FOUNDATION STUB in src/                                     |
| `components/common/helpers/renderText.tsx`             | component      | stub to replace        | `components/auth/CountryCodeInput.tsx`            | FOUNDATION STUB in src/                                     |
| `hooks/useAppLayout.ts`                                | hook           | stub to replace        | `components/App.tsx`                              | FOUNDATION STUB in src/                                     |
| `hooks/useOldLang.ts`                                  | hook           | stub to replace        | `components/ui/Button.tsx`                        | FOUNDATION STUB in src/                                     |
| `util/localization/format.tsx`                         | util           | stub to replace        | `components/ui/ModalStarBalanceBar.tsx`           | FOUNDATION STUB in src/                                     |
| `util/localization/index.ts`                           | util           | stub to replace        | `components/common/UiLoader.tsx`                  | FOUNDATION STUB in src/                                     |
| `util/moduleLoader.ts`                                 | util           | stub to replace        | `components/auth/AuthCode.async.tsx`              | FOUNDATION STUB in src/                                     |
| `bundles/auth.ts`                                      | bundle         | port via codemod       | `components/auth/AuthCode.async.tsx`              | no teact imports (imports only)                             |
| `bundles/main.ts`                                      | bundle         | port via codemod       | `components/main/LockScreen.async.tsx`            | no teact imports (imports only)                             |
| `components/auth/Auth.tsx`                             | component      | port via codemod       | root                                              | teact imports                                               |
| `components/auth/AuthCode.async.tsx`                   | async wrapper  | port via codemod       | root                                              | no teact imports (imports only)                             |
| `components/auth/AuthCode.tsx`                         | component      | port via codemod       | root                                              | teact imports                                               |
| `components/auth/AuthPassword.async.tsx`               | async wrapper  | port via codemod       | root                                              | no teact imports (imports only)                             |
| `components/auth/AuthPassword.tsx`                     | component      | port via codemod       | root                                              | teact imports                                               |
| `components/auth/AuthPhoneNumber.tsx`                  | component      | port via codemod       | root                                              | teact imports                                               |
| `components/auth/AuthQrCode.tsx`                       | component      | port via codemod       | root                                              | teact imports                                               |
| `components/auth/AuthRegister.async.tsx`               | async wrapper  | port via codemod       | root                                              | no teact imports (imports only)                             |
| `components/auth/AuthRegister.tsx`                     | component      | port via codemod       | root                                              | teact imports                                               |
| `components/auth/CountryCodeInput.tsx`                 | component      | port via codemod       | root                                              | teact imports                                               |
| `components/auth/helpers/backNavigation.ts`            | component      | port via codemod       | root                                              | no teact imports (imports only)                             |
| `components/auth/helpers/getSuggestedLanguage.ts`      | component      | port via codemod       | root                                              | no teact imports (imports only)                             |
| `components/common/AnimatedCounter.tsx`                | component      | port via codemod       | `components/ui/InputText.tsx`                     | teact imports                                               |
| `components/common/AnimatedIcon.tsx`                   | component      | port via codemod       | `components/auth/AuthQrCode.tsx`                  | teact imports                                               |
| `components/common/AnimatedSticker.tsx`                | component      | port via codemod       | `components/common/TrackingMonkey.tsx`            | teact imports                                               |
| `components/common/Avatar.tsx`                         | component      | port via codemod       | `components/ui/Checkbox.tsx`                      | teact imports                                               |
| `components/common/AvatarStoryCircle.tsx`              | component      | port via codemod       | `components/common/Avatar.tsx`                    | teact imports                                               |
| `components/common/CustomEmoji.tsx`                    | component      | port via codemod       | `components/ui/Notification.tsx`                  | teact imports                                               |
| `components/common/helpers/animatedAssets.ts`          | component      | port via codemod       | `components/auth/AuthQrCode.tsx`                  | no teact imports (imports only)                             |
| `components/common/hooks/useCustomEmoji.ts`            | component      | port via codemod       | `components/common/CustomEmoji.tsx`               | teact imports                                               |
| `components/common/icons/GramIcon.tsx`                 | component      | port via codemod       | `util/localization/format.tsx`                    | teact imports                                               |
| `components/common/icons/Icon.tsx`                     | component      | port via codemod       | `components/auth/AuthCode.tsx`                    | teact imports                                               |
| `components/common/icons/StarIcon.tsx`                 | component      | port via codemod       | `components/ui/Notification.tsx`                  | teact imports                                               |
| `components/common/Notifications.tsx`                  | component      | port via codemod       | root                                              | teact imports                                               |
| `components/common/PasswordForm.tsx`                   | component      | port via codemod       | `components/auth/AuthPassword.tsx`                | teact imports                                               |
| `components/common/PasswordMonkey.tsx`                 | component      | port via codemod       | `components/auth/AuthPassword.tsx`                | teact imports                                               |
| `components/common/SafeLink.tsx`                       | component      | port via codemod       | `components/common/helpers/renderText.tsx`        | teact imports                                               |
| `components/common/Sparkles.tsx`                       | component      | port via codemod       | `components/ui/Button.tsx`                        | teact imports                                               |
| `components/common/StickerView.tsx`                    | component      | port via codemod       | `components/common/CustomEmoji.tsx`               | teact imports                                               |
| `components/common/TrackingMonkey.tsx`                 | component      | port via codemod       | `components/auth/AuthCode.tsx`                    | teact imports                                               |
| `components/common/UiLoader.tsx`                       | component      | port via codemod       | root                                              | no teact imports (imports only)                             |
| `components/main/AppInactive.tsx`                      | component      | port via codemod       | root                                              | no teact imports (imports only)                             |
| `components/main/LockScreen.async.tsx`                 | async wrapper  | port via codemod       | `components/App.tsx`                              | no teact imports (imports only)                             |
| `components/main/Main.async.tsx`                       | async wrapper  | port via codemod       | `components/App.tsx`                              | no teact imports (imports only)                             |
| `components/middle/helpers/preventMessageInputBlur.ts` | component      | port via codemod       | `components/ui/Menu.tsx`                          | no teact imports (imports only)                             |
| `components/middle/message/hooks/useVideoAutoPause.ts` | component      | port via codemod       | `components/ui/OptimizedVideo.tsx`                | teact imports                                               |
| `components/middle/message/MentionLink.tsx`            | component      | port via codemod       | `components/common/helpers/renderText.tsx`        | teact imports                                               |
| `components/ui/AvatarEditable.tsx`                     | component      | port via codemod       | `components/auth/AuthRegister.tsx`                | teact imports                                               |
| `components/ui/Button.tsx`                             | component      | port via codemod       | `components/auth/AuthPhoneNumber.tsx`             | teact imports                                               |
| `components/ui/Checkbox.tsx`                           | component      | port via codemod       | `components/auth/AuthPhoneNumber.tsx`             | teact imports                                               |
| `components/ui/CheckboxGroup.tsx`                      | component      | port via codemod       | `components/ui/Checkbox.tsx`                      | teact imports                                               |
| `components/ui/CropModal.tsx`                          | component      | port via codemod       | `components/ui/AvatarEditable.tsx`                | teact imports                                               |
| `components/ui/DropdownMenu.tsx`                       | component      | port via codemod       | `components/auth/CountryCodeInput.tsx`            | teact imports                                               |
| `components/ui/ImageCropper.tsx`                       | component      | port via codemod       | `components/ui/CropModal.tsx`                     | teact imports                                               |
| `components/ui/InputText.tsx`                          | component      | port via codemod       | `components/auth/AuthCode.tsx`                    | teact imports                                               |
| `components/ui/Menu.tsx`                               | component      | port via codemod       | `components/ui/DropdownMenu.tsx`                  | teact imports                                               |
| `components/ui/MenuItem.tsx`                           | component      | port via codemod       | `components/auth/CountryCodeInput.tsx`            | teact imports                                               |
| `components/ui/Modal.tsx`                              | component      | port via codemod       | `components/ui/CropModal.tsx`                     | teact imports                                               |
| `components/ui/ModalStarBalanceBar.tsx`                | component      | port via codemod       | `components/ui/Modal.tsx`                         | teact imports                                               |
| `components/ui/Notification.tsx`                       | component      | port via codemod       | `components/common/Notifications.tsx`             | teact imports                                               |
| `components/ui/OptimizedVideo.tsx`                     | component      | port via codemod       | `components/common/Avatar.tsx`                    | teact imports                                               |
| `components/ui/RangeSlider.tsx`                        | component      | port via codemod       | `components/ui/ImageCropper.tsx`                  | teact imports                                               |
| `components/ui/RoundTimer.tsx`                         | component      | port via codemod       | `components/ui/Notification.tsx`                  | teact imports                                               |
| `hooks/animations/useViewTransition.ts`                | hook           | port via codemod       | `hooks/useVirtualBackdrop.ts`                     | teact imports                                               |
| `hooks/element/useIsTopmostBalanceBarModal.ts`         | hook           | port via codemod       | `components/ui/ModalStarBalanceBar.tsx`           | teact imports                                               |
| `hooks/element/useStyleObserver.ts`                    | hook           | port via codemod       | `hooks/stickers/useDynamicColorListener.ts`       | teact imports                                               |
| `hooks/media/useThumbnail.ts`                          | hook           | port via codemod       | `components/common/StickerView.tsx`               | teact imports                                               |
| `hooks/schedulers/useInterval.ts`                      | hook           | port via codemod       | `hooks/useMultiaccountInfo.ts`                    | teact imports                                               |
| `hooks/schedulers/useTimeout.ts`                       | hook           | port via codemod       | `components/common/PasswordForm.tsx`              | teact imports                                               |
| `hooks/stickers/useColorFilter.tsx`                    | hook           | port via codemod       | `components/common/AnimatedSticker.tsx`           | teact imports                                               |
| `hooks/stickers/useDynamicColorListener.ts`            | hook           | port via codemod       | `components/common/CustomEmoji.tsx`               | teact imports                                               |
| `hooks/tauri/useTauriDrag.ts`                          | hook           | port via codemod       | `components/App.tsx`                              | teact imports                                               |
| `hooks/useAsync.ts`                                    | hook           | port via codemod       | `components/auth/AuthQrCode.tsx`                  | teact imports                                               |
| `hooks/useBuffering.ts`                                | hook           | port via codemod       | `components/ui/OptimizedVideo.tsx`                | teact imports                                               |
| `hooks/useContextMenuHandlers.ts`                      | hook           | port via codemod       | `components/ui/Modal.tsx`                         | teact imports                                               |
| `hooks/useCoordsInSharedCanvas.ts`                     | hook           | port via codemod       | `components/common/StickerView.tsx`               | teact imports                                               |
| `hooks/useDebouncedCallback.ts`                        | hook           | port via codemod       | `hooks/window/useWindowSize.ts`                   | teact imports                                               |
| `hooks/useEffectOnce.ts`                               | hook           | port via codemod       | `components/common/UiLoader.tsx`                  | teact imports                                               |
| `hooks/useFastClick.ts`                                | hook           | port via codemod       | `components/common/Avatar.tsx`                    | no teact imports (imports only)                             |
| `hooks/useFileHoverOpen.ts`                            | hook           | port via codemod       | `components/App.tsx`                              | teact imports                                               |
| `hooks/useFlag.ts`                                     | hook           | port via codemod       | `components/auth/AuthPhoneNumber.tsx`             | teact imports                                               |
| `hooks/useImageLoader.ts`                              | hook           | port via codemod       | `components/ui/CropModal.tsx`                     | teact imports                                               |
| `hooks/useIntersectionObserver.ts`                     | hook           | port via codemod       | `components/common/Avatar.tsx`                    | teact imports                                               |
| `hooks/useKeyboardListNavigation.ts`                   | hook           | port via codemod       | `components/ui/Menu.tsx`                          | teact imports                                               |
| `hooks/useLang.ts`                                     | hook           | port via codemod       | `components/auth/AuthCode.tsx`                    | no teact imports (imports only)                             |
| `hooks/useLangString.ts`                               | hook           | port via codemod       | `components/auth/AuthPhoneNumber.tsx`             | teact imports                                               |
| `hooks/useMedia.ts`                                    | hook           | port via codemod       | `hooks/useMultiaccountInfo.ts`                    | teact imports                                               |
| `hooks/useMenuPosition.ts`                             | hook           | port via codemod       | `components/ui/Menu.tsx`                          | teact imports                                               |
| `hooks/useMultiaccountInfo.ts`                         | hook           | port via codemod       | `components/auth/AuthPhoneNumber.tsx`             | teact imports                                               |
| `hooks/usePeerColor.ts`                                | hook           | port via codemod       | `components/common/Avatar.tsx`                    | teact imports                                               |
| `hooks/usePriorityPlaybackCheck.ts`                    | hook           | port via codemod       | `components/common/AnimatedSticker.tsx`           | teact imports                                               |
| `hooks/useResizeObserver.ts`                           | hook           | port via codemod       | `hooks/element/useStyleObserver.ts`               | teact imports                                               |
| `hooks/useSharedIntersectionObserver.ts`               | hook           | port via codemod       | `components/common/AnimatedSticker.tsx`           | teact imports                                               |
| `hooks/useThrottledCallback.ts`                        | hook           | port via codemod       | `hooks/useMultiaccountInfo.ts`                    | teact imports                                               |
| `hooks/useUniqueId.ts`                                 | hook           | port via codemod       | `components/common/AnimatedSticker.tsx`           | teact imports                                               |
| `hooks/useVideoCleanup.ts`                             | hook           | port via codemod       | `components/ui/OptimizedVideo.tsx`                | teact imports                                               |
| `hooks/useVirtualBackdrop.ts`                          | hook           | port via codemod       | `components/ui/Menu.tsx`                          | teact imports                                               |
| `hooks/window/useBackgroundMode.ts`                    | hook           | port via codemod       | `components/App.tsx`                              | teact imports                                               |
| `hooks/window/useDevicePixelRatio.ts`                  | hook           | port via codemod       | `components/common/AvatarStoryCircle.tsx`         | teact imports                                               |
| `hooks/window/useWindowSize.ts`                        | hook           | port via codemod       | `components/ui/ImageCropper.tsx`                  | teact imports                                               |
| `assets/app-inactive.png`                              | asset          | port verbatim          | `components/main/AppInactive.tsx`                 |                                                             |
| `assets/blank.png`                                     | asset          | port verbatim          | `util/qrCode/buildStyledQrCode.ts`                |                                                             |
| `assets/broken-gift.svg`                               | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/fonts/KFOlCnqEu92Fr1MmEU9fABc4AMP6lbBP.woff2`  | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/KFOlCnqEu92Fr1MmEU9fBBc4AMP6lQ.woff2`    | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/KFOlCnqEu92Fr1MmEU9fBxc4AMP6lbBP.woff2`  | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/KFOlCnqEu92Fr1MmEU9fCBc4AMP6lbBP.woff2`  | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/KFOlCnqEu92Fr1MmEU9fChc4AMP6lbBP.woff2`  | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/KFOlCnqEu92Fr1MmEU9fCRc4AMP6lbBP.woff2`  | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/KFOlCnqEu92Fr1MmEU9fCxc4AMP6lbBP.woff2`  | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/KFOmCnqEu92Fr1Mu4mxKKTU1Kg.woff2`        | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/KFOmCnqEu92Fr1Mu4WxKKTU1Kvnz.woff2`      | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/KFOmCnqEu92Fr1Mu5mxKKTU1Kvnz.woff2`      | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/KFOmCnqEu92Fr1Mu72xKKTU1Kvnz.woff2`      | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/KFOmCnqEu92Fr1Mu7GxKKTU1Kvnz.woff2`      | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/KFOmCnqEu92Fr1Mu7mxKKTU1Kvnz.woff2`      | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/KFOmCnqEu92Fr1Mu7WxKKTU1Kvnz.woff2`      | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/Numbers-Rounded.woff2`                   | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/Nunito-ExtraBold.woff2`                  | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/Roboto-Condensed-Regular.woff2`          | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/roboto.css`                              | style          | port verbatim          | root                                              |                                                             |
| `assets/fonts/Vazirmatn-NL-Medium.woff2`               | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/fonts/Vazirmatn-NL-Regular.woff2`              | asset          | port verbatim          | `assets/fonts/roboto.css`                         |                                                             |
| `assets/icons/forumTopic/blue.svg`                     | asset          | port verbatim          | `components/common/Avatar.scss`                   |                                                             |
| `assets/icons/gram/gram.png`                           | asset          | port verbatim          | `components/common/icons/GramIcon.tsx`            |                                                             |
| `assets/icons/gram/gram.svg`                           | asset          | port verbatim          | `components/common/icons/GramIcon.tsx`            |                                                             |
| `assets/icons/star/star.webp`                          | asset          | port verbatim          | `components/common/UiLoader.tsx`                  |                                                             |
| `assets/localization/fallback.strings`                 | asset          | port verbatim          | `util/data/readFallbackStrings.ts`                |                                                             |
| `assets/localization/initialStrings.ts`                | asset          | port verbatim          | `util/localization/index.ts`                      |                                                             |
| `assets/lock.png`                                      | asset          | port verbatim          | `components/common/UiLoader.tsx`                  |                                                             |
| `assets/monkey.svg`                                    | asset          | port verbatim          | `components/auth/AuthPhoneNumber.tsx`             |                                                             |
| `assets/premium/PremiumStarFill.svg`                   | asset          | port verbatim          | `components/common/icons/Icon.module.scss`        |                                                             |
| `assets/spoilers/mask.svg`                             | asset          | port verbatim          | `components/common/UiLoader.tsx`                  |                                                             |
| `assets/telegram-logo.svg`                             | asset          | port verbatim          | `components/auth/Auth.scss`                       |                                                             |
| `assets/tgs-previews/DuckNothingFound.svg`             | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs-previews/message/Writing.svg`              | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs-previews/Pause.svg`                        | asset          | port verbatim          | `components/common/UiLoader.tsx`                  |                                                             |
| `assets/tgs-previews/Play.svg`                         | asset          | port verbatim          | `components/common/UiLoader.tsx`                  |                                                             |
| `assets/tgs-previews/Search.svg`                       | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs-previews/settings/HandStopPreview.png`     | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs-previews/settings/Passkeys.svg`            | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs-previews/wallet/BlueDiamond.svg`           | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs-previews/wallet/BlueDiamond3d.webp`        | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs-previews/wallet/Gram.svg`                  | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs-previews/wallet/Gram3d.webp`               | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/auth/QrPlane.tgs`                          | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/BannedDuck.tgs`                            | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/BrokenGift.tgs`                            | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/calls/CameraFlip.tgs`                      | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/calls/HandFilled.tgs`                      | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/calls/HandOutline.tgs`                     | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/calls/Speaker.tgs`                         | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/calls/VoiceAllowTalk.tgs`                  | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/calls/VoiceMini.tgs`                       | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/calls/VoiceMuted.tgs`                      | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/calls/VoiceOutlined.tgs`                   | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/CraftProgress.tgs`                         | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/Diamond.tgs`                               | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/DuckNothingFound.tgs`                      | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/general/Flame.tgs`                         | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/general/Fragment.tgs`                      | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/general/Mention.tgs`                       | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/general/PartyPopper.tgs`                   | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/general/PlayPause.tgs`                     | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/invites/Invite.tgs`                        | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/invites/Requests.tgs`                      | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/LastSeen.tgs`                              | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/message/Eyes.tgs`                          | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/message/Typing.tgs`                        | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/message/Writing.tgs`                       | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/monkeys/TwoFactorSetupMonkeyClose.tgs`     | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/monkeys/TwoFactorSetupMonkeyIdle.tgs`      | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/monkeys/TwoFactorSetupMonkeyPeek.tgs`      | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/monkeys/TwoFactorSetupMonkeyTracking.tgs`  | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/ReadTime.tgs`                              | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/Report.tgs`                                | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/Search.tgs`                                | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/SearchingDuck.tgs`                         | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/settings/Congratulations.tgs`              | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/settings/DiscussionGroupsDucks.tgs`        | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/settings/DuckCake.tgs`                     | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/settings/Experimental.tgs`                 | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/settings/FoldersAll.tgs`                   | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/settings/FoldersNew.tgs`                   | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/settings/FoldersShare.tgs`                 | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/settings/HandStop.tgs`                     | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/settings/Lock.tgs`                         | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/settings/Passkeys.tgs`                     | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/settings/UtyanDisappear.tgs`               | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/stars/StarReaction.tgs`                    | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/stars/StarReactionEffect.tgs`              | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/Unlock.tgs`                                | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/wallet/BlueDiamond.tgs`                    | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `assets/tgs/wallet/Gram.tgs`                           | asset          | port verbatim          | `components/common/helpers/animatedAssets.ts`     |                                                             |
| `components/App.module.scss`                           | style (module) | port verbatim          | `components/App.tsx`                              |                                                             |
| `components/auth/Auth.scss`                            | style          | port verbatim          | root                                              |                                                             |
| `components/auth/CountryCodeInput.scss`                | style          | port verbatim          | root                                              |                                                             |
| `components/common/AnimatedCounter.module.scss`        | style (module) | port verbatim          | `components/common/AnimatedCounter.tsx`           |                                                             |
| `components/common/Avatar.scss`                        | style          | port verbatim          | `components/common/Avatar.tsx`                    |                                                             |
| `components/common/CustomEmoji.module.scss`            | style (module) | port verbatim          | `components/common/CustomEmoji.tsx`               |                                                             |
| `components/common/icons/GramIcon.module.scss`         | style (module) | port verbatim          | `components/common/icons/GramIcon.tsx`            |                                                             |
| `components/common/icons/Icon.module.scss`             | style (module) | port verbatim          | `components/common/icons/Icon.tsx`                |                                                             |
| `components/common/icons/StarIcon.module.scss`         | style (module) | port verbatim          | `components/common/icons/StarIcon.tsx`            |                                                             |
| `components/common/PasswordMonkey.scss`                | style          | port verbatim          | `components/common/TrackingMonkey.tsx`            |                                                             |
| `components/common/Sparkles.module.scss`               | style (module) | port verbatim          | `components/common/Sparkles.tsx`                  |                                                             |
| `components/common/StickerView.module.scss`            | style (module) | port verbatim          | `components/common/StickerView.tsx`               |                                                             |
| `components/common/UiLoader.module.scss`               | style (module) | port verbatim          | `components/common/UiLoader.tsx`                  |                                                             |
| `components/main/AppInactive.scss`                     | style          | port verbatim          | `components/main/AppInactive.tsx`                 |                                                             |
| `components/ui/AvatarEditable.scss`                    | style          | port verbatim          | `components/ui/AvatarEditable.tsx`                |                                                             |
| `components/ui/Button.scss`                            | style          | port verbatim          | `components/ui/Button.tsx`                        |                                                             |
| `components/ui/Checkbox.scss`                          | style          | port verbatim          | `components/ui/Checkbox.tsx`                      |                                                             |
| `components/ui/CropModal.scss`                         | style          | port verbatim          | `components/ui/CropModal.tsx`                     |                                                             |
| `components/ui/DropdownMenu.scss`                      | style          | port verbatim          | `components/ui/DropdownMenu.tsx`                  |                                                             |
| `components/ui/ImageCropper.module.scss`               | style (module) | port verbatim          | `components/ui/ImageCropper.tsx`                  |                                                             |
| `components/ui/Menu.scss`                              | style          | port verbatim          | `components/ui/Menu.tsx`                          |                                                             |
| `components/ui/MenuItem.scss`                          | style          | port verbatim          | `components/ui/MenuItem.tsx`                      |                                                             |
| `components/ui/Modal.scss`                             | style          | port verbatim          | `components/ui/Modal.tsx`                         |                                                             |
| `components/ui/ModalStarBalanceBar.module.scss`        | style (module) | port verbatim          | `components/ui/ModalStarBalanceBar.tsx`           |                                                             |
| `components/ui/Notification.scss`                      | style          | port verbatim          | `components/ui/Notification.tsx`                  |                                                             |
| `components/ui/RangeSlider.scss`                       | style          | port verbatim          | `components/ui/RangeSlider.tsx`                   |                                                             |
| `components/ui/RoundTimer.module.scss`                 | style (module) | port verbatim          | `components/ui/RoundTimer.tsx`                    |                                                             |
| `lib/fastBlur.js`                                      | lib            | port verbatim          | `lib/offscreen-canvas/offscreen-canvas.worker.ts` |                                                             |
| `lib/mediaWorker/index.worker.ts`                      | lib            | port verbatim          | `util/launchMediaWorkers.ts`                      |                                                             |
| `lib/offscreen-canvas/offscreen-canvas.worker.ts`      | lib            | port verbatim          | `lib/mediaWorker/index.worker.ts`                 |                                                             |
| `lib/tlottie/tlottie-no-simd.wasm`                     | lib            | port verbatim          | `lib/tlottie/tlottie.worker.ts`                   |                                                             |
| `lib/tlottie/TLottie.async.ts`                         | lib            | port verbatim          | `components/common/AnimatedSticker.tsx`           |                                                             |
| `lib/tlottie/TLottie.ts`                               | lib            | port verbatim          | `components/common/AnimatedSticker.tsx`           | imports only (teact/fasterdom swap)                         |
| `lib/tlottie/tlottie.wasm`                             | lib            | port verbatim          | `lib/tlottie/tlottie.worker.ts`                   |                                                             |
| `lib/tlottie/tlottie.worker.ts`                        | lib            | port verbatim          | `lib/mediaWorker/index.worker.ts`                 |                                                             |
| `styles/_common.scss`                                  | style          | port verbatim          | `styles/index.scss`                               |                                                             |
| `styles/_composer-primitives.scss`                     | style          | port verbatim          | `styles/index.scss`                               |                                                             |
| `styles/_forms.scss`                                   | style          | port verbatim          | `styles/index.scss`                               |                                                             |
| `styles/_mixins.scss`                                  | style          | port verbatim          | `styles/_common.scss`                             |                                                             |
| `styles/_spacing.scss`                                 | style          | port verbatim          | `styles/index.scss`                               |                                                             |
| `styles/_variables.scss`                               | style          | port verbatim          | `styles/index.scss`                               |                                                             |
| `styles/icons.css`                                     | style          | port verbatim          | `styles/index.scss`                               |                                                             |
| `styles/icons.scss`                                    | style          | port verbatim          | `styles/index.scss`                               |                                                             |
| `styles/icons.woff2`                                   | asset          | port verbatim          | `styles/icons.css`                                |                                                             |
| `styles/index.scss`                                    | style          | port verbatim          | root                                              |                                                             |
| `styles/print.scss`                                    | style          | port verbatim          | `styles/index.scss`                               |                                                             |
| `styles/reboot.css`                                    | style          | port verbatim          | `styles/index.scss`                               |                                                             |
| `util/animations/viewTransitionTypes.ts`               | util           | port verbatim          | `hooks/animations/useViewTransition.ts`           |                                                             |
| `util/browser/intlListFormat.ts`                       | util           | port verbatim          | `util/localization/index.ts`                      |                                                             |
| `util/browser/unloadVideo.ts`                          | util           | port verbatim          | `hooks/useVideoCleanup.ts`                        |                                                             |
| `util/buildStyle.ts`                                   | util           | port verbatim          | `components/ui/Button.tsx`                        |                                                             |
| `util/captureEscKeyListener.ts`                        | util           | port verbatim          | `components/ui/Notification.tsx`                  |                                                             |
| `util/captureKeyboardListeners.ts`                     | util           | port verbatim          | `util/captureEscKeyListener.ts`                   |                                                             |
| `util/createPostMessageInterface.ts`                   | util           | port verbatim          | `lib/tlottie/tlottie.worker.ts`                   |                                                             |
| `util/cycleRestrict.ts`                                | util           | port verbatim          | `util/imageResize.ts`                             |                                                             |
| `util/data/readFallbackStrings.ts`                     | util           | port verbatim          | `util/localization/index.ts`                      |                                                             |
| `util/data/readStrings.ts`                             | util           | port verbatim          | `util/data/readFallbackStrings.ts`                |                                                             |
| `util/directInputManager.ts`                           | util           | port verbatim          | `components/ui/Modal.tsx`                         |                                                             |
| `util/element/jsxToHtml.ts`                            | util           | port verbatim          | `util/svgController.ts`                           | imports only (teact/fasterdom swap)                         |
| `util/emoji/emoji.ts`                                  | util           | port verbatim          | `components/auth/CountryCodeInput.tsx`            | imports only (teact/fasterdom swap)                         |
| `util/emoji/ensureCustomEmoji.ts`                      | util           | port verbatim          | `components/common/hooks/useCustomEmoji.ts`       |                                                             |
| `util/events/getPointerPosition.ts`                    | util           | port verbatim          | `components/ui/ImageCropper.tsx`                  |                                                             |
| `util/fonts.ts`                                        | util           | port verbatim          | `components/auth/AuthPhoneNumber.tsx`             |                                                             |
| `util/imageResize.ts`                                  | util           | port verbatim          | `hooks/useMultiaccountInfo.ts`                    |                                                             |
| `util/installPrompt.ts`                                | util           | port verbatim          | `components/App.tsx`                              |                                                             |
| `util/launchMediaWorkers.ts`                           | util           | port verbatim          | `util/imageResize.ts`                             |                                                             |
| `util/localization/dateFormat.ts`                      | util           | port verbatim          | `util/localization/index.ts`                      |                                                             |
| `util/openModals.ts`                                   | util           | port verbatim          | `components/ui/Modal.tsx`                         |                                                             |
| `util/PostMessageConnector.ts`                         | util           | port verbatim          | `util/launchMediaWorkers.ts`                      |                                                             |
| `util/primitives/LimitedMap.ts`                        | util           | port verbatim          | `util/localization/index.ts`                      |                                                             |
| `util/qrCode/buildStyledQrCode.ts`                     | util           | port verbatim          | `components/auth/AuthQrCode.tsx`                  |                                                             |
| `util/replaceWithTeact.ts`                             | util           | port verbatim          | `util/localization/index.ts`                      | imports only (teact/fasterdom swap)                         |
| `util/stopEvent.ts`                                    | util           | port verbatim          | `components/common/PasswordForm.tsx`              |                                                             |
| `util/svgController.ts`                                | util           | port verbatim          | `hooks/stickers/useColorFilter.tsx`               | imports only (teact/fasterdom swap)                         |
| `util/trapFocus.ts`                                    | util           | port verbatim          | `components/ui/Modal.tsx`                         |                                                             |
| `components/ui/Portal.ts`                              | component      | kit adapter            | `components/ui/Notification.tsx`                  | thin adapter over src/lib/kit (stylesheet stays tt's)       |
| `components/ui/Transition.tsx`                         | component      | kit adapter            | `components/App.tsx`                              | thin adapter over src/lib/kit (stylesheet stays tt's)       |
| `hooks/useCurrentOrPrev.ts`                            | hook           | replaced by frameact   | `components/auth/Auth.tsx`                        | framework primitive (porting guide §4.2); call sites change |
| `hooks/useEffectWithPrevDeps.ts`                       | hook           | replaced by frameact   | `components/common/AnimatedSticker.tsx`           | framework primitive (porting guide §4.2); call sites change |
| `hooks/useForceUpdate.ts`                              | hook           | replaced by frameact   | `hooks/useAppLayout.ts`                           | framework primitive (porting guide §4.2); call sites change |
| `hooks/useFrozenProps.ts`                              | hook           | replaced by frameact   | `components/ui/Modal.tsx`                         | framework primitive (porting guide §4.2); call sites change |
| `hooks/useHeavyAnimation.ts`                           | hook           | replaced by frameact   | `components/common/AnimatedSticker.tsx`           | framework primitive (porting guide §4.2); call sites change |
| `hooks/useLastCallback.ts`                             | hook           | replaced by frameact   | `components/auth/AuthPhoneNumber.tsx`             | framework primitive (porting guide §4.2); call sites change |
| `hooks/useLayoutEffectWithPrevDeps.ts`                 | hook           | replaced by frameact   | `components/ui/Modal.tsx`                         | framework primitive (porting guide §4.2); call sites change |
| `hooks/useMediaTransition.ts`                          | hook           | replaced by frameact   | `components/common/Avatar.tsx`                    | framework primitive (porting guide §4.2); call sites change |
| `hooks/useMediaTransitionDeprecated.ts`                | hook           | replaced by frameact   | `components/auth/AuthQrCode.tsx`                  | framework primitive (porting guide §4.2); call sites change |
| `hooks/useModuleLoader.ts`                             | hook           | replaced by frameact   | `components/auth/AuthCode.async.tsx`              | framework primitive (porting guide §4.2); call sites change |
| `hooks/useMountAfterHeavyAnimation.ts`                 | hook           | replaced by frameact   | `components/common/StickerView.tsx`               | framework primitive (porting guide §4.2); call sites change |
| `hooks/usePrevious.ts`                                 | hook           | replaced by frameact   | `components/App.tsx`                              | framework primitive (porting guide §4.2); call sites change |
| `hooks/usePreviousDeprecated.ts`                       | hook           | replaced by frameact   | `components/common/AnimatedCounter.tsx`           | framework primitive (porting guide §4.2); call sites change |
| `hooks/useShowTransition.ts`                           | hook           | replaced by frameact   | `components/common/Sparkles.tsx`                  | framework primitive (porting guide §4.2); call sites change |
| `hooks/useShowTransitionDeprecated.ts`                 | hook           | replaced by frameact   | `components/common/UiLoader.tsx`                  | framework primitive (porting guide §4.2); call sites change |
| `hooks/useSignalEffect.ts`                             | hook           | replaced by frameact   | `components/App.tsx`                              | framework primitive (porting guide §4.2); call sites change |
| `hooks/useStateRef.ts`                                 | hook           | replaced by frameact   | `components/common/AnimatedSticker.tsx`           | framework primitive (porting guide §4.2); call sites change |
| `hooks/useSyncEffect.ts`                               | hook           | replaced by frameact   | `components/auth/CountryCodeInput.tsx`            | framework primitive (porting guide §4.2); call sites change |
| `lib/fasterdom/fasterdom.ts`                           | lib            | replaced by frameact   | `components/auth/AuthPhoneNumber.tsx`             | frameact / frameact/dom / frameact/scheduler                |
| `lib/fasterdom/stricterdom.ts`                         | lib            | replaced by frameact   | `components/App.tsx`                              | frameact / frameact/dom / frameact/scheduler                |
| `lib/teact/dom-events.ts`                              | lib            | replaced by frameact   | `hooks/useVideoCleanup.ts`                        | frameact / frameact/dom / frameact/scheduler                |
| `lib/teact/teact-dom.ts`                               | lib            | replaced by frameact   | `util/emoji/emoji.ts`                             | frameact / frameact/dom / frameact/scheduler                |
| `lib/teact/teact.ts`                                   | lib            | replaced by frameact   | `components/App.tsx`                              | frameact / frameact/dom / frameact/scheduler                |
| `components/common/helpers/renderTextWithEntities.tsx` | component      | deferred (other slice) | `components/ui/Notification.tsx`                  | stops the walk                                              |
| `components/main/LockScreen.tsx`                       | component      | deferred (other slice) | `components/main/LockScreen.async.tsx`            | stops the walk                                              |
| `components/main/Main.tsx`                             | component      | deferred (other slice) | `components/main/Main.async.tsx`                  | stops the walk                                              |
| `api/gramjs/index.ts`                                  | api            | already ported         | `hooks/useLangString.ts`                          |                                                             |
| `api/types/index.ts`                                   | api            | already ported         | `components/common/UiLoader.tsx`                  |                                                             |
| `components/common/helpers/mediaDimensions.ts`         | component      | already ported         | `components/ui/Checkbox.tsx`                      |                                                             |
| `components/ui/Link.tsx`                               | component      | already ported         | `components/ui/ModalStarBalanceBar.tsx`           |                                                             |
| `components/ui/Loading.tsx`                            | component      | already ported         | `components/auth/AuthCode.async.tsx`              |                                                             |
| `components/ui/RippleEffect.tsx`                       | component      | already ported         | `components/ui/Button.tsx`                        |                                                             |
| `components/ui/Spinner.tsx`                            | component      | already ported         | `components/auth/CountryCodeInput.tsx`            |                                                             |
| `config.ts`                                            | config         | already ported         | `components/App.tsx`                              |                                                             |
| `global/actions/initial.ts`                            | global         | already ported         | `components/auth/Auth.tsx`                        |                                                             |
| `global/helpers/chats.ts`                              | global         | already ported         | `components/common/UiLoader.tsx`                  |                                                             |
| `global/helpers/index.ts`                              | global         | already ported         | `hooks/useMultiaccountInfo.ts`                    |                                                             |
| `global/helpers/payments.ts`                           | global         | already ported         | `components/ui/ModalStarBalanceBar.tsx`           |                                                             |
| `global/helpers/peers.ts`                              | global         | already ported         | `components/common/Avatar.tsx`                    |                                                             |
| `global/index.ts`                                      | global         | already ported         | `components/App.tsx`                              |                                                             |
| `global/selectors/index.ts`                            | global         | already ported         | `components/App.tsx`                              |                                                             |
| `global/selectors/media.ts`                            | global         | already ported         | `hooks/media/useThumbnail.ts`                     |                                                             |
| `global/selectors/sharedState.ts`                      | global         | already ported         | `components/auth/AuthQrCode.tsx`                  |                                                             |
| `hooks/data/useSelector.ts`                            | hook           | already ported         | `components/common/icons/Icon.tsx`                |                                                             |
| `hooks/useHistoryBack.ts`                              | hook           | already ported         | `components/auth/Auth.tsx`                        |                                                             |
| `lib/color.ts`                                         | lib            | already ported         | `components/common/AnimatedSticker.tsx`           |                                                             |
| `lib/twemojiRegex.js`                                  | lib            | already ported         | `util/emoji/emoji.ts`                             |                                                             |
| `util/animation.ts`                                    | util           | already ported         | `lib/tlottie/TLottie.ts`                          |                                                             |
| `util/areDeepEqual.ts`                                 | util           | already ported         | `hooks/useBuffering.ts`                           |                                                             |
| `util/browser/globalEnvironment.ts`                    | util           | already ported         | `components/App.tsx`                              |                                                             |
| `util/browser/idb.ts`                                  | util           | already ported         | `util/localization/index.ts`                      |                                                             |
| `util/browser/multitab.ts`                             | util           | already ported         | `util/localization/index.ts`                      |                                                             |
| `util/browser/url.ts`                                  | util           | already ported         | `components/common/SafeLink.tsx`                  |                                                             |
| `util/browser/windowEnvironment.ts`                    | util           | already ported         | `components/App.tsx`                              |                                                             |
| `util/buildClassName.ts`                               | util           | already ported         | `components/App.tsx`                              |                                                             |
| `util/callbacks.ts`                                    | util           | already ported         | `hooks/useAppLayout.ts`                           |                                                             |
| `util/colors.ts`                                       | util           | already ported         | `util/imageResize.ts`                             |                                                             |
| `util/dates/oldDateFormat.ts`                          | util           | already ported         | `components/ui/RoundTimer.tsx`                    |                                                             |
| `util/deepLinkParser.ts`                               | util           | already ported         | `components/common/helpers/renderText.tsx`        |                                                             |
| `util/Deferred.ts`                                     | util           | already ported         | `util/localization/index.ts`                      |                                                             |
| `util/emoji/customEmojiManager.ts`                     | util           | already ported         | `components/common/hooks/useCustomEmoji.ts`       |                                                             |
| `util/emoji/fixNonStandardEmoji.ts`                    | util           | already ported         | `components/common/helpers/renderText.tsx`        |                                                             |
| `util/entities/ids.ts`                                 | util           | already ported         | `components/common/Avatar.tsx`                    |                                                             |
| `util/establishMultitabRole.ts`                        | util           | already ported         | `util/localization/index.ts`                      |                                                             |
| `util/files.ts`                                        | util           | already ported         | `components/auth/AuthPhoneNumber.tsx`             |                                                             |
| `util/formatCurrency.tsx`                              | util           | already ported         | `components/ui/ModalStarBalanceBar.tsx`           |                                                             |
| `util/generateUniqueId.ts`                             | util           | already ported         | `components/common/AnimatedSticker.tsx`           |                                                             |
| `util/handleError.ts`                                  | util           | already ported         | `lib/tlottie/TLottie.ts`                          |                                                             |
| `util/iteratees.ts`                                    | util           | already ported         | `components/auth/AuthCode.tsx`                    |                                                             |
| `util/localization/types.ts`                           | util           | already ported         | `components/ui/Notification.tsx`                  |                                                             |
| `util/math.ts`                                         | util           | already ported         | `components/ui/ImageCropper.tsx`                  |                                                             |
| `util/mediaLoader.ts`                                  | util           | already ported         | `components/common/UiLoader.tsx`                  |                                                             |
| `util/multiaccount.ts`                                 | util           | already ported         | `components/App.tsx`                              |                                                             |
| `util/oldLangProvider.ts`                              | util           | already ported         | `components/auth/AuthPhoneNumber.tsx`             |                                                             |
| `util/passcode/index.ts`                               | util           | already ported         | `components/App.tsx`                              |                                                             |
| `util/passcode/sessionStore.ts`                        | util           | already ported         | `hooks/useMultiaccountInfo.ts`                    |                                                             |
| `util/patchSafariProgressiveAudio.ts`                  | util           | already ported         | `hooks/useBuffering.ts`                           |                                                             |
| `util/phoneNumber.ts`                                  | util           | already ported         | `components/auth/AuthPhoneNumber.tsx`             |                                                             |
| `util/routing.ts`                                      | util           | already ported         | `components/App.tsx`                              |                                                             |
| `util/safePlay.ts`                                     | util           | already ported         | `components/common/CustomEmoji.tsx`               |                                                             |
| `util/schedulers.ts`                                   | util           | already ported         | `components/common/UiLoader.tsx`                  |                                                             |
| `util/searchWords.ts`                                  | util           | already ported         | `components/auth/CountryCodeInput.tsx`            |                                                             |
| `util/sessions.ts`                                     | util           | already ported         | `components/App.tsx`                              |                                                             |
| `util/signals.ts`                                      | util           | already ported         | `hooks/window/useBackgroundMode.ts`               |                                                             |
| `util/textFormat.ts`                                   | util           | already ported         | `components/common/Avatar.tsx`                    |                                                             |
| `util/theme.ts`                                        | util           | already ported         | `hooks/usePeerColor.ts`                           |                                                             |
| `util/themeStyle.ts`                                   | util           | already ported         | `hooks/stickers/useDynamicColorListener.ts`       |                                                             |
| `util/visibility/getOffsetToContainer.ts`              | util           | already ported         | `hooks/useCoordsInSharedCanvas.ts`                |                                                             |
| `util/wallpaper.ts`                                    | util           | already ported         | `components/App.tsx`                              |                                                             |
| `util/webLoginHandoff.ts`                              | util           | already ported         | `components/App.tsx`                              |                                                             |
| `util/windowSize.ts`                                   | util           | already ported         | `components/App.tsx`                              |                                                             |
| `util/withCache.ts`                                    | util           | already ported         | `util/emoji/emoji.ts`                             |                                                             |

### Packages imported by the closure

| package           | in package.json | first imported by                  |
| ----------------- | --------------- | ---------------------------------- |
| `qr-code-styling` | yes             | `util/qrCode/buildStyledQrCode.ts` |
| `react`           | no              | `components/common/icons/Icon.tsx` |

<!-- inventory:end -->
