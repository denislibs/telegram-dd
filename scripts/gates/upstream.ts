// Gate 1b: ported files whose telegram-tt counterpart changed upstream since the recorded base commit.
//
//   pnpm gates:upstream                # base (NOTICE.md) .. HEAD of the reference clone
//   pnpm gates:upstream --remote       # base .. upstream master, fetched (without file contents) into .cache/gates
//   pnpm gates:upstream --strict       # exit 1 when any ported file drifted (default: report only, exit 0)
//
// This is a report, not a blocker: upstream moves on its own schedule. Bump the baseline with the procedure in
// docs/porting-guide.md (7.4) once the listed files are synced.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  c,
  CACHE_DIR,
  finish,
  git,
  heading,
  parseArgs,
  readBaseCommit,
  requireReference,
  ROOT,
  table,
} from './lib/common.ts';
import { mapPorted } from './lib/ported.ts';

type Change = { status: string; path: string; oldPath?: string; added: number; deleted: number };

const args = parseArgs(process.argv.slice(2), ['branch', 'top']);
const top = Number(args.values.get('top') ?? 40);
const base = readBaseCommit();
const reference = requireReference();

let repo = reference;
let head = git(reference, ['rev-parse', 'HEAD']).trim();
let headLabel = 'reference HEAD';
if (args.flags.has('remote')) {
  const branch = args.values.get('branch') ?? 'master';
  repo = join(CACHE_DIR, 'tt-upstream.git');
  if (!existsSync(repo)) {
    mkdirSync(repo, { recursive: true });
    git(repo, ['init', '--bare', '--quiet']);
  }
  console.log(c.dim(`fetching ${branch} of Ajaxy/telegram-tt (history and trees only)…`));
  git(repo, [
    'fetch',
    '--quiet',
    '--no-tags',
    '--filter=blob:none',
    'https://github.com/Ajaxy/telegram-tt.git',
    `+${branch}:refs/heads/upstream`,
  ]);
  head = git(repo, ['rev-parse', 'refs/heads/upstream']).trim();
  headLabel = `upstream ${branch}`;
}

console.log(c.bold('gates:upstream'));
console.log(`base: ${base.slice(0, 7)} (NOTICE.md)   head: ${head.slice(0, 7)} (${headLabel})`);

if (!git(repo, ['cat-file', '-t', base], { allowFail: true }).trim()) {
  console.log(
    c.red(`\nThe base commit ${base.slice(0, 7)} is not in ${repo}.`) +
      '\nThe reference clone is shallow: run `git -C reference/telegram-tt fetch --unshallow`, or use --remote.',
  );
  process.exit(2);
}
if (head === base) {
  console.log(
    `\nNo upstream changes: ${headLabel} is the base commit.` +
      (repo === reference
        ? c.dim('\nUse --remote to compare with the current upstream master without touching the reference clone.')
        : ''),
  );
  finish('gates:upstream', 0);
}

// Ported files are matched against the tree at the base commit, so renames and deletions upstream are still found.
const baseTree = new Set(git(repo, ['ls-tree', '-r', '--name-only', '-z', base]).split('\0'));
const { ported } = mapPorted(reference, (refPath) => baseTree.has(refPath));
const byRefPath = new Map([...ported].map(([ours, ref]) => [ref, ours]));

const numstat = new Map<string, [number, number]>();
for (const line of git(repo, ['diff', '--numstat', '--no-renames', base, head]).split('\n')) {
  const [added, deleted, ...path] = line.split('\t');
  if (path.length) {
    numstat.set(path.join('\t'), [Number(added) || 0, Number(deleted) || 0]);
  }
}
const tokens = git(repo, ['diff', '--name-status', '-z', '-M', base, head]).split('\0').filter(Boolean);
const changes: Change[] = [];
for (let i = 0; i < tokens.length;) {
  const status = tokens[i++];
  const oldPath = status[0] === 'R' || status[0] === 'C' ? tokens[i++] : undefined;
  const path = tokens[i++];
  const [added, deleted] = numstat.get(oldPath ?? path) ?? [0, 0];
  changes.push({ status: status[0], path, oldPath, added, deleted });
}

const drifted: (Change & { ours: string })[] = [];
let synced = 0;
for (const change of changes) {
  const ours = byRefPath.get(change.oldPath ?? change.path);
  if (!ours) {
    continue;
  }
  if (change.status === 'M' && repo === reference) {
    const upstream = git(repo, ['show', `${head}:${change.path}`], { allowFail: true });
    if (upstream && upstream === readFileSync(join(ROOT, ours), 'utf8')) {
      synced++;
      continue;
    }
  }
  drifted.push({ ...change, ours });
}
const newUpstream = changes.filter((change) => change.status === 'A' && !byRefPath.has(change.path)).length;

console.log(
  `\nupstream changed ${changes.length} files since the base: ${drifted.length} ported here` +
    (synced ? ` (+${synced} already identical to upstream)` : '') +
    `, ${newUpstream} new upstream (not ported yet)`,
);

if (drifted.length) {
  const label: Record<string, string> = { M: 'modified', D: 'DELETED', R: 'RENAMED', C: 'copied', T: 'type' };
  heading(`Ported files changed upstream (top ${Math.min(top, drifted.length)} by churn)`);
  const rows = [['+/-', 'upstream', 'file']];
  for (const d of [...drifted].sort((x, y) => y.added + y.deleted - (x.added + x.deleted)).slice(0, top)) {
    rows.push([`+${d.added}/-${d.deleted}`, label[d.status] ?? d.status, d.ours + (d.oldPath ? ` -> ${d.path}` : '')]);
  }
  console.log(table(rows, ['r', 'l', 'l']));
  const where = repo === reference ? 'reference/telegram-tt' : repo;
  console.log(
    c.dim(
      `\nInspect: git -C ${where} diff ${base.slice(0, 7)} ${head.slice(0, 7)} -- <path>` +
        '\nthen `port(<area>): sync with tt@<sha>`, and bump the baseline (docs/porting-guide.md 7.4).',
    ),
  );
}

if (args.flags.has('strict')) {
  finish('gates:upstream', drifted.length ? 1 : 0);
}
const verdict = drifted.length ? c.yellow('DRIFT') : c.green('OK');
console.log(`\n${verdict} gates:upstream ${c.dim('(report only; --strict fails on drift)')}`);
