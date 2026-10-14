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

Other (lazy) chunks are listed and counted in the totals only. `scripts/gates/size-budget.json` holds, per item, the
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
`playwright.visual.config.ts` (our dev server + the tt copy on :1235, one worker). Ports and the build environment are in
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

### 3. Leak check

`tests/perf/leaks.ts`: `expectNoLeak(page, action, { runs: 50, maxGrowthKb: 512, warmupRuns: 5 })`. It runs `warmupRuns`
unmeasured, forces GC (`HeapProfiler.collectGarbage`, twice), reads `Runtime.getHeapUsage`, runs the action `runs`
times, forces GC and reads again; it fails when the growth exceeds `maxGrowthKb` and returns the numbers. The action
must be a full cycle (open and close a modal, mount and unmount a chat, scroll there and back): a one-way state change
legitimately grows the heap. Main thread only (workers are not measured). Run on the production build. Pick
`maxGrowthKb` as ~2x the growth you see on a clean run (`test.info().annotations` in the example prints it) and keep it
tight: a real leak is proportional to `runs`. `perf.spec.ts` shows the usage and proves detection with a deliberate leak.

### 4. Long tasks

`tests/perf/longTasks.ts`: `expectNoLongTasks(page, action, { maxMs: 50, cpuThrottlingRate: 4 })`. It sets
`Emulation.setCPUThrottlingRate`, collects `PerformanceObserver('longtask')` entries while the action runs and fails
when any task is longer than `maxMs` (the browser reports only tasks above 50 ms, so `maxMs` below 50 equals 50; raise
it to tolerate a known slow spot, never to hide a new one). `startLongTaskCollector` / `collectLongTasks` are exported for
custom flows (a navigation resets the collector). Note: code run through `page.evaluate` is not an event-loop task and
is never a long task; drive the UI (clicks, scrolls, typing) so the app's own handlers and frame phases run.

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

| Gate       | Default                                  | Tighten / loosen                                                  |
| ---------- | ---------------------------------------- | ----------------------------------------------------------------- |
| strict e2e | zero problems                            | `strictOptions.ignore*` per test, with a reason                   |
| visual     | per screen `threshold` (share of pixels) | start honest, ratchet down; `pixelThreshold` for AA noise; `mask` |
| leaks      | 512 KB over 50 runs after 5 warm-up runs | `maxGrowthKb`, `runs`, `warmupRuns`                               |
| long tasks | 50 ms at 4x CPU throttling               | `maxMs` (>= 50), `cpuThrottlingRate`                              |
| a11y       | no violations outside the baseline       | baseline entries with a reason                                    |
