// Gate 2: telegram-tt's unit tests travel with the code they test.
//
//   pnpm gates:tests            # fail when a ported subject has no copy of its tt test
//   pnpm gates:tests --list     # show every tt test and its status
//
// A tt test file is `*.test.*` / `*.spec.*` or anything under `__tests__/`. Its subject is the same-named file next to it
// (case-insensitive: `helpers.test.ts` -> `Helpers.ts`), or, when there is none, the files it imports with relative
// paths. A test is DUE once its subject is ported (all imports ported, when it has no same-named subject); a due test
// must exist at the same path in src/, or be listed with a reason in scripts/gates/tests-skip.json.
import { readFileSync } from 'node:fs';
import { basename, dirname, join, posix } from 'node:path';

import {
  c,
  finish,
  GATES_DIR,
  git,
  heading,
  isFile,
  parseArgs,
  readJson,
  requireReference,
  ROOT,
  table,
} from './lib/common.ts';
import { mapPorted } from './lib/ported.ts';

const TEST_FILE = /(?:\.(?:test|spec)\.(?:[cm]?[jt]sx?)$)|(?:(?:^|\/)__tests__\/.+\.[cm]?[jt]sx?$)/;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const RESOLVE_SUFFIXES = ['', ...SOURCE_EXTENSIONS, ...SOURCE_EXTENSIONS.map((ext) => `/index${ext}`)];

type Status = 'copied' | 'waiting' | 'skipped' | 'missing';
type Row = { test: string; status: Status; subjects: string[]; note: string };

const args = parseArgs(process.argv.slice(2));
const reference = requireReference();
const skip = readJson<{ tests: Record<string, string> }>(join(GATES_DIR, 'tests-skip.json'), { tests: {} }).tests;
const { ported } = mapPorted(reference);
const portedRefPaths = new Set(ported.values());
const ourPathOf = new Map([...ported].map(([ours, ref]) => [ref, ours]));

const refFiles = git(reference, ['ls-files', '-z', '--', 'src']).split('\0').filter(Boolean);
const refFileSet = new Set(refFiles);
const lowerIndex = new Map(refFiles.map((file) => [file.toLowerCase(), file]));
const tests = refFiles.filter((file) => TEST_FILE.test(file));

function resolveRelative(fromFile: string, specifier: string): string | undefined {
  const target = posix.normalize(posix.join(dirname(fromFile), specifier));
  return RESOLVE_SUFFIXES.map((suffix) => target + suffix).find((candidate) => refFileSet.has(candidate));
}

function findSubjects(test: string): { primary?: string; imports: string[] } {
  const dir = dirname(test).replace(/\/__tests__$/, '');
  const stem = basename(test)
    .replace(/\.(?:test|spec)(?=\.[^.]+$)/, '')
    .replace(/\.[^.]+$/, '');
  const primary = SOURCE_EXTENSIONS.map((ext) => lowerIndex.get(posix.join(dir, `${stem}${ext}`).toLowerCase())).find(
    Boolean,
  );
  const source = readFileSync(join(reference, test), 'utf8');
  const imports = new Set<string>();
  for (const match of source.matchAll(/(?:from|import|mock|require)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const resolved = resolveRelative(test, match[1]);
    if (resolved && resolved !== test && !TEST_FILE.test(resolved)) {
      imports.add(resolved);
    }
  }
  return { primary, imports: [...imports].sort() };
}

const short = (files: string[]) =>
  files.length > 3 ? `${files.slice(0, 3).join(', ')} (+${files.length - 3} more)` : files.join(', ');

const rows: Row[] = [];
const failures: string[] = [];
for (const test of tests) {
  const { primary, imports } = findSubjects(test);
  const subjects = primary ? [primary] : imports;
  const due = primary
    ? portedRefPaths.has(primary)
    : imports.length > 0 && imports.every((file) => portedRefPaths.has(file));
  if (skip[test] !== undefined) {
    if (!skip[test].trim()) {
      failures.push(`tests-skip.json: "${test}" has no reason`);
    }
    rows.push({ test, status: 'skipped', subjects, note: skip[test] });
  } else if (!due) {
    const unported = subjects.filter((file) => !portedRefPaths.has(file));
    const note = subjects.length ? `not ported: ${short(unported)}` : 'no subject found';
    rows.push({ test, status: 'waiting', subjects, note });
  } else if (isFile(join(ROOT, ourPathOf.get(test) ?? test))) {
    rows.push({ test, status: 'copied', subjects, note: '' });
  } else {
    const support = imports.filter((file) => !portedRefPaths.has(file));
    rows.push({ test, status: 'missing', subjects, note: support.length ? `also needs: ${short(support)}` : '' });
    failures.push(
      `${test}: subject ${short(subjects)} is ported but the test is not copied` +
        (support.length ? ` (needs ${short(support)} too)` : ''),
    );
  }
}
for (const test of Object.keys(skip)) {
  if (!tests.includes(test)) {
    failures.push(`tests-skip.json: "${test}" is not a telegram-tt test file`);
  }
}

const count = (status: Status) => rows.filter((row) => row.status === status).length;
console.log(c.bold('gates:tests') + c.dim(`  reference: ${reference}`));
console.log(
  `tt test files: ${rows.length} (${count('copied')} copied, ${count('skipped')} skipped, ` +
    `${count('waiting')} waiting for their subject, ${count('missing')} missing)`,
);
const paint: Record<Status, (s: string) => string> = {
  copied: c.green,
  skipped: c.yellow,
  waiting: c.dim,
  missing: c.red,
};
const shown = args.flags.has('list') ? rows : rows.filter((row) => row.status !== 'copied');
if (shown.length) {
  heading(args.flags.has('list') ? 'All tt tests' : 'Not (yet) copied');
  console.log(table(shown.map((row) => [paint[row.status](row.status.toUpperCase()), row.test, c.dim(row.note)])));
}
if (failures.length) {
  heading('Problems');
  for (const failure of failures) {
    console.log(`  ${c.red('x')} ${failure}`);
  }
  console.log(
    c.dim(
      '\nCopy the test (and its fixtures) to the same path, adapting only imports/setup, so `pnpm test` runs it; if it\n' +
        'cannot run without the teact UI, add it to scripts/gates/tests-skip.json with a reason. See docs/quality-gates.md.',
    ),
  );
}
finish('gates:tests', failures.length);
