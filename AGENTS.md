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
pnpm check                       # oxlint + prettier --check + tsc + vite build
pnpm format                      # prettier --write
pnpm framework:update            # move the submodule to frameact's latest main
```

Toolchain: Vite 8, TypeScript 7 (native `tsc`), oxlint, prettier, pnpm 10, Node >= 22.12.

## Porting rules

- **Port, don't rewrite.** Take components, styles (SCSS), animations, the custom GramJS (`src/lib/gramjs`), the API
  layer, utilities and dependencies from `reference/telegram-tt` and keep their structure and file names where it makes
  sense, so a diff against the reference stays readable. Change only what teact → frameact requires.
- **teact → frameact**: follow the framework's porting guide, `src/vendor/frameact/docs/guides/porting-from-teact.md`
  (hooks → primitives table, props are getters — never destructure props, two-phase effects, phases, `<ManualFor>` for
  `teactFastList`, store model B instead of `withGlobal`). Framework API for app code:
  `src/vendor/frameact/docs/llms-full.md`.
- **Frame phases**: layout reads only in measure / forced-reflow effects or event handlers, DOM writes only in mutate.
  The dev server runs with `enableStrict()`: a stricterdom violation in the console is a bug to fix, not to suppress.
- **Animations**: use `frameact/kit` (`Transition`, `ShowTransition`, `InfiniteScroll`, `createScrollAnchor`) with tt's
  class contracts and stylesheets; blocking animations go through heavy-animation scopes.

## Licensing

This app is **GPL-3.0-or-later** (it is derived from telegram-tt). Two consequences:

- Code copied or adapted from telegram-tt keeps its copyright notices; distributing the app means distributing its
  source under the GPL.
- **Never move telegram-tt code into `src/vendor/frameact`.** The framework is MIT. If porting shows the framework is
  missing something, write it in the frameact repo clean-room (from behaviour and tests, without tt's source) and send
  it there as a PR, then bump the submodule. Do not edit files under `src/vendor/frameact` in this repo.

## Conventions

- TypeScript strict, ESM, prettier formatting (single quotes, width 120), oxlint with zero warnings.
- Commits: conventional commits with a scope (`feat(chat-list): …`, `port(gramjs): …`, `fix(composer): …`).
- Never commit `reference/`, secrets or a real `api_id`/`api_hash` (use `.env.local`, gitignored).
