# Port report: the media slice, 5a-1 (infrastructure, photo, video, round video, album)

Branch `port/media` (from `origin/main` `18da25f` plus the plan, `0cf1b93`), tt baseline `090e38f`. The plan is
[`docs/plans/2026-10-15-media.md`](../plans/2026-10-15-media.md); the decisions D1-D7 and R1 are accepted there (2026-10-15). This is the first of
four media slices: the loading infrastructure and the four most common message media. Photos, albums, videos, GIFs and round videos now render, load
progressively (blurred stripped thumbnail, then the full image in a box of the final size), autoplay and pause off screen, spoilers, selection
control of album parts, downloads through the `DownloadManager`, and the service worker that streams `./progressive/<hash>` and big downloads.
Documents, audio, voice, the audio player pane (5a-2), web pages, polls, location, contacts (5a-3) and the media viewer (5b) stay FOUNDATION STUBs.

## Summary

| Step         | Result                                                                                                                                                                                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 inventory  | `pnpm slice:inventory --base 0cf1b93` (the block at the end): 84 files in the closure, 24 to import (20 files that were not in `src/` and the 4 stubs), 46 already ported                                                                                                                                                                        |
| 2 import     | the 24 files from tt@090e38f, prettier-formatted, unchanged (`c679141`)                                                                                                                                                                                                                                                                          |
| 3 codemod    | `pnpm codemod` over the 16 component / hook files, unedited (`151cba9`); 8 `TODO(codemod)` kinds were left (transition `ref` options, a nested props pattern, `useStateRef`, `useForceUpdate`, a ref object returned from a hook, a keyed remount, a statement that runs once) plus the recurring mistakes of the chat-list and messages reports |
| 4 controller | the hooks and the service worker by hand (`efe877c`), the mock and the harness (`8c59c3a`), three parallel Sonnet batches after the hook conventions were set: A `Photo`, B `Video` + `RoundVideo`, C `Album` + `AlbumItem` + `withSelectControl` (`b6f487f`)                                                                                    |
| 5 gates      | e2e, visual, a11y, perf, leaks, `perf:compare` (below), all green at the end; one existing perf gate is flaky on both trees (below)                                                                                                                                                                                                              |

Commits (oldest first): plan decisions; import; codemod; infrastructure; mock scenario and harness; the four components with their unit tests; e2e,
service worker e2e and visual screens; allowlist / size budget / a11y / `perf:compare` scenario; perf gates and docs; strict-monitor self-test fix;
worker plugin fix and the video leak limit; the leak cycle by wheel; this report.

## Files

| Kind                                 | Count | Notes                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------ | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ported (component or hook)           |    16 | `Photo`, `Video`, `RoundVideo`, `Album`, `AlbumItem`, `MediaBadge`, `withSelectControl` (wrapper), `ProgressSpinner`, `AnimatedFileSize`, `DownloadManager`, `useMediaWithLoadProgress`, `useOffscreenCanvasBlur`, `useBlurredMediaThumbRef`, `useUnsupportedMedia`, `getCustomAppendixBg` (verbatim), `Main.tsx` mounts the manager                                                                       |
| verbatim                             |     9 | `util/download.ts` (+ one function), `serviceWorker/{progressive,download}.ts`, `service.worker.ts` and `setupServiceWorker.ts` (minus the PWA handlers), 4 stylesheets                                                                                                                                                                                                                                    |
| original (not in tt)                 |   ~25 | the mock (`scripts/mock/{mediaSpec,generateMediaAssets,generateMediaScenario}.ts`, `__invokeMiddlewares__/media.ts`, `__mocks__/media.json`, 39 assets, 1.9 MB), `plugins/mockClientAssets.ts`, `scripts/visual/tt-media-files.mjs`, `tests/visual/mediaScreens.ts`, `tests/e2e/{media,progressive,middleHelpers}.ts`, `tests/a11y/media.a11y.spec.ts`, `tests/perf/media.perf.spec.ts`, 7 unit-test files |
| FOUNDATION STUBs retired             |     4 | `Photo`, `Video`, `RoundVideo`, `Album`; `placeholders.test.tsx` lost their stub tests                                                                                                                                                                                                                                                                                                                     |
| allowlist entries (`diff-allowlist`) |    10 | each with a reason and a cap (`Album` 0.85, `Video` 0.78, `Photo` 0.72, `useMediaWithLoadProgress` 0.72, `useOffscreenCanvasBlur` 0.68, `RoundVideo` 0.65, `withSelectControl` 0.65, `AnimatedFileSize` 0.55, `service.worker` 0.5, `useBlurredMediaThumbRef` 0.85)                                                                                                                                        |

Shared gate files were edited append-only (R1): `scripts/gates/{size-budget,diff-allowlist}.json` (one chunk entry, ten entries) and
`tests/a11y/baseline.json` (three entries). `tests/visual/screens.ts`, `scripts/visual/tt-patches.mjs`, `MockClient.ts`, `tests/perfcmp/probe.js`,
`gili/*`, `TextTimer`, `useClickable` were not touched; their work lives in new files (`mediaScreens.ts`, `tt-media-files.mjs`, `plugins/mockClientAssets.ts`).
`tests/perfcmp/scenarios.ts` and `run.ts` got an appended scenario and a `mockScenario` field.

## Deviations from tt worth knowing (all marked `// Deviation:`, 67 comments in the slice's files, 3 `TODO(port)`)

- **Hooks**: parameters are `MaybeAccessor`s and returns are accessors. `useMediaWithLoadProgress` keeps tt's three effects as `createEffect`s over
  `depsOf` tuples and `useForceUpdate` is a version signal read by the data memo (as `useMedia`). `useOffscreenCanvasBlur` returns a callback ref and keeps
  the canvas in a signal (a canvas can be transferred once, a new element starts over); a rejected `preloadImage` (undecodable thumbnail) is caught
  (tt: an unhandled rejection). `useUnsupportedMedia` takes an element accessor.
- **Photo**: the box comes from `clampMediaDimensions(getMediaDimensions(...))` in a shallow-equal memo (a replaced `photo` object of the same size wakes
  nobody); progress clamped to [0, 1]; `withThumb`, `canAutoLoad`, the initial spoiler flag are one-time reads on purpose (tt's `useState` initial values);
  `MediaSpoiler` is created once a spoiler has been shown and stays (its hide animation plays), the sensitive-content modal exists only for a sensitive photo,
  `decoding="async"` on the full image; the appendix colour effect runs on the mutate phase with a run token (a stale worker result and a destroyed photo
  are dropped) and its worker rejection is caught; `usePreviousDeprecated(isLoadAllowed) === false` is not ported (it was read once, always false).
- **Video / RoundVideo**: a sticky intersection memo like `StickerView`'s; the `<video>` element feeds a signal for `useUnsupportedMedia` and the duration;
  one `Show` per lazy block (spinner, play button, download icon, spoiler, badges, last-progress bar, modal); the play button exists only while it is shown
  (tt always rendered it, `display: none` when closed); `defaultMuted` through a constant spread (not in frameact's `<video>` types); duration, progress and the
  last-playback percent are finite and capped. RoundVideo: the ring's `stroke-dashoffset` is a reactive attribute (tt: a layout effect with a ref), stable
  `onTimeUpdate` / `onEnded` handlers, `onDestroy` clears the single-player state (a destroyed component could otherwise `play()` a detached video with sound).
- **Album**: one `parts` memo with stable keys, a keyed `For`, the layout memoised on the ratio list (an unchanged album does not recompute),
  `MAX_ALBUM_ITEMS = 10` (decision D5, `// Deviation (untrusted)`), ratios from the clamped dimensions, `paidMedia?.extendedMedia ?? []`, parts without media dropped
  before the layout (tt indexed `items` by message position). `withSelectControl` is a wrapper component with `withGlobal` and `splitProps` / `mergeProps` getters.
- **DownloadManager**: `activeDownloads` is a container the store merges in place, so the effect depends on its keys (`keys(...)`), not the object (plan item 3 of
  "do not repeat"); the file name is sanitised (`sanitizeDownloadFilename` in `util/download.ts`: C0 / C1 / bidi / zero-width characters, path separators and
  leading dots removed, length 180 with the extension kept, idempotent; used for `a.download`, and for the `filename` of the `./download/` URL).
- **Service worker** (decision D1): `service.worker.ts` serves `./progressive/` and `./download/` only; push, share and the asset cache are the PWA milestone
  (the handlers, their imports and the page-side messages of `setupServiceWorker.ts` are removed, with `TODO(port)`). `util/setupServiceWorker.ts` is
  imported from `src/index.tsx` where tt does it. `getMediaFormat` still returns `Progressive` for every video when `'serviceWorker' in navigator`.
- **`launchMediaWorkers(isForced = false)`**: `requestMediaWorker` (thumbnail blur, appendix colour, image resize) starts the media workers under APP_ENV=test too.
  tt returned no workers there and the first request threw, so under the mocked client no thumbnail was ever blurred and every media message logged an error.
  `launchMediaWorkers()` itself still returns none in test mode (TLottie depends on that). The same two-line patch is applied to the tt copy.

## The mock and the harness

- `media` scenario: "Mia Photos" (24 photos in 22 messages: a 2-album, a 20000x10 "photo", 10:1 and 1:10, a spoiler, captions, two outgoing, a 4-album at the
  bottom), "Vic Videos" (a clip, a GIF, two round videos, a spoiler video, a video without sound, a 1.6 MB video, then 40 text messages), "Saved Messages" (3 photos).
  JSON cannot hold the Api classes: a message has a plain `mediaSpec` and `__invokeMiddlewares__/media.ts` builds the real `Photo` (PhotoStrippedSize + 'm' and
  'x' PhotoSizes at the declared size) and `Document` (DocumentAttributeVideo / Animated / Filename, thumbs), pages the history like the server, and answers
  `upload.GetFile` with `bytes.slice(offset, offset + limit)`. The stock mock returned the whole file for every part: any asset above one 512 KB part was corrupted
  (unit test + the 1.6 MB video e2e).
- Assets are generated by `scripts/mock/generateMediaAssets.ts` (ffmpeg with libvpx-vp9 and libopus; ImageMagick is not installed here and is not needed: `geq` /
  `drawbox`), deterministic (bitexact flags: two runs give the same md5), committed (1.9 MB). The stripped thumbnails are real: scan data of a 4:2:0 baseline JPEG put
  behind `strippedPhotoToJpg`'s header, decoded back by ffmpeg in the script. WebM / VP9 (decision D2).
- Both apps get the scenario: the tt copy through `scripts/visual/tt-media-files.mjs` (binary files copied as bytes; `tt-run.mjs` hashes them as bytes), ours in
  production builds through `plugins/mockClientAssets.ts`, which applies the same text replacements to `MockClient.ts` (the middleware and `__data__` files are loaded
  by `@vite-ignore` imports a production build leaves out). The plugin must be in `worker.plugins` too: the MockClient lives in the API worker bundle. **The first
  `perf:compare` run was invalid** (our build had no assets: 0 photos loaded against tt's 14, dd "0.38x script") until this was found; the scenario now records
  `photosLoaded` and `messagesRendered` (14 and 21 in both apps).
- Two more fixes of the stock mock, applied to both apps: `getSender()` returns a promise (the downloader awaits it: no file could be downloaded) and the media workers
  in test mode (above). The `messages` and `default` scenarios are untouched; `middle-chat-group` (its stub-photo album now renders real photos) stayed at 0 px.
- Decision D4 (static map): the `GetWebFile` answer needs a `downloadStaticMap` method on the MockClient (the middleware cannot intercept a method), which is a
  `MockClient.ts` edit (R1); it is left for 5a-3 after the composer merge. Nothing in 5a-1 uses it.
- No service worker in the gates (D1): `Navigator.prototype.serviceWorker` is deleted before any script in `tests/e2e/fixtures.ts` (a `context` fixture,
  `keepServiceWorker` opts out), `tests/visual/determinism.ts`, `tests/perfcmp/runner.ts` and the media perf spec; the `strictMonitor` self-test (plain `test`)
  needed it too (Playwright logs "Service Worker registration blocked" as a console warning).

## Gate results

Last runs on the final tree (the machine was shared with other agents' jobs, load 6-10; the perf numbers below were taken at load 5.6-7.6):

| Gate                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`        | green: oxlint 0 warnings, prettier, tsc (both projects), `gates:diff` / `tests` / `licenses`, build, `gates:size` (`service.worker.js` budgeted: 2.4 KiB brotli; JS total +9.4 KiB over the baseline, inside the budget)                                                                                                                                                                                                                                                                                                                |
| `pnpm test`         | 888 passed, 2 opt-in skipped; 101 new tests (Photo 21, Video 22, RoundVideo 19, Album 17 with the select wrapper, `useMediaWithLoadProgress` 7, `download` 8, the media middleware 7)                                                                                                                                                                                                                                                                                                                                                   |
| `pnpm gates`        | diff / tests / licenses pass, upstream reported, size within budget; the production bundle contains no mock (`mediaSpec`, `photo-101`, `__invokeMiddlewares__` are not in `dist/`)                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm test:e2e`     | 85 passed (strict: zero console / page / request / stricterdom problems). `media.spec.ts` 17 tests, `progressive.spec.ts` 2. `chatlist` + `messages` + `media` + `progressive` specs 3x: 149/150, the one failure was `messages.spec.ts` "scrolling up ... (steps)" at 37 s against the 30 s test timeout under 4 parallel workers (22 s alone; 3/3 green alone): an existing test with little headroom, not related to media                                                                                                           |
| `pnpm test:a11y`    | 20 passed; 3 new baseline entries (the non-focusable `.MessageList` scroll container, tt's markup, the same reason as the messages entries); the media bodies add no violation                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm test:visual`  | 19 passed: `media-photos`, `media-photos-top`, `media-spoiler`, `media-videos` at **0 px** (threshold 0; the `<video>` boxes of `media-videos` are masked, decision D3); every earlier screen stayed at 0 px, `middle-chat-group` included                                                                                                                                                                                                                                                                                              |
| `pnpm test:perf`    | media: 5/5. Leak, photos chat: +287-289 KB, 0 nodes, 0 listeners over 50 open / close cycles (limit 512 KB); leak, videos chat: +390-400 KB (second half 204-217 KB), 0 nodes, 0 listeners, no `<video>` element after any close (limit set to 800 KB: 645 KB was seen once while another job loaded the machine; the node and listener gates stay strict); 10 more cycles of both chats create **0** new blob URLs; long tasks: open + scroll under tt's worst task (232 cap), autoplay videos scrolling in and out under the same cap |
| existing perf gates | `chatlist.perf` 6/6; `messages.perf` 3/4 in the full run and in the combined media + messages run: "opening and closing a chat" failed twice on the second half of its heap growth (344 KB against 256) while other agents' jobs loaded the machine (load 10-15), then passed 3 of 3 re-runs (222-233 KB, 0 nodes, 0 listeners). A/B of the same cycle on this tree and on `origin/main` `18da25f` (a temporary worktree, removed): second half 95-108 KB on both, so it is a gate that is noisy under load, not a regression           |

Bugs the e2e / gates found that unit tests had not (all fixed): the mock's `getSender()` (no file could be downloaded); the media workers absent in test mode
(every thumbnail logged an error); the MockClient plugin missing from the worker bundle (photos 0 against 14 in the first `perf:compare`); the strict monitor
self-test and the service worker warning; stricterdom flagging a `getBoundingClientRect` in my own test's MutationObserver (the recorder reads sizes from a
`ResizeObserver` now); the video leak cycle that set `scrollTop` before the history observers were ready and waited for ever (10 min timeout once).

## Performance against telegram-tt

`pnpm perf:compare --scenario open-media-chat --runs 9` (CPU x3.88 calibrated, interleaved; load 5.6-7.6; both apps load the same 14 of 21 photos): "Mia Photos"
is opened and its history scrolled up in 400 px steps to the first message.

| metric (open a chat of photos and scroll its history) |             dd |             tt |                 ratio |
| ----------------------------------------------------- | -------------: | -------------: | --------------------: |
| long tasks                                            |              2 |        4 (3-4) |                 0.50x |
| long tasks, total ms                                  |  222 (201-251) |  440 (385-496) |                 0.50x |
| longest long task ms                                  |  160 (148-185) |  196 (113-225) |                 0.82x |
| total blocking time ms                                |  122 (101-151) |  259 (214-321) |                 0.47x |
| script ms                                             |  354 (315-415) |  650 (592-685) |                 0.54x |
| style / layout / paint ms                             | 229 / 46 / 303 | 266 / 60 / 321 | 0.86x / 0.77x / 0.94x |
| GC ms                                                 |     17 (14-22) |     34 (28-48) |                 0.51x |
| frames dropped                                        |     18 (14-20) |     30 (23-34) |                 0.60x |
| DOM mutations                                         |            528 |           1964 |                 0.27x |
| JS heap after GC MB                                   |           11.2 |           13.5 |                 0.83x |
| frames to reach the bottom / window ms                |      51 / 4023 |      51 / 3988 |                 1.00x |

dd is ahead on every metric; the gate `maxMs` is tt's worst task (225) plus 3% = 232 ms. Reading it: this scenario is 22 messages, one history page, and the
photos are tiny (9-12 KB), so decode and layout are small in both apps; tt's higher script time is its per-message cost. Per-message node count (dev build, DOM
nodes under `.Message`): a text message 13, a plain loaded photo 15, a photo with a caption 26, the 2-album 24 (plan target: a photo under +40 over a text message).

## frameact engine gaps found (engine-only; for frameact PRs, not implemented here)

The earlier reports' gaps apply as they were. New, all small:

1. **`mergeProps` lets a later source's `undefined` fall through to the earlier source** (found by batch C, `withSelectControl`: select mode must pass `onClick: undefined`
   down). Minimal repro: `const p = mergeProps({ onClick: handler }, { get onClick() { return undefined; } }); p.onClick === handler`. Solid has the same
   semantics, so this is a documentation item: the port removes the key with `splitProps` first. A line in `llms-full.md` would save the next porter the hour.
2. **`createMutationEffect` applies synchronously at creation** (known, chat-list gaps #4 / #5): any effect that writes the DOM of an element it reads through a `ref`
   must be `createEffect(compute, apply, frameMutation)` (Photo's appendix effect). Not new, but the codemod's `useLayoutEffect` -> `createMutationEffect` mapping
   still produces the wrong shape for it.
3. **`<video>` JSX types lack `defaultMuted`** (a DOM property tt sets as a prop): written as a spread of a constant object. Adding it to `VideoHTMLAttributes` is enough.
4. **`OptimizedVideo` / `useVideoAutoPause`** (client code, noted for the reviewer): the initial `play()` runs in an effect that can run before the `<video>` is attached;
   autoplay then relies on the `autoplay` attribute. The e2e (autoplay, pause off screen, play again) passes; the unit tests see `play()` only after `canPlay` flips on a
   connected element.

## Risks to review

- **The service worker** (`src/serviceWorker/*`, `util/setupServiceWorker.ts`): verbatim tt code (progressive Range answers from `callApi('downloadMedia')`, big downloads as
  a `ReadableStream`), without push / share / assets. It answers only URLs under its scope that contain `/progressive/` or `/download/`. `respondForProgressive` takes
  its range from a regex on the `Range` header and does `bytes[1]` on the match: a request without a `Range` header throws inside the handler (a network error for that
  request, not a security issue, but not tt-guarded either). `Service-Worker-Allowed: /` is only set by the dev server; hosting must send it for a module worker with
  scope `/`. The cache of progressive parts (`MEDIA_PROGRESSIVE_CACHE_*`) is tt's. e2e: `progressive.spec.ts`.
- **Download file names**: `sanitizeDownloadFilename` is applied in `DownloadManager` (also for the `?filename=` of `./download/`) and in `downloadOne`; the service worker's
  `Content-Disposition` keeps tt's own control-character filter. The shown name must equal the saved name for documents: that check is 5a-2 (the document component).
  A `filename*=UTF-8''` header still carries whatever the page sent, now already sanitised.
- **Blob lifetimes**: tt's `mediaLoader` keeps blob URLs in `memoryCache` for the session and never revokes them (a cache, parity); `clearMemoryCache` revokes on log-out. The
  gate asserts no new blob per cycle for loaded media, not revocation. A hostile media still creates one blob per distinct hash.
- **Untrusted dimensions**: `getMediaDimensions` already drops NaN / non-positive sizes (fallback 100x100); `clampMediaDimensions` bounds the rest (1..8192 px, ratio 0.1..10)
  for Photo, Video, RoundVideo, Album, and the spoiler canvas size. The e2e covers a 20000x10 photo, the unit tests NaN / 0 / -5 / 1e9 / Infinity in sizes, durations and progress.
  The 10-part album cap (D5) is `// Deviation (untrusted)`; the poll cap is 5a-3.
- **`MediaSpoiler` and the sensitive modal exist only when needed** (perf deviations): check that no state of a message can show a spoiler without creating it (the latch
  memo in Photo / Video).
- **The mock plugin applies replacements to `MockClient.ts` text** and throws if one no longer matches: a change of that file (the composer slice edits it) must update
  `scripts/visual/tt-media-files.mjs`. It is active only with `APP_MOCKED_CLIENT=1`.
- 5a-2 will want `useAudioPlayback`, `Document`, and `useClickable` (from `port/composer`): merge `origin/main` after the composer PR (R1).

<!-- inventory:start -->

## Inventory (generated by `pnpm slice:inventory`)

Roots: `src/components/middle/message/Photo.tsx`, `src/components/middle/message/Video.tsx`, `src/components/middle/message/RoundVideo.tsx`, `src/components/middle/message/Album.tsx`, `src/components/middle/message/AlbumItem.tsx`, `src/hooks/useMediaWithLoadProgress.ts`, `src/components/main/DownloadManager.tsx`, `src/components/ui/ProgressSpinner.tsx`, `src/hooks/media/useUnsupportedMedia.ts`, `src/components/common/AnimatedFileSize.tsx`, `src/util/setupServiceWorker.ts`, `src/serviceWorker/service.worker.ts`. Walk stops at: `src/serviceWorker/pushNotification.ts`, `src/serviceWorker/share.ts`, `src/serviceWorker/assetCache.ts`, `src/util/notifications.tsx`.
Reference: `../../reference/telegram-tt`. Closure of files not yet in `src/`; a file that is already ported is listed once and not descended into.

| status                 | files | lines |
| ---------------------- | ----: | ----: |
| stub to replace        |     4 |  1273 |
| port via codemod       |    11 |   753 |
| port verbatim          |     9 |   736 |
| replaced by frameact   |    10 |  1486 |
| deferred (other slice) |     4 |  1050 |
| already ported         |    46 |  5781 |

| file                                                         | kind           | status                 | needed by                                                    | note                                                        |
| ------------------------------------------------------------ | -------------- | ---------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| `components/middle/message/Album.tsx`                        | component      | stub to replace        | root                                                         | FOUNDATION STUB in src/                                     |
| `components/middle/message/Photo.tsx`                        | component      | stub to replace        | root                                                         | FOUNDATION STUB in src/                                     |
| `components/middle/message/RoundVideo.tsx`                   | component      | stub to replace        | root                                                         | FOUNDATION STUB in src/                                     |
| `components/middle/message/Video.tsx`                        | component      | stub to replace        | root                                                         | FOUNDATION STUB in src/                                     |
| `components/common/AnimatedFileSize.tsx`                     | component      | port via codemod       | root                                                         | teact imports                                               |
| `components/main/DownloadManager.tsx`                        | component      | port via codemod       | root                                                         | teact imports                                               |
| `components/middle/message/AlbumItem.tsx`                    | component      | port via codemod       | root                                                         | teact imports                                               |
| `components/middle/message/helpers/getCustomAppendixBg.ts`   | component      | port via codemod       | `components/middle/message/Photo.tsx`                        | no teact imports (imports only)                             |
| `components/middle/message/hocs/withSelectControl.tsx`       | component      | port via codemod       | `components/middle/message/Album.tsx`                        | teact imports                                               |
| `components/middle/message/hooks/useBlurredMediaThumbRef.ts` | component      | port via codemod       | `components/middle/message/Photo.tsx`                        | no teact imports (imports only)                             |
| `components/middle/message/MediaBadge.tsx`                   | component      | port via codemod       | `components/middle/message/Photo.tsx`                        | teact imports                                               |
| `components/ui/ProgressSpinner.tsx`                          | component      | port via codemod       | root                                                         | teact imports                                               |
| `hooks/media/useUnsupportedMedia.ts`                         | hook           | port via codemod       | root                                                         | teact imports                                               |
| `hooks/useMediaWithLoadProgress.ts`                          | hook           | port via codemod       | root                                                         | teact imports                                               |
| `hooks/useOffscreenCanvasBlur.ts`                            | hook           | port via codemod       | `components/middle/message/hooks/useBlurredMediaThumbRef.ts` | teact imports                                               |
| `components/middle/message/AlbumItem.module.scss`            | style (module) | port verbatim          | `components/middle/message/AlbumItem.tsx`                    |                                                             |
| `components/middle/message/MediaBadge.module.scss`           | style (module) | port verbatim          | `components/middle/message/MediaBadge.tsx`                   |                                                             |
| `components/middle/message/Video.module.scss`                | style (module) | port verbatim          | `components/middle/message/Video.tsx`                        |                                                             |
| `components/ui/ProgressSpinner.scss`                         | style          | port verbatim          | `components/ui/ProgressSpinner.tsx`                          |                                                             |
| `serviceWorker/download.ts`                                  | other          | port verbatim          | `serviceWorker/service.worker.ts`                            |                                                             |
| `serviceWorker/progressive.ts`                               | other          | port verbatim          | `serviceWorker/service.worker.ts`                            |                                                             |
| `serviceWorker/service.worker.ts`                            | other          | port verbatim          | root                                                         |                                                             |
| `util/download.ts`                                           | util           | port verbatim          | `components/main/DownloadManager.tsx`                        |                                                             |
| `util/setupServiceWorker.ts`                                 | util           | port verbatim          | root                                                         |                                                             |
| `hooks/useForceUpdate.ts`                                    | hook           | replaced by frameact   | `hooks/useMediaWithLoadProgress.ts`                          | framework primitive (porting guide §4.2); call sites change |
| `hooks/useLastCallback.ts`                                   | hook           | replaced by frameact   | `components/common/AnimatedFileSize.tsx`                     | framework primitive (porting guide §4.2); call sites change |
| `hooks/useLayoutEffectWithPrevDeps.ts`                       | hook           | replaced by frameact   | `components/middle/message/Photo.tsx`                        | framework primitive (porting guide §4.2); call sites change |
| `hooks/useMediaTransition.ts`                                | hook           | replaced by frameact   | `components/middle/message/Photo.tsx`                        | framework primitive (porting guide §4.2); call sites change |
| `hooks/usePrevious.ts`                                       | hook           | replaced by frameact   | `components/middle/message/Photo.tsx`                        | framework primitive (porting guide §4.2); call sites change |
| `hooks/usePreviousDeprecated.ts`                             | hook           | replaced by frameact   | `components/middle/message/Photo.tsx`                        | framework primitive (porting guide §4.2); call sites change |
| `hooks/useShowTransition.ts`                                 | hook           | replaced by frameact   | `components/middle/message/Photo.tsx`                        | framework primitive (porting guide §4.2); call sites change |
| `hooks/useStateRef.ts`                                       | hook           | replaced by frameact   | `components/ui/ProgressSpinner.tsx`                          | framework primitive (porting guide §4.2); call sites change |
| `lib/fasterdom/fasterdom.ts`                                 | lib            | replaced by frameact   | `components/middle/message/Photo.tsx`                        | frameact / frameact/dom / frameact/scheduler                |
| `lib/teact/teact.ts`                                         | lib            | replaced by frameact   | `components/common/AnimatedFileSize.tsx`                     | frameact / frameact/dom / frameact/scheduler                |
| `serviceWorker/assetCache.ts`                                | other          | deferred (other slice) | `serviceWorker/service.worker.ts`                            | stops the walk                                              |
| `serviceWorker/pushNotification.ts`                          | other          | deferred (other slice) | `serviceWorker/service.worker.ts`                            | stops the walk                                              |
| `serviceWorker/share.ts`                                     | other          | deferred (other slice) | `serviceWorker/service.worker.ts`                            | stops the walk                                              |
| `util/notifications.tsx`                                     | util           | deferred (other slice) | `util/setupServiceWorker.ts`                                 | stops the walk                                              |
| `api/types/index.ts`                                         | api            | already ported         | `components/main/DownloadManager.tsx`                        |                                                             |
| `components/common/helpers/mediaDimensions.ts`               | component      | already ported         | `components/middle/message/RoundVideo.tsx`                   |                                                             |
| `components/common/icons/Icon.tsx`                           | component      | already ported         | `components/middle/message/Photo.tsx`                        |                                                             |
| `components/common/MediaSpoiler.tsx`                         | component      | already ported         | `components/middle/message/Photo.tsx`                        |                                                             |
| `components/common/SensitiveContentConfirmModal.tsx`         | component      | already ported         | `components/middle/message/Photo.tsx`                        |                                                             |
| `components/middle/message/Album.scss`                       | style          | already ported         | `components/middle/message/Album.tsx`                        |                                                             |
| `components/middle/message/helpers/calculateAlbumLayout.ts`  | component      | already ported         | `components/middle/message/Album.tsx`                        |                                                             |
| `components/middle/message/media.module.scss`                | style (module) | already ported         | `components/middle/message/Photo.tsx`                        |                                                             |
| `components/middle/message/RoundVideo.scss`                  | style          | already ported         | `components/middle/message/RoundVideo.tsx`                   |                                                             |
| `components/ui/Button.tsx`                                   | component      | already ported         | `components/middle/message/RoundVideo.tsx`                   |                                                             |
| `components/ui/OptimizedVideo.tsx`                           | component      | already ported         | `components/middle/message/RoundVideo.tsx`                   |                                                             |
| `config.ts`                                                  | config         | already ported         | `components/middle/message/Photo.tsx`                        |                                                             |
| `global/helpers/index.ts`                                    | global         | already ported         | `components/middle/message/Album.tsx`                        |                                                             |
| `global/index.ts`                                            | global         | already ported         | `components/main/DownloadManager.tsx`                        |                                                             |
| `global/selectors/index.ts`                                  | global         | already ported         | `components/main/DownloadManager.tsx`                        |                                                             |
| `hooks/data/useSelector.ts`                                  | hook           | already ported         | `hooks/useMediaWithLoadProgress.ts`                          |                                                             |
| `hooks/media/useThumbnail.ts`                                | hook           | already ported         | `components/middle/message/RoundVideo.tsx`                   |                                                             |
| `hooks/stickers/useDynamicColorListener.ts`                  | hook           | already ported         | `components/ui/ProgressSpinner.tsx`                          |                                                             |
| `hooks/useAsyncResolvers.ts`                                 | hook           | already ported         | `components/middle/message/RoundVideo.tsx`                   |                                                             |
| `hooks/useFlag.ts`                                           | hook           | already ported         | `components/middle/message/Photo.tsx`                        |                                                             |
| `hooks/useIntersectionObserver.ts`                           | hook           | already ported         | `components/middle/message/Photo.tsx`                        |                                                             |
| `hooks/useLang.ts`                                           | hook           | already ported         | `components/common/AnimatedFileSize.tsx`                     |                                                             |
| `hooks/useMedia.ts`                                          | hook           | already ported         | `components/middle/message/Video.tsx`                        |                                                             |
| `hooks/useOldLang.ts`                                        | hook           | already ported         | `hooks/media/useUnsupportedMedia.ts`                         |                                                             |
| `hooks/useRunDebounced.ts`                                   | hook           | already ported         | `components/main/DownloadManager.tsx`                        |                                                             |
| `hooks/useThrottledCallback.ts`                              | hook           | already ported         | `hooks/useMediaWithLoadProgress.ts`                          |                                                             |
| `hooks/useUniqueId.ts`                                       | hook           | already ported         | `hooks/useMediaWithLoadProgress.ts`                          |                                                             |
| `hooks/window/useDevicePixelRatio.ts`                        | hook           | already ported         | `components/ui/ProgressSpinner.tsx`                          |                                                             |
| `util/accountSlot.ts`                                        | util           | already ported         | `serviceWorker/progressive.ts`                               |                                                             |
| `util/animation.ts`                                          | util           | already ported         | `components/ui/ProgressSpinner.tsx`                          |                                                             |
| `util/audioPlayback/playbackController.ts`                   | util           | already ported         | `components/middle/message/RoundVideo.tsx`                   |                                                             |
| `util/browser/windowEnvironment.ts`                          | util           | already ported         | `components/main/DownloadManager.tsx`                        |                                                             |
| `util/buildClassName.ts`                                     | util           | already ported         | `components/middle/message/AlbumItem.tsx`                    |                                                             |
| `util/buildStyle.ts`                                         | util           | already ported         | `components/middle/message/AlbumItem.tsx`                    |                                                             |
| `util/cycleRestrict.ts`                                      | util           | already ported         | `hooks/useOffscreenCanvasBlur.ts`                            |                                                             |
| `util/dates/oldDateFormat.ts`                                | util           | already ported         | `components/middle/message/RoundVideo.tsx`                   |                                                             |
| `util/deeplink.ts`                                           | util           | already ported         | `util/setupServiceWorker.ts`                                 |                                                             |
| `util/files.ts`                                              | util           | already ported         | `util/setupServiceWorker.ts`                                 |                                                             |
| `util/generateUniqueId.ts`                                   | util           | already ported         | `components/main/DownloadManager.tsx`                        |                                                             |
| `util/keys/messageKey.ts`                                    | util           | already ported         | `components/middle/message/Album.tsx`                        |                                                             |
| `util/launchMediaWorkers.ts`                                 | util           | already ported         | `components/middle/message/helpers/getCustomAppendixBg.ts`   |                                                             |
| `util/mediaLoader.ts`                                        | util           | already ported         | `components/main/DownloadManager.tsx`                        |                                                             |
| `util/passcode/meta.ts`                                      | util           | already ported         | `serviceWorker/progressive.ts`                               |                                                             |
| `util/safePlay.ts`                                           | util           | already ported         | `components/middle/message/RoundVideo.tsx`                   |                                                             |
| `util/schedulers.ts`                                         | util           | already ported         | `serviceWorker/service.worker.ts`                            |                                                             |
| `util/textFormat.ts`                                         | util           | already ported         | `components/common/AnimatedFileSize.tsx`                     |                                                             |

### Packages imported by the closure

| package | in package.json | first imported by                                      |
| ------- | --------------- | ------------------------------------------------------ |
| `react` | no              | `components/middle/message/hocs/withSelectControl.tsx` |

<!-- inventory:end -->
