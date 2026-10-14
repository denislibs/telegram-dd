# Browser quality gates

Five gates that run in a real browser (Playwright + Chromium) and answer the question a unit test cannot: _does the
screen we just ported behave and look like Telegram, without errors, leaks or jank?_ They sit on top of `pnpm check`
and `pnpm test` and are part of the per-slice checklist ([porting guide §7.2](porting-guide.md#72-per-file-checklist)).

| Gate                     | Command                               | What it checks                                                                         | Where                              |
| ------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------- |
| 1. Strict e2e            | `pnpm test:e2e`                       | zero console errors/warnings, page errors, failed app requests, stricterdom violations | `tests/e2e/`                       |
| 2. Visual vs telegram-tt | `pnpm test:visual` (`pnpm visual:tt`) | screenshots of our screen and of tt's, same data, diffed per pixel                     | `tests/visual/`, `scripts/visual/` |
| 3. Leaks                 | `pnpm test:perf`                      | JS heap growth after N runs of an action (CDP, forced GC)                              | `tests/perf/leaks.ts`              |
| 4. Long tasks            | `pnpm test:perf`                      | no main-thread task above 50 ms under 4x CPU throttling                                | `tests/perf/longTasks.ts`          |
| 5. Accessibility         | `pnpm test:a11y`                      | axe-core (WCAG 2.0/2.1 A+AA) with a per-screen baseline of accepted violations         | `tests/a11y/`                      |

`pnpm test:browser` runs gates 1, 3, 4 and 5 (gate 2 needs the telegram-tt copy, see below). First time on a machine:
`pnpm playwright:install` (Chromium + system deps).

Playwright configs: `playwright.config.ts` (e2e + a11y, vite **dev** server on :1240, stricterdom on),
`playwright.perf.config.ts` (a **production** build served by `vite preview` on :1241, one worker),
`playwright.visual.config.ts` (our dev server + the tt copy on :1235, one worker). Ports and the build environment are in
`tests/config.ts`. All servers start themselves and are reused when already running (`pnpm dev:mocked` style).

## The mocked backend (shared by all gates)

There is no Telegram backend in tests. telegram-tt already ships a fake one: with `APP_ENV=test APP_MOCKED_CLIENT=1`
the GramJS `TelegramClient` is replaced by `MockClient` (`src/lib/gramjs/client/MockClient.ts`), the app boots as logged
in, and the data comes from `src/lib/gramjs/client/__mocks__/<scenario>.json` (`default`, `history`, `mention`,
`forums/*`) plus optional `__invokeMiddlewares__/<scenario>.ts` request handlers. The scenario is picked from the URL hash:
`/#?mockScenario=history`. Our `vite.config.ts` has the same alias, and our `src/lib/gramjs/client` is a verbatim port,
so **both apps get identical data**; `tests/visual/mocks.spec.ts` fails when a scenario differs between the two. New
scenarios are added to both trees (tt's tree only through the patch list, never in `reference/`).

The dummy `TG_TELEGRAM_API_ID/HASH` in `tests/config.ts` exist only to satisfy the config; nothing reaches Telegram.

## 1. Strict e2e fixture

`tests/e2e/fixtures.ts` exports a `test` (and `expect`) that **every e2e/a11y test imports instead of
`@playwright/test`**. After each test it fails the test if the page produced:

- a `console.error` or `console.warn` (stricterdom's own console errors are reported through the next point instead),
- an uncaught exception or unhandled rejection,
- a failed request or an HTTP >= 400 response from the app origin (aborted-by-navigation requests are ignored),
- any **stricterdom violation**: in dev, `src/index.tsx` calls `installStrictViolationRecorder()`
  (`src/dev/stricterdomRecorder.ts`), which `setHandler`s stricterdom so every violation (kind, phase, effect path,
  message) is pushed to `window.__strictViolations` _and_ still logged. The fixture reads that list and asserts it is
  empty; it also fails if the recorder is missing, so the gate cannot silently turn off.

Allowed noise is declared per test, with a reason, never globally:

```ts
test.use({ strictOptions: { ignoreRequests: [/__invokeMiddlewares__\//], ignoreConsole: [/known warning/] } });
```

`DEFAULT_IGNORED_CONSOLE` in `strictMonitor.ts` holds the two entries that are not ours (headless-GPU `GL Driver
Message`, the vite HMR client). `strictMonitor.spec.ts` is the gate's self-test (uses plain `@playwright/test` on
purpose): it proves each class of problem is seen.

Adding a screen: `tests/e2e/<screen>.spec.ts`, `import { expect, test } from './fixtures'`, open the route, exercise it.
For a screen that needs data open it with the mock (`/#?mockScenario=...`).

## 2. Visual comparison with telegram-tt

```
pnpm test:visual     # starts our dev server and the tt copy, runs every ported screen of tests/visual/screens.ts
pnpm visual:tt       # only the tt copy, in the foreground, on :1235 (to look at it by hand)
```

How the reference is run (`scripts/visual/tt-run.mjs`): `reference/telegram-tt` is **never modified**. The script copies
it (without `node_modules`, `.git`, `dist`) to `.cache/tt-run`, applies `scripts/visual/tt-patches.mjs`, runs
`npm install --ignore-scripts` there (once; re-done when the reference commit or the patch list changes, or with
`--refresh`) and starts its vite in mocked mode. In a git worktree it finds the reference in the main checkout
(`TT_REFERENCE=<dir>` overrides). Patches are exact-string replacements that fail loudly when the text moved. There is one:

- `MockClient.start()` ignores its `onConnected` callback at the baseline commit, so the worker's `initApi()` never
  resolves, `callApi` queues forever and tt's chat list stays on a spinner. The patch makes it call the callback.

Determinism (`tests/visual/determinism.ts`), the same for both apps: fixed viewport (1280x800, DPR 1), `en-US`, UTC,
light scheme, reduced motion, service workers blocked, `Date` frozen at 2026-10-12T12:00Z, seeded `Math.random`, all
CSS animations/transitions/carets off, `document.fonts.ready` and two frames awaited, each app in its own browser
context. Screens declare a `ready` selector list (the "screen is rendered" contract) and `mask` selectors for what can
never be pixel-stable (tt's mocked sync spinner).

`tests/visual/screens.ts` is the registry. A screen has: `name`, `ported` (`false` = skipped, the to-do list of the
port), `scenario`, a `reference` and a `candidate` target (`app: 'tt' | 'ours'`, `path`, `ready`, optional `prepare`
steps), optional `selector` (capture one element), `mask`, `viewport`, `threshold` (max share of differing pixels, 0 =
pixel-perfect), `pixelThreshold` (pixelmatch colour distance, default 0.1) and `expect: 'match' | 'differ'`.

**To add a ported screen**: copy a `ported: false` entry (`main-chat-list` is the template), set `candidate.path/ready`
to our route and the selector that proves it rendered, make `candidate.prepare` do the same clicks as `reference.prepare`,
set `ported: true`, run `pnpm test:visual`. Open `tests/visual/__diff__/<name>.diff.png` (red = differing pixels; also
`<name>.reference.png` and `<name>.candidate.png`; gitignored, attached to the Playwright report). Start with a threshold
that passes honestly (font rendering of web fonts is the usual 0.05-0.2%) and ratchet it down; a screen that needs a
threshold above ~1% is a real difference, not noise.

Real vs scaffolded today:

- **Real and green**: the tt copy runs with live mock data (chat list with the `default` scenario); the runner, the
  determinism layer, pixelmatch, `__diff__/` output and the scenario-sync check. `harness-tt-vs-tt` proves the
  pipeline is deterministic (0 differing pixels, stable over repeated runs). `harness-detects-difference` compares tt's
  main screen with our placeholder and passes only if the diff is large (`expect: 'differ'`).
- **Scaffolded**: `main-chat-list`, `main-menu`, `chat-with-history` are `ported: false` (our UI does not render them
  yet). Our app needs nothing special to join the comparison: it already honours `?mockScenario` through the shared
  `MockClient`; the ported `App` just has to boot into the logged-in state in mocked mode, as tt does
  (`global.auth.state = 'authorizationStateReady'` when `IS_MOCKED_CLIENT`).
- tt's mock does not implement every request (e.g. folders, language pack: errors in its console, a perpetual sync
  spinner). That is tt's noise, identical on every run; do not "fix" it in the screens, mask it.

## 3. Leak check

`tests/perf/leaks.ts`: `expectNoLeak(page, action, { runs: 50, maxGrowthKb: 512, warmupRuns: 5 })`. It runs `warmupRuns`
unmeasured, forces GC (`HeapProfiler.collectGarbage`, twice), reads `Runtime.getHeapUsage`, runs the action `runs`
times, forces GC and reads again; it fails when the growth exceeds `maxGrowthKb` and returns the numbers. The action
must be a full cycle (open and close a modal, mount and unmount a chat, scroll there and back): a one-way state change
legitimately grows the heap. Main thread only (workers are not measured). Run on the production build. Pick
`maxGrowthKb` as ~2x the growth you see on a clean run (`test.info().annotations` in the example prints it) and keep it
tight: a real leak is proportional to `runs`. `perf.spec.ts` shows the usage and proves detection with a deliberate leak.

## 4. Long tasks

`tests/perf/longTasks.ts`: `expectNoLongTasks(page, action, { maxMs: 50, cpuThrottlingRate: 4 })`. It sets
`Emulation.setCPUThrottlingRate`, collects `PerformanceObserver('longtask')` entries while the action runs and fails
when any task is longer than `maxMs` (the browser reports only tasks above 50 ms, so `maxMs` below 50 equals 50; raise
it to tolerate a known slow spot, never to hide a new one). `startLongTaskCollector` / `collectLongTasks` are exported for
custom flows (a navigation resets the collector). Note: code run through `page.evaluate` is not an event-loop task and
is never a long task; drive the UI (clicks, scrolls, typing) so the app's own handlers and frame phases run.

## 5. Accessibility

`tests/a11y/axe.ts`: `expectAccessible(page, selector?, { screen? })` runs axe-core with the tags
`wcag2a, wcag2aa, wcag21a, wcag21aa` (whole page or `selector`) and compares the result with
`tests/a11y/baseline.json`, keyed by screen (default: the test title):

```json
{
  "app shell": [{ "rule": "meta-viewport", "target": "meta[name=\"viewport\"]", "reason": "why, and what removes it" }]
}
```

A violation not in the baseline fails the test; a baseline entry that no longer occurs also fails (the baseline only
shrinks). `A11Y_UPDATE_BASELINE=1 pnpm test:a11y` rewrites the entries from the current violations; then write the
`reason` for each. The current baseline holds one entry: tt's viewport meta disables zooming and we keep it verbatim.
`axe.spec.ts` is the helper's self-test.

## CI

`.github/workflows/ci.yml`: `check` (submodules, `pnpm check`, `pnpm test`), `browser` (Chromium via
`npx playwright install --with-deps chromium`, then `test:e2e`, `test:a11y`, `test:perf`; traces and reports are
uploaded on failure) and `visual-vs-tt`, which is **optional** (`continue-on-error`): it clones telegram-tt at the
baseline commit from the porting guide into `reference/telegram-tt` and runs `pnpm test:visual`; diffs are uploaded.

## Thresholds at a glance

| Gate       | Default                                  | Tighten / loosen                                                  |
| ---------- | ---------------------------------------- | ----------------------------------------------------------------- |
| strict e2e | zero problems                            | `strictOptions.ignore*` per test, with a reason                   |
| visual     | per screen `threshold` (share of pixels) | start honest, ratchet down; `pixelThreshold` for AA noise; `mask` |
| leaks      | 512 KB over 50 runs after 5 warm-up runs | `maxGrowthKb`, `runs`, `warmupRuns`                               |
| long tasks | 50 ms at 4x CPU throttling               | `maxMs` (>= 50), `cpuThrottlingRate`                              |
| a11y       | no violations outside the baseline       | baseline entries with a reason                                    |
