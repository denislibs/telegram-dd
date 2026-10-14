# AGENTS.md

A Telegram web client built on **frameact** by porting Telegram Web A
([Ajaxy/telegram-tt](https://github.com/Ajaxy/telegram-tt)) from teact to frameact. Claude Code reads this file through
`CLAUDE.md`.

## Layout

| Path                     | What it is                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/`                   | the app (components, global state, API layer, styles, assets)                                                                                          |
| `src/vendor/frameact/`   | the framework, a git submodule of [denislibs/frameact](https://github.com/denislibs/frameact) consumed from source (pnpm workspace package `frameact`) |
| `reference/telegram-tt/` | a read-only clone of telegram-tt (gitignored): the source we port from                                                                                 |

## Commands

```bash
git submodule update --init      # first checkout: fetch the framework
git clone --depth 1 https://github.com/Ajaxy/telegram-tt.git reference/telegram-tt   # first checkout: the reference
pnpm install
pnpm dev                         # Vite dev server on http://localhost:1234 (stricterdom on)
pnpm check                       # oxlint + prettier --check + tsc + script gates + vite build + bundle budgets
pnpm gates                       # all script gates: diff vs the reference, upstream drift, tt tests, size, licenses
pnpm gates:reference             # clone the reference at the baseline commit (CI, fresh checkouts)
pnpm format                      # prettier --write
pnpm test:e2e | test:a11y | test:perf | test:visual   # browser quality gates (docs/quality-gates.md); first: pnpm playwright:install
pnpm framework:update            # move the submodule to frameact's latest main
pnpm bench:store                 # store compat-layer micro-benchmark (docs/store-architecture.md §4)
```

Toolchain: Vite 8, TypeScript 7 (native `tsc`), oxlint, prettier, pnpm 10, Node >= 22.12.

## Porting rules

- **App-level guide**: [`docs/porting-guide.md`](docs/porting-guide.md) (directory mapping, global state → store,
  app-specific hooks, styles, workers, port order, per-file checklist, upstream tracking). The state layer's design,
  measurements and codemod contract: [`docs/store-architecture.md`](docs/store-architecture.md).
- **Port, don't rewrite.** Take components, styles (SCSS), animations, the custom GramJS (`src/lib/gramjs`), the API
  layer, utilities and dependencies from `reference/telegram-tt` and keep their structure and file names where it makes
  sense, so a diff against the reference stays readable. Change only what teact → frameact requires.
- **teact → frameact**: follow the framework's porting guide, `src/vendor/frameact/docs/guides/porting-from-teact.md`
  (hooks → primitives table, props are getters — never destructure props, two-phase effects, phases, `<ManualFor>` for
  `teactFastList`, store model B instead of `withGlobal`). Framework API for app code:
  `src/vendor/frameact/docs/llms-full.md`.
- **Quality gates**: `pnpm check` also runs the script gates ([`docs/quality-gates.md`](docs/quality-gates.md#script-gates)):
  a ported file may not drift more than 40% (non-import lines) from its telegram-tt counterpart unless it is allowlisted
  with a reason; tt's unit tests are copied with the code they test; bundle sizes stay within `scripts/gates/size-budget.json`;
  production dependencies are GPL-3.0-or-later compatible and `NOTICE.md` lists every vendored `src/lib` entry.
- **Frame phases**: layout reads only in measure / forced-reflow effects or event handlers, DOM writes only in mutate.
  The dev server runs with `enableStrict()`: a stricterdom violation in the console is a bug to fix, not to suppress.
- **Quality gates**: besides `pnpm check`, a ported screen passes the browser gates (strict e2e with zero console /
  stricterdom problems, visual diff vs tt, no leaks, no long tasks, axe): [`docs/quality-gates.md`](docs/quality-gates.md).
  Every e2e test imports `test` from `tests/e2e/fixtures.ts`.
- **Animations**: use `src/lib/kit` (`Transition`, `ShowTransition`, `InfiniteScroll`, `createScrollAnchor`; it replaces tt's
  `components/ui/{Transition,ShowTransition,InfiniteScroll}.tsx` and `hooks/useShowTransition`, and imports only frameact's public API) with tt's
  class contracts and stylesheets; blocking animations go through heavy-animation scopes.

## Frameact API boundary

App code imports only frameact's public entries (`frameact`, `frameact/dom`, `frameact/scheduler`, `frameact/store`,
`frameact/stricterdom`); never deep-import `src/vendor/frameact/src/...`. DOM natives for content-derived nodes come from
`src/util/dom/natives.ts` (the app's own helper). If an engine capability is not public, send a frameact PR that exports
it; until it lands keep a marked stand-in with a TODO (see `src/lib/kit/shape.ts`).

## Licensing

This app is **GPL-3.0-or-later** (it is derived from telegram-tt). Attribution, the modification notice and the
third-party inventory are in [`NOTICE.md`](NOTICE.md); the app-level porting guide is
[`docs/porting-guide.md`](docs/porting-guide.md).

- **File headers**: a ported file keeps every existing notice verbatim and gets no added header while it keeps its
  telegram-tt path; a file that cannot keep its path gets `// Ported from telegram-tt <path> (GPL-3.0-or-later)` as its
  first line; new original files need no header. Distributing the app means offering its source under the GPL.
- **Never move telegram-tt code into `src/vendor/frameact`.** The framework is MIT. Do not edit files under
  `src/vendor/frameact` in this repo.
- **frameact gets only engine-level things**: reactivity, rendering and the DOM runtime, the scheduler and frame phases,
  the store, stricterdom, and generic primitives tied to phases and animation gating (`onMount`, `previous`,
  heavy-animation scopes). The UI kit (`Transition`, `ShowTransition`, `InfiniteScroll`, scroll anchoring) lives in the
  app, in `src/lib/kit`. Every app/UI component stays in `src/` and is never upstreamed, even if it looks reusable (Button, Modal, Menu, Avatar, Loading, ListItem, Icon, the chat list, the
  message list, the composer).
- When porting shows the framework seems to be missing something, ask: is it an engine concern (phases, reactivity,
  scheduling, DOM runtime, gating)? If yes, write it in the frameact repo clean-room (from behaviour and tests, without
  tt's source; teact-derived engine code comes from the MIT [Ajaxy/teact](https://github.com/Ajaxy/teact), never from
  tt's `src/lib/teact`), send it there as a PR, then bump the submodule. If no, it belongs in the client.

## Conventions

- TypeScript strict, ESM, prettier formatting (single quotes, width 120), oxlint with zero warnings.
- Commits: conventional commits with a scope (`feat(chat-list): …`, `port(gramjs): …`, `fix(composer): …`).
- Never commit `reference/`, secrets or a real `api_id`/`api_hash` (use `.env.local`, gitignored).
