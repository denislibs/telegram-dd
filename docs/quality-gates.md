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
