// Gate 1: how far each ported file has drifted from its telegram-tt counterpart.
//
//   pnpm gates:diff                  # table of the top offenders, exit 1 above the threshold
//   pnpm gates:diff --top 40         # show more offenders
//   pnpm gates:diff --list-original  # list every file that exists only in src/
//   pnpm gates:diff --json           # machine-readable result
//   pnpm gates:diff --threshold 0.5 --min-lines 20
//
// A file counts as "ported" when the reference has a file at the same path (or the file's first line is
// `// Ported from telegram-tt <path>`). Both sides are prettier-formatted, whitespace and blank lines are ignored, and
// import statements are counted separately, so teact -> frameact import swaps do not dominate the ratio.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  c,
  finish,
  GATES_DIR,
  heading,
  looksBinary,
  parseArgs,
  pct,
  readJson,
  requireReference,
  ROOT,
  table,
} from './lib/common.ts';
import { diffSeq } from './lib/linediff.ts';
import { formatForCompare, normalizeLines } from './lib/normalize.ts';
import { mapPorted, PORTED_FROM } from './lib/ported.ts';

/** A file fails above this share of changed non-import lines ... */
const DEFAULT_THRESHOLD = 0.4;
/** ... but only if it also has at least this many changed lines (tiny files would otherwise fail on 2 lines). */
const DEFAULT_MIN_LINES = 15;

type AllowEntry = { reason: string; maxRatio?: number };
type Allowlist = { files: Record<string, AllowEntry> };

type FileResult = {
  path: string;
  refPath: string;
  kind: 'identical' | 'text' | 'stub' | 'binary-differs';
  /** Non-import, non-blank lines (the larger of the two sides). */
  codeLines: number;
  /** max(deleted, inserted) non-import lines. */
  changed: number;
  ratio: number;
  importDeleted: number;
  importInserted: number;
  truncated: boolean;
};

const args = parseArgs(process.argv.slice(2), ['top', 'threshold', 'min-lines']);
const threshold = Number(args.values.get('threshold') ?? DEFAULT_THRESHOLD);
const minLines = Number(args.values.get('min-lines') ?? DEFAULT_MIN_LINES);
const top = Number(args.values.get('top') ?? 15);
const reference = requireReference();
const allowlist = readJson<Allowlist>(join(GATES_DIR, 'diff-allowlist.json'), { files: {} });

/** A foundation stub (`// FOUNDATION STUB (types only): …` in the first lines) is a placeholder for the real port. */
const STUB_MARKER = /^\/\/.*\bSTUB\b/;
const isStub = (text: string) => text.split('\n', 4).some((line) => STUB_MARKER.test(line));

async function compare(path: string, refPath: string, ours: Buffer, theirs: Buffer): Promise<FileResult> {
  const base = {
    path,
    refPath,
    importDeleted: 0,
    importInserted: 0,
    truncated: false,
    codeLines: 0,
    changed: 0,
    ratio: 0,
  };
  if (ours.equals(theirs)) {
    return { ...base, kind: 'identical' };
  }
  if (looksBinary(ours) || looksBinary(theirs)) {
    return { ...base, kind: 'binary-differs' };
  }
  if (isStub(ours.toString('utf8'))) {
    return { ...base, kind: 'stub' };
  }
  const [oursText, theirsText] = await Promise.all([
    formatForCompare(ours.toString('utf8'), path),
    formatForCompare(theirs.toString('utf8'), refPath),
  ]);
  const a = normalizeLines(theirsText, refPath);
  const b = normalizeLines(oursText, path).filter((line, index) => !(index === 0 && PORTED_FROM.test(line.text)));
  const { deleted, inserted, truncated } = diffSeq(
    a.map((line) => line.text),
    b.map((line) => line.text),
  );
  const codeDeleted = deleted.filter((i) => !a[i].isImport).length;
  const codeInserted = inserted.filter((i) => !b[i].isImport).length;
  const codeLines = Math.max(a.filter((l) => !l.isImport).length, b.filter((l) => !l.isImport).length, 1);
  const changed = Math.max(codeDeleted, codeInserted);
  return {
    ...base,
    kind: deleted.length + inserted.length === 0 ? 'identical' : 'text',
    codeLines,
    changed,
    ratio: changed / codeLines,
    importDeleted: deleted.length - codeDeleted,
    importInserted: inserted.length - codeInserted,
    truncated,
  };
}

const results: FileResult[] = [];
const { ported, originalOnly } = mapPorted(reference);
for (const [path, refPath] of ported) {
  results.push(await compare(path, refPath, readFileSync(join(ROOT, path)), readFileSync(join(reference, refPath))));
}

const failures: string[] = [];
const over: FileResult[] = [];
const allowed: FileResult[] = [];
const staleAllow: string[] = [];
const byPath = new Map(results.map((r) => [r.path, r]));

for (const [path, entry] of Object.entries(allowlist.files)) {
  if (!entry.reason?.trim()) {
    failures.push(`diff-allowlist.json: "${path}" has no reason`);
  }
  if (!byPath.has(path)) {
    failures.push(`diff-allowlist.json: "${path}" is not a ported file (typo, or deleted?)`);
  }
}
for (const r of results) {
  const entry = allowlist.files[r.path];
  if (r.kind !== 'text' || r.ratio <= threshold || r.changed < minLines) {
    if (entry) {
      staleAllow.push(r.path);
    }
  } else if (!entry) {
    over.push(r);
    failures.push(`${r.path}: ${pct(r.ratio)} of non-import lines changed (${r.changed}), over ${pct(threshold)}`);
  } else if (entry.maxRatio !== undefined && r.ratio > entry.maxRatio) {
    over.push(r);
    failures.push(`${r.path}: ${pct(r.ratio)} exceeds its allowlisted cap of ${pct(entry.maxRatio)}`);
  } else {
    allowed.push(r);
  }
}

if (args.flags.has('json')) {
  console.log(JSON.stringify({ threshold, minLines, results, originalOnly, failures }, undefined, 2));
  process.exit(failures.length ? 1 : 0);
}

const identical = results.filter((r) => r.kind === 'identical').length;
const text = results.filter((r) => r.kind === 'text');
const binary = results.filter((r) => r.kind === 'binary-differs');
const stubs = results.filter((r) => r.kind === 'stub');
const sumCode = text.reduce((sum, r) => sum + r.codeLines, 0);
const sumChanged = text.reduce((sum, r) => sum + r.changed, 0);
const importOnly = text.filter((r) => r.changed === 0).length;

console.log(c.bold('gates:diff') + c.dim(`  reference: ${reference}`));
console.log(
  `ported files: ${results.length} (${identical} identical, ${importOnly} import-only changes, ` +
    `${text.length - importOnly} with code changes, ${stubs.length} foundation stubs, ${binary.length} binary differ), ` +
    `original files: ${originalOnly.length}`,
);
console.log(
  `changed code lines across modified ported files: ${sumChanged} of ${sumCode} (${pct(sumCode ? sumChanged / sumCode : 0)})`,
);
console.log(`threshold: > ${pct(threshold)} changed non-import lines and >= ${minLines} changed lines`);

const offenders = text.filter((r) => r.changed > 0).sort((x, y) => y.ratio - x.ratio || y.changed - x.changed);
heading(`Top ${Math.min(top, offenders.length)} by changed non-import lines`);
if (offenders.length) {
  const rows = [['ratio', 'changed', 'of', 'imports -/+', 'status', 'file']];
  for (const r of offenders.slice(0, top)) {
    const status = over.includes(r) ? c.red('OVER') : allowed.includes(r) ? c.yellow('allowed') : c.dim('ok');
    const note =
      (r.path !== r.refPath ? c.dim(` (tt: ${r.refPath})`) : '') + (r.truncated ? c.dim(' [diff capped]') : '');
    rows.push([
      pct(r.ratio),
      String(r.changed),
      String(r.codeLines),
      `${r.importDeleted}/${r.importInserted}`,
      status,
      r.path + note,
    ]);
  }
  console.log(table(rows, ['r', 'r', 'r', 'r', 'l', 'l']));
} else {
  console.log('none');
}

if (stubs.length) {
  heading(`Foundation stubs (${stubs.length}, informational: placeholders to replace with the real port)`);
  for (const r of stubs) {
    console.log(`  ${r.path}`);
  }
}
if (binary.length) {
  heading(`Binary files that differ from the reference (${binary.length}, informational)`);
  for (const r of binary.slice(0, 20)) {
    console.log(`  ${r.path}`);
  }
}
if (allowed.length) {
  heading(`Allowlisted over-threshold files (${allowed.length})`);
  for (const r of allowed) {
    console.log(`  ${pct(r.ratio).padStart(6)}  ${r.path}  ${c.dim(allowlist.files[r.path].reason)}`);
  }
}
if (staleAllow.length) {
  heading('Stale allowlist entries (now under the threshold: remove them)');
  for (const path of staleAllow) {
    console.log(`  ${c.yellow(path)}`);
  }
}

heading(`Original files, only in src/ (${originalOnly.length}, informational)`);
if (args.flags.has('list-original')) {
  for (const path of originalOnly) {
    console.log(`  ${path}`);
  }
} else {
  const dirs = new Map<string, number>();
  for (const path of originalOnly) {
    const dir = path.split('/').slice(0, 3).join('/');
    dirs.set(dir, (dirs.get(dir) ?? 0) + 1);
  }
  for (const [dir, count] of [...dirs].sort((x, y) => y[1] - x[1])) {
    console.log(`  ${String(count).padStart(4)}  ${dir}`);
  }
  console.log(c.dim('  (--list-original for every file)'));
}

if (failures.length) {
  heading('Problems');
  for (const failure of failures) {
    console.log(`  ${c.red('x')} ${failure}`);
  }
  console.log(
    c.dim(
      '\nPort, do not rewrite: reduce the diff, or (if the change is required by teact -> frameact) add the file to\n' +
        'scripts/gates/diff-allowlist.json with a reason (optionally a maxRatio cap). See docs/quality-gates.md.',
    ),
  );
}
finish('gates:diff', failures.length);
