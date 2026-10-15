# Quality gates

What stops a bad slice from landing. `pnpm check` and `pnpm test` must be green; this document describes the gates
behind them. The per-slice checklist that uses them is in [`porting-guide.md`](porting-guide.md#72-per-file-checklist).

## Script gates

Node scripts in `scripts/gates/` (TypeScript, run with `tsx`). Each is fast, deterministic, prints a readable report and
exits non-zero on failure. They need the telegram-tt reference clone (`reference/telegram-tt`, found by walking from the
repo, then the main worktree; `$TT_REFERENCE` overrides; `pnpm gates:reference` clones it at the baseline commit).

| Command               | What it checks                                                       | Fails when                                                                    | In `pnpm check`       |
| --------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------- |
| `pnpm gates:diff`     | each ported file against its telegram-tt counterpart                 | a file changed more than 40% (non-import lines), not allowlisted              | yes                   |
| `pnpm gates:upstream` | ported files whose tt counterpart changed upstream since the base    | never (report); `--strict` fails on drift                                     | no                    |
| `pnpm gates:tests`    | tt unit tests travel with the code they test                         | a ported subject has no copy of its tt test                                   | yes                   |
| `pnpm gates:size`     | brotli/gzip of entry and worker chunks and the JS/CSS totals         | any budget is exceeded, or an unbudgeted entry/worker appears                 | yes (after the build) |
| `pnpm gates:licenses` | licenses of production dependencies; `NOTICE.md` covers `src/lib/*`  | a license is not GPL-3.0-or-later compatible; a lib is missing in `NOTICE.md` | yes                   |
| `pnpm gates`          | all of the above, in order, with a summary (builds first for `size`) | any gate fails                                                                |                       |

`pnpm gates --only diff,tests`, `--no-build` (reuse `dist/`) and `--strict` (upstream drift fails) are available.
CI runs them as part of the `gates` job (`.github/workflows/ci.yml`), which first clones the reference with
`pnpm gates:reference`.

### Diff size against the reference (`gates:diff`)

A file in `src/` is **ported** when the reference has a file at the same path, or when its first line is
`// Ported from telegram-tt <path>` (a moved or merged file). For every ported file:

1. both sides are formatted with the repo's prettier config (the reference's own formatting never counts; results are
   cached in `.cache/gates/`), blank lines and whitespace differences are ignored;
2. top-level `import` statements (single- or multi-line) are separated from code, so teact -> frameact import swaps and
   `simple-import-sort` reordering do not dominate. Import changes are shown in their own column (`imports -/+`);
3. **changed lines** = `max(deleted, inserted)` of the non-import lines, **ratio** = changed / the larger side's
   non-import line count.

A file **fails** when ratio > **40%** _and_ it has at least **15** changed lines (so a 6-line file does not fail on two
edits). Tune for a one-off run with `--threshold 0.5 --min-lines 20`; `--top N` shows more offenders, `--json` is
machine-readable.

Reported but never failing:

- **Original files** (only in `src/`, no counterpart): counted by directory; `--list-original` lists them.
- **Foundation stubs**: a file whose first lines contain `// FOUNDATION STUB …` is a placeholder for a real port. It is
  listed so the debt stays visible, and it is excluded from the ratio. Remove the marker when the real file lands.
- **Binary files** that differ from the reference.

**Allowlisting** a file that legitimately differs a lot (for example the rewritten `src/global/index.ts` or the app
entry): add it to `scripts/gates/diff-allowlist.json` with a reason, and preferably a cap so it cannot silently grow:

```json
{
  "files": {
    "src/global/index.ts": { "reason": "store glue replacing TeactN (porting guide 3.2)", "maxRatio": 0.9 }
  }
}
```

An entry without a reason, for a file that is not ported (typo), or capped and exceeded fails the gate. An entry whose
file is back under the threshold is reported as stale: remove it.

### Upstream drift (`gates:upstream`)

Reads the baseline commit from `NOTICE.md`, lists `git diff base..HEAD` of the reference clone and intersects it with
the ported files (modified, deleted, renamed upstream; files already identical to upstream are not counted). The
reference clone is normally a one-commit shallow clone, so use `--remote`: it fetches only history and trees of
upstream `master` into `.cache/gates/tt-upstream.git` (the reference stays untouched) and compares with that. It is a
report; run it before bumping the baseline ([`porting-guide.md` 7.4](porting-guide.md#74-tracking-upstream)).

### tt unit tests travel with the code (`gates:tests`)

tt's tests are `*.test.*`, `*.spec.*` and files under `__tests__/`. The **subject** of a test is the same-named file next
to it (case-insensitive: `helpers.test.ts` tests `Helpers.ts`), or, when there is none, the files the test imports with
relative paths. A test is **due** when its subject is ported (all imported files are ported, for the second kind). A due
test must exist at the same path in `src/` and run under `pnpm test` (`vitest` picks up `*.test.ts(x)`); adapt only
imports and test setup. A test whose subject is not ported yet is listed as `WAITING` and does not fail.

If a due test cannot run without the teact UI, list it in `scripts/gates/tests-skip.json` with a reason (`"tests"` maps
the tt path to the reason). Skips are shown in the report; an entry without a reason or for a non-test fails.

Status now: 3 tt tests exist. `src/lib/gramjs/helpers.test.ts` and `security.test.ts` are copied (82 tests pass);
`src/util/browser/url.test.ts` waits for `src/util/browser/url.ts`.

### Bundle budgets (`gates:size`)

Measured on the production build (`pnpm build`, output `dist/`): brotli (quality 11) and gzip (level 9) of

- every **entry** chunk (scripts and stylesheets referenced from `dist/index.html`) and every **worker** chunk (name
  contains `worker`), matched by name without the content hash (`index-Ab12Cd34.js` -> `assets/index.js`);
- the **total** of all JS and the total of all CSS.

Other (lazy) chunks are listed and counted in the totals only, except `assets/all.js` (the actions that tt loads with its Main bundle), which has its own budget (`BUDGETED_LAZY` in `size.ts`). `scripts/gates/size-budget.json` holds, per item, the
`baseline` (size when the budget was written) and the `budget` (baseline + 10%). The report prints the size, the budget
and the delta against the baseline. A new entry/worker chunk without a budget fails: budgets change deliberately.

```bash
pnpm gates:size                  # compare
pnpm gates:size --update         # rewrite the budget: current sizes + 10% (review the diff, explain it in the PR)
pnpm gates:size --update --headroom 0.05
pnpm gates:size --build          # build first
```

### Dependency licenses (`gates:licenses`)

Runs `pnpm licenses list --json --prod` (transitive production dependencies, plus workspace packages such as
`frameact`) and evaluates each SPDX expression (`OR`, `AND`, `WITH`, parentheses; deprecated ids such as `GPL-3.0` are
normalised). The result must be GPL-3.0-or-later compatible. The allowed ids and the argument for each are in
`scripts/gates/license-policy.json`:

| Allowed                                                          | Why                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| MIT, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Zlib, MIT-0, BSL-1.0 | permissive, GPL compatible                                                           |
| CC0-1.0, Unlicense                                               | public-domain dedications                                                            |
| Apache-2.0                                                       | compatible with GPL-3.0 (not with GPL-2.0-only; the app is GPL-3.0-or-later)         |
| MPL-2.0                                                          | weak copyleft, section 3.3 permits combining with GPL                                |
| LGPL-2.1-only/-or-later, LGPL-3.0-only/-or-later                 | LGPL-2.1 converts to GPL-2.0-or-later; LGPL-3.0 is GPL-3.0 plus permissions          |
| GPL-2.0-or-later, GPL-3.0-only, GPL-3.0-or-later                 | the combined work can be GPL-3.0                                                     |
| Python-2.0, BlueOak-1.0.0, Artistic-2.0, WTFPL                   | permissive / FSF-listed as GPL compatible                                            |
| CC-BY-4.0                                                        | data and content only (for example `caniuse-lite`), never code; keep the attribution |

**Not allowed** (fail): GPL-2.0-only (no "or later"), AGPL-*, CC-BY-SA/NC/ND, source-available licenses (SSPL, BUSL),
proprietary, `UNLICENSED`, `SEE LICENSE IN …`, unknown. An unrecognised expression fails.

**Exceptions** go to `scripts/gates/license-exceptions.json` (`{"packages": {"name" or "name@version": {"reason": "…"}}}`).
A reason is required, an exception that matches no dependency is reported as stale. New allowed ids are added to
`license-policy.json` with the compatibility argument.

The gate also checks that every top-level entry of `src/lib/` that exists in telegram-tt is mentioned (as a code span) in
the `NOTICE.md` third-party inventory, so a vendored library cannot arrive without its notice.

Current findings: 149 production package versions, all allowed (130 MIT, 5 ISC, 5 MIT-or-Apache-2.0, 2 Apache-2.0, 2
BSD-3-Clause, and one each of GPL-3.0-or-later (`@cryptography/aes`), CC-BY-4.0 (`caniuse-lite`, data), BSD-2-Clause,
0BSD, Unlicense). `NOTICE.md` calls `@cryptography/aes` Apache-2.0 (from tt's README), but the package declares
GPL-3.0-or-later; both are compatible, the table should be corrected.

### Maintaining the gates

- Thresholds live at the top of `scripts/gates/diff.ts` (`DEFAULT_THRESHOLD`, `DEFAULT_MIN_LINES`); budgets and policy
  are the JSON files next to the scripts.
- `scripts/gates/lib/` holds the shared helpers (reference lookup, prettier normalisation with a disk cache, a capped
  Myers line diff).
- Everything in `.cache/gates/` is disposable.

## Browser gates

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
`playwright.visual.config.ts` (our dev server + the tt copy, one worker). Ports — 1240 / 1241 / 1242 in CI, shifted by a stable per-checkout offset locally so parallel git worktrees never reuse each other's servers — and the build environment are in
`tests/config.ts`. All servers start themselves and are reused when already running (`pnpm dev:mocked` style).

### The mocked backend (shared by all gates)

There is no Telegram backend in tests. telegram-tt already ships a fake one: with `APP_ENV=test APP_MOCKED_CLIENT=1`
the GramJS `TelegramClient` is replaced by `MockClient` (`src/lib/gramjs/client/MockClient.ts`), the app boots as logged
in, and the data comes from `src/lib/gramjs/client/__mocks__/<scenario>.json` (`default`, `history`, `mention`,
`forums/*`) plus optional `__invokeMiddlewares__/<scenario>.ts` request handlers. The scenario is picked from the URL hash:
`/#?mockScenario=history`. Our `vite.config.ts` has the same alias, and our `src/lib/gramjs/client` is a verbatim port,
so **both apps get identical data**; `tests/visual/mocks.spec.ts` fails when a scenario differs between the two. New
scenarios are added to both trees (tt's tree only through the patch list, never in `reference/`).

The dummy `TG_TELEGRAM_API_ID/HASH` in `tests/config.ts` exist only to satisfy the config; nothing reaches Telegram.

### 1. Strict e2e fixture

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
Message`, the vite HMR client); `DEFAULT_IGNORED_REQUESTS` the one request every page makes since the entry boots the
state layer against the MockClient: its optional `__invokeMiddlewares__/<scenario>` probe, which the dev server answers
with 404 for a scenario without a middleware. `strictMonitor.spec.ts` is the gate's self-test (uses plain
`@playwright/test` on purpose): it proves each class of problem is seen. Uncaught errors reach the gate as
`console.error` once the entry imports tt's `handleError` (it `preventDefault()`s them), not as `pageerror`.

`tests/e2e/multitab.spec.ts` is the two-tab test of the state layer: two pages of one context boot the real entry, the
first becomes the master, the second gets its global through `requestGlobal`; a chat and a tab-state field written in A
reach B, B posts nothing back, and a write in B reaches A.

The auth flow (`tests/e2e/auth.spec.ts`, helpers in `tests/e2e/authHelpers.ts`, shared with `tests/a11y/auth.a11y.spec.ts` and
`tests/perf/perf.spec.ts`): the test plays the server with `apiUpdate` actions and drives the real UI through phone number,
code, password, registration and the main placeholder, plus the QR code screen. `openApp()` first waits until the
mocked sync has been quiet for a second (see the visual section for why). frameact's DEV timing hints (`Slow effect run`,
`Slow measure drain`, `Slow store update`) are ignored by the monitor: they fire on a cold dev server under parallel CPU
load; real jank is the long-task gate's job.

Adding a screen: `tests/e2e/<screen>.spec.ts`, `import { expect, test } from './fixtures'`, open the route, exercise it.
For a screen that needs data open it with the mock (`/#?mockScenario=...`).

### 2. Visual comparison with telegram-tt

```
pnpm test:visual     # starts our dev server and the tt copy, runs every ported screen of tests/visual/screens.ts
pnpm visual:tt       # only the tt copy, in the foreground, on :1235 (to look at it by hand)
```

How the reference is run (`scripts/visual/tt-run.mjs`): `reference/telegram-tt` is **never modified**. The script copies
it (without `node_modules`, `.git`, `dist`) to `.cache/tt-run`, applies `scripts/visual/tt-patches.mjs`, runs
`npm install --ignore-scripts` there (once; re-done when the reference commit or the patch list changes, or with
`--refresh`) and starts its vite in mocked mode. In a git worktree it finds the reference in the main checkout
(`TT_REFERENCE=<dir>` overrides). Patches are exact-string replacements that fail loudly when the text moved. There are
three (`scripts/visual/tt-patches.mjs`; the first two fix the mock and are marked `shared`, because our `MockClient` is a
verbatim port with the same defects, see "Performance vs telegram-tt"):

- `MockClient.start()` ignores its `onConnected` callback at the baseline commit, so the worker's `initApi()` never
  resolves, `callApi` queues forever and tt's chat list stays on a spinner. The patch makes it call the callback.
- `MockClient` answers `GetDialogFilters` with a bare array, but `fetchChatFolders()` reads `messages.DialogFilters`
  (`{ filters, tagsEnabled }`): it threw ("reading 'findIndex'") and no folder tabs ever appeared. The patch returns the
  real shape. (A scenario's folder `title` must also be a `{ text, entities }` object now; the committed scenarios
  predate that.)
- `teactn.tsx` exposes `window.getGlobal / setGlobal / getActions` only when `DEBUG` is on; the patch also exposes them in
  a mocked-client build, so the performance comparison can run a production build and still inject updates.

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
- **Scaffolded**: `chat-with-history` is `ported: false` (the message list is not ported yet). `main-chat-list` and `main-menu` are ported (chat list slice, 0 px). Our app needs nothing special to join the comparison: it already honours `?mockScenario` through the shared
  `MockClient`; the ported `App` just has to boot into the logged-in state in mocked mode, as tt does
  (`global.auth.state = 'authorizationStateReady'` when `IS_MOCKED_CLIENT`).
- tt's mock does not implement every request (e.g. folders, language pack: errors in its console, a perpetual sync
  spinner). That is tt's noise, identical on every run; do not "fix" it in the screens, mask it.

Ported screens (chat list slice): `main-chat-list` (`#LeftColumn`) and `main-menu` (the open main menu), threshold 0 (0 px against tt, `docs/reports/slice-chatlist.md`).
Both apps run the same MockClient patch: tt's copy through `scripts/visual/tt-patches.mjs`, ours in `src/lib/gramjs/client/MockClient.ts` (`start()` calls `onConnected`).

Ported screens (auth slice): `auth-phone-number`, `auth-code`, `auth-password`, `auth-registration`, `auth-qr-code`
(`authScreen()` in `tests/visual/screens.ts`). Both apps boot logged in under the mock, so each target plays the server:
after the mocked API has settled (its `sync` handlers write whole-global snapshots taken before their awaits, which undo
an auth step played in the middle of them) it feeds the same `apiUpdate({'@type': 'updateAuthorizationState', …})` that
the API worker would send (both apps expose `window.getActions()` in the dev/test build), waits for the form and for
the screen transition. Result: 0 differing pixels on all five, threshold 0.05 %.

### 3. Leak check

`tests/perf/leaks.ts`: `expectNoLeak(page, action, { runs: 50, maxGrowthKb: 512, warmupRuns: 5 })`. It runs `warmupRuns`
unmeasured, forces GC (`HeapProfiler.collectGarbage`, twice), reads `Runtime.getHeapUsage`, runs the action `runs / 2`
times, reads again, runs the other half and reads a last time; it fails when the total growth exceeds `maxGrowthKb` **or** the second
half alone grows by more than `maxGrowthKb / 2` (a leak is linear; compiled code and warmed caches are front-loaded), and returns the
numbers. The action must be a full cycle (open and close a modal, mount and unmount a chat, scroll there and back): a one-way state
change legitimately grows the heap, and a cycle that only toggles kept-alive views disposes nothing (the kit's `Transition` keeps a
slide per key: remount the screen to test disposal). Main thread only (workers are not measured). Run on the production build.
`Runtime.getHeapUsage` counts V8's compiled code: a screen with hot paths needs a longer warm-up (the chat list tests use 25 runs;
`docs/reports/slice-chatlist.md` has the heap snapshot diff that told code growth from a retained object). Pick `maxGrowthKb` as ~2x
the growth you see on a clean run and keep it at the default unless a snapshot diff says why: a real leak is proportional to `runs`.
`perf.spec.ts` shows the usage and proves detection with a deliberate leak.

### 4. Long tasks

`tests/perf/longTasks.ts`: `expectNoLongTasks(page, action, { maxMs: 50 })`. It calibrates the CPU throttling rate (see
"Calibrated throttling" below; `cpuThrottlingRate: 4` forces a fixed rate), sets
`Emulation.setCPUThrottlingRate`, collects `PerformanceObserver('longtask')` entries while the action runs and fails
when any task is longer than `maxMs` (the browser reports only tasks above 50 ms, so `maxMs` below 50 equals 50; raise
it to tolerate a known slow spot, never to hide a new one). `startLongTaskCollector` / `collectLongTasks` are exported for
custom flows (a navigation resets the collector). Note: code run through `page.evaluate` is not an event-loop task and
is never a long task; drive the UI (clicks, scrolls, typing) so the app's own handlers and frame phases run.

### Calibrated throttling (why the millisecond caps are portable)

`Emulation.setCPUThrottlingRate(4)` slows down the machine it runs on, so "4x" on a slow CI runner is a much slower device than
"4x" on a fast laptop: the same code measured 78 ms locally and 147 ms on a GitHub runner (PR #16), and a cap set against
telegram-tt on one machine failed on the other. The perf gates therefore do not use a fixed rate. Like Lighthouse's
`benchmarkIndex`, they time a fixed JavaScript workload in the browser before throttling and scale the rate by how fast this
machine is against the machine the caps were set on:

```
rate = targetRate * referenceMs / measuredMs        clamped to [1, 8]
```

- **The target device** is the reference machine at 4x: `tests/perfcmp/cpu-reference.json` holds `targetRate` (4) and
  `referenceMs`, the median time of the benchmark (`tests/perfcmp/cpuBenchmark.js`: ~45 ms per round of objects and arrays
  built and sorted, strings split / joined / replaced, JSON, maps and sets, small allocations; seeded and deterministic; 7 timed
  rounds after 1 warm-up, run in a blank page of the same browser, about 0.4 s) on the machine the caps were set on (an Apple M1
  Pro, Chromium 156). A faster machine is throttled more (up to 8), a slower one less (down to 1), so 4x on the reference machine
  and "the calibrated rate" anywhere else slow a task down to the same speed.
- Every `expectNoLongTasks` call prints `[perf] CPU benchmark 47.2 ms (reference 42.5 ms, samples ...) -> CPU throttling x3.6`
  and attaches the same numbers as `cpu-calibration` (JSON) to the test; a failing assertion repeats the rate it ran with.
- **A machine below the target device** (raw rate under 1: even unthrottled it is slower than the target) fails the gate with
  a message saying so, it never passes silently: the caps cannot be checked there.
- `PERF_CPU_RATE=4 pnpm test:perf` (or `cpuThrottlingRate: 4` in a call) forces a fixed rate and skips the benchmark.
- `pnpm perf:compare` calibrates once per invocation and gives dd and tt the same rate (the ratios stay valid); `--cpu 4` forces
  a fixed rate, `--cpu auto` is the default, and the report header prints the calibration. A machine below the target gets a
  warning there (it is a measurement, not a gate).
- **Re-measuring the reference.** It must be redone when the benchmark changes (bump `CPU_BENCHMARK_REVISION` in
  `cpuCalibration.ts`; the unit test of the checksum fails on any change of the workload) and when the caps are re-based on a
  different reference machine. On that machine with nothing else running: `pnpm perf:calibrate --runs 20 --write` (the lowest
  median becomes `referenceMs`, with the machine, Chromium version, date and load noted). Then re-check the caps against
  telegram-tt on it (`pnpm perf:compare --scenario scroll,folders`), because caps and reference define the target device together.
- The rate computation (`computeRate`, clamping, the below-target flag, forced rates) has unit tests in
  `tests/perfcmp/cpuCalibration.test.ts`.

### 5. Accessibility

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

### CI

`.github/workflows/ci.yml`: `check` (submodules, `pnpm check`, `pnpm test`), `browser` (Chromium via
`npx playwright install --with-deps chromium`, then `test:e2e`, `test:a11y`, `test:perf`; traces and reports are
uploaded on failure) and `visual-vs-tt`, which is **optional** (`continue-on-error`): it clones telegram-tt at the
baseline commit from the porting guide into `reference/telegram-tt` and runs `pnpm test:visual`; diffs are uploaded.

### Thresholds at a glance

| Gate       | Default                                    | Tighten / loosen                                                  |
| ---------- | ------------------------------------------ | ----------------------------------------------------------------- |
| strict e2e | zero problems                              | `strictOptions.ignore*` per test, with a reason                   |
| visual     | per screen `threshold` (share of pixels)   | start honest, ratchet down; `pixelThreshold` for AA noise; `mask` |
| leaks      | 512 KB over 50 runs after 5 warm-up runs   | `maxGrowthKb`, `runs`, `warmupRuns`                               |
| long tasks | 50 ms at the target device (calibrated x4) | `maxMs` (>= 50), `cpuThrottlingRate` (forces a rate)              |
| a11y       | no violations outside the baseline         | baseline entries with a reason                                    |

## Performance vs telegram-tt

The frameact spec (§5) makes this the go/no-go measurement: if frameact does not beat teact on messenger scenarios, the
architecture did not pay off. `pnpm perf:compare` runs **both apps** on identical mocked data and reports the ratio
telegram-dd ÷ telegram-tt per scenario and metric. It is a measurement, not a gate: it never fails on a number, and CI runs
it only by hand (`.github/workflows/perf-compare.yml`, `workflow_dispatch`).

```bash
pnpm perf:compare                                   # every scenario, 5 runs per app, CPU x4, ~25 min
pnpm perf:compare --scenario cold-start,scroll      # chosen scenarios (ids: pnpm perf:compare --list)
pnpm perf:compare --runs 9 --cpu 6                  # more runs / a fixed throttling rate (default: auto, calibrated)
pnpm perf:compare --aa                              # tt against tt: the noise of the method on this machine
pnpm perf:compare --no-trace                        # skip the CDP trace (no script/style/layout/paint/GC columns)
pnpm perf:compare --no-build | --rebuild            # reuse the built apps as they are / force a rebuild
```

Reports land in `tests/perfcmp/results/<name>.{md,json}` (and `latest-dd-vs-tt.*`, `latest-aa.*`). The first run needs
`pnpm playwright:install` and the telegram-tt reference (it also builds the patched tt copy of the visual gate).

### How it measures

- **Both apps are production builds** of the mocked client (`APP_ENV=production APP_MOCKED_CLIENT=1`, dummy api id):
  ours with `vite build`, tt's patched copy (`.cache/tt-run`, `reference/` is never touched) with its own `vite build`.
  Production matters: tt's DEBUG build copies the whole global on every `getGlobal()`, ours runs stricterdom. Builds are
  cached by their inputs (our sources + working tree, the tt reference + patch list + scenario), so a rerun only rebuilds
  what changed; both are served by the same plain static server.
- **Chromium (Playwright, headless), 1280x800, CPU throttling calibrated to x4 on the reference machine** ("Calibrated throttling" above; `Emulation.setCPUThrottlingRate`), a **fresh browser
  per run**. N runs per app and scenario, **interleaved** (run 1 of every scenario for both apps, then run 2, ...; the
  order of the two apps alternates), medians reported with the min-max range. Each machine load average is recorded.
- A warm scenario boots unthrottled, rests 2.5 s, forces a GC, then switches the throttle on and measures only the
  scenario. Cold start is throttled from the first byte.
- **Metrics** (all lower-is-better; the legend is at the bottom of every report): long tasks (count, total, max;
  `PerformanceObserver`), total blocking time, the longest task of any length, script / style / layout / paint / GC **self
  time** from a CDP trace (`devtools.timeline`, `toplevel`, `blink.user_timing`; `tests/perfcmp/trace.ts`), frames dropped
  (rAF gaps against 60 Hz), DOM mutations (MutationObserver records), JS heap after two forced GCs. The trace and the
  observers cost some CPU, equally in both apps: read ratios, not absolute milliseconds. A difference below the
  per-metric floor (`minDelta` in `metrics.ts`, printed in the legend) is shown as "~".
- Everything is driven **from timers inside the page** (`tests/perfcmp/probe.js`, `window.__pc`), so Playwright round
  trips neither add to nor hide main-thread work. Updates are injected through `window.getActions().apiUpdate(...)`, the
  action the API worker's messages end up in; the worker itself (verbatim GramJS in both apps) is not what is compared.

### Scenarios

| id                | Scenario                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| `boot`            | cold start until `#Main` (informational: works before the chat list exists, ours renders a stub there)               |
| `cold-start`      | 1. navigation to the first chat row (1200 chats, 4 folders), plus 1.5 s                                              |
| `newmsg-burst`    | 2a. 20 new messages in chats 9-28, delivered in one task; every chat moves to the top                                |
| `newmsg-seq`      | 2b. the same 20, one per task, 100 ms apart                                                                          |
| `storm`           | 3. typing indicators and online/offline flips, 100 updates per second for 3 s                                        |
| `scroll`          | 4. scroll the 1200-chat list from the top to the bottom, 120 px per frame                                            |
| `folders`         | 5. switch chat folders x10                                                                                           |
| `heavy-animation` | 6. a folder slide (blocking animation) starts, 20 new messages arrive during it; the **longest task after it ended** |

Scenario 6 is the frameact heavy-animation gating claim (updates held during a blocking animation, applied after it);
the spec criterion is "not worse than teact's pass over the same volume" (`postReleaseMaxTaskMs`).

### The mock data and the hooks

- The large scenario (`perfcmp-large`: 1200 chats, users / groups / channels, unread badges, 4 folders) is **generated**
  by `tests/perfcmp/scenario.ts` (seeded, so identical) and written into each tree only for the duration of its build; ours
  is restored afterwards (`git status` stays clean, a crash is repaired by the next run). It is not committed, so
  `tests/visual/mocks.spec.ts` never sees it.
- The tt copy gets the hook through `scripts/visual/tt-patches.mjs` (expose `getActions` in a mocked build); our
  `src/global/index.ts` has the same line (`DEBUG || IS_MOCKED_CLIENT`).
- tt's MockClient has two defects that tt-run already patched for the visual gate (`start()` ignoring `onConnected`; the bare
  array for `GetDialogFilters`, which hid the folder tabs). Ours is a verbatim port, so the harness applies the same
  `shared` patches to our tree for the build only, and skips a patch whose text is already gone, i.e. it does nothing once
  the port fixed the mock natively. Port those two fixes into `src/lib/gramjs/client/MockClient.ts` with the chat list.

### What the ported app must provide

A scenario is "n/a" for an app that lacks what it needs; a preflight loads each app once and checks. Nothing to configure:
the comparison starts working as soon as the markup contracts of tt exist in our port (they are tt's own class names):

| Need       | Checked as                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------ |
| `shell`    | `#Main` rendered                                                                           |
| `chatList` | `.chat-list .ListItem` rows rendered from the mocked dialogs                               |
| `folders`  | at least two `.ChatFolders .TabList > [data-file-hover-open]` tabs (click = switch folder) |
| `inject`   | `window.getActions().apiUpdate` exposed                                                    |

Folder switches also rely on tt's `Transition` classes: a slide is "running" while `.ChatFolders .Transition_slide-from` or
`-to` exists (`src/lib/kit/Transition` has the same contract). After the chat list lands: `pnpm perf:compare --scenario
cold-start,newmsg-burst,newmsg-seq,storm,scroll,folders,heavy-animation`.

### Validating the method: A/A

`pnpm perf:compare --aa` runs tt against tt (the same build behind both labels). Ratios must be about 1.0; how far they
stray is the resolution of every dd-vs-tt number from the same machine. The report prints the spread. Read a dd-vs-tt
ratio as a difference only when it is clearly outside that spread, and repeat a result that looks off (the machine
load average is in the report; other work on the machine is the main source of noise).

### Results so far (2026-10-14, Apple M1 Pro, 5 runs, CPU x4)

Committed reports: `tests/perfcmp/results/aa-20261014-1723.md` (A/A) and `dd-vs-tt-20261014-1729.md`. The machine was busy
with other work the whole time (1-min load average 6 to 35, median 12-18 on 10 cores), so these are noisy numbers.

**A/A (tt vs tt).** Over 100 comparable metrics |ratio - 1| has median 3%, p90 22% and max 213% (a 20 ms blocking-time
total against 60 ms); over the 78 metrics well above their resolution floor median 2%, p90 14%, max 56%. Run-to-run spread
of one side (relative MAD): median 4%, p90 17%. In practice: a ratio is meaningful from about +-15% for the large
metrics (script, style, paint, mutations, heap are within a few percent), and the small tail metrics (blocking time of
a scenario with one or two long tasks, frames dropped, the longest task after the release) can swing by a factor of two
between two identical apps; take more runs (`--runs 9`) and a quiet machine before judging those.

**telegram-tt, medians** (dd is "n/a" for everything but `boot` until the chat list is ported):

| Scenario       | long tasks (count / max ms) | blocking ms | script ms | style / layout / paint ms | dropped frames | DOM mutations | heap MB |
| -------------- | --------------------------- | ----------: | --------: | ------------------------- | -------------: | ------------: | ------: |
| cold start     | 7 / 296                     |         582 |      1106 | 110 / 85 / 86             |             67 |           553 |    14.6 |
| 2a burst of 20 | 2 / 172                     |         127 |       283 | 52 / 12 / 74              |             12 |           511 |    14.9 |
| 2b one by one  | 0 / 0 (longest task 42 ms)  |           0 |       653 | 147 / 43 / 272            |              6 |          1227 |    15.2 |
| 3 storm        | 0 / 0 (longest task 10 ms)  |           0 |      1171 | 110 / 8 / 180             |              0 |            68 |    19.3 |
| 4 scroll       | 20 / 121                    |         265 |      2405 | 414 / 261 / 532           |             84 |          3848 |    18.7 |
| 5 folders x10  | 4 / 72                      |          35 |       489 | 190 / 52 / 224            |              9 |           673 |    23.4 |
| 6 heavy-anim.  | 1 / 71                      |          21 |       382 | 51 / 11 / 72              |              6 |           735 |    17.2 |

Scenario 6: the longest task after the animation ended is 46 ms in tt (teact holds the global updates during the
animation and applies the 20 messages when it ends).

**telegram-dd, today** (stub `Main`, `boot` only, informational because it renders far less than tt's shell): 0.84x script,
0.71x long tasks, 0.44x DOM mutations, 0.75x heap. This says nothing about the architecture yet; the real answer is the
rerun of every scenario after the chat list lands.
