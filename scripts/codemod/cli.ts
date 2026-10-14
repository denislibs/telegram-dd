// pnpm codemod <files|globs> [--dry] [--report] [--json] [--out <dir>] [--only a,b] [--skip a,b]
// pnpm codemod --sweep [--report] : every tt component/hook into .cache/codemod/out + .cache/codemod/report.json
//
// A path that exists in the repo is rewritten in place; a path that only exists in the telegram-tt reference (or an
// absolute path into it) is read from there and written to the same path under src/ (the "import, then adapt" step of
// the per-file checklist) unless --dry / --out says otherwise. See docs/codemod.md.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { globSync } from 'tinyglobby';

import type { FileReport } from './context.ts';

import { c, findReference, parseArgs, ROOT } from '../gates/lib/common.ts';
import { RULES } from './rules/index.ts';
import { transformSource } from './transform.ts';

const SWEEP_OUT = join(ROOT, '.cache/codemod/out');
const SWEEP_REPORT = join(ROOT, '.cache/codemod/report.json');
const SWEEP_GLOBS = ['src/components/**/*.tsx', 'src/hooks/**/*.ts', 'src/hooks/**/*.tsx'];
const SWEEP_IGNORE = ['src/components/test/**', 'src/hooks/tauri/**', '**/*.test.*'];

interface Input {
  /** Path relative to the repo / reference root (`src/components/ui/Button.tsx`). */
  rel: string;
  /** Absolute source path. */
  from: string;
  fromReference: boolean;
}

function usage(): never {
  console.log(`Usage: pnpm codemod <files|globs> [--dry] [--report] [--json] [--out <dir>] [--only r1,r2] [--skip r1,r2]
       pnpm codemod --sweep [--report] [--json]

Rules (in order): ${RULES.map((rule) => rule.name).join(', ')}`);
  process.exit(1);
}

function resolveInputs(patterns: string[], reference: string | undefined): Input[] {
  const inputs = new Map<string, Input>();
  const add = (rel: string, from: string, fromReference: boolean) => {
    const key = rel.split('\\').join('/');
    if (!inputs.has(key)) inputs.set(key, { rel: key, from, fromReference });
  };
  for (const pattern of patterns) {
    if (isAbsolute(pattern)) {
      if (reference && pattern.startsWith(reference)) {
        for (const file of expand(pattern, reference)) add(relative(reference, file), file, true);
      } else {
        for (const file of expand(pattern, ROOT)) add(relative(ROOT, file), file, false);
      }
      continue;
    }
    const ours = expand(pattern, ROOT);
    if (ours.length) {
      for (const file of ours) add(relative(ROOT, file), file, false);
      continue;
    }
    if (reference) {
      const theirs = expand(pattern, reference);
      for (const file of theirs) add(relative(reference, file), file, true);
      if (theirs.length) continue;
    }
    console.error(c.yellow(`no file matches ${pattern}`));
  }
  return [...inputs.values()];
}

function expand(pattern: string, cwd: string): string[] {
  const direct = isAbsolute(pattern) ? pattern : join(cwd, pattern);
  if (existsSync(direct) && statSync(direct).isFile()) return [direct];
  const globPattern = isAbsolute(pattern) ? relative(cwd, pattern) : pattern;
  return globSync(globPattern, { cwd, absolute: true, ignore: ['**/node_modules/**'] }).sort();
}

export interface Summary {
  files: number;
  clean: number;
  errors: number;
  hits: Record<string, number>;
  todos: Record<string, { count: number; files: number; example: string }>;
  byDir: Record<string, { files: number; clean: number }>;
}

export function summarize(reports: FileReport[]): Summary {
  const summary: Summary = { files: reports.length, clean: 0, errors: 0, hits: {}, todos: {}, byDir: {} };
  for (const report of reports) {
    const parts = report.file.split('/');
    const dir = parts[1] === 'hooks' ? 'src/hooks' : parts.slice(0, 3).join('/');
    const d = (summary.byDir[dir] ??= { files: 0, clean: 0 });
    d.files++;
    if (report.error) summary.errors++;
    else if (report.todos.length === 0) {
      summary.clean++;
      d.clean++;
    }
    for (const [key, count] of Object.entries(report.hits)) summary.hits[key] = (summary.hits[key] ?? 0) + count;
    const kinds = new Set<string>();
    for (const todo of report.todos) {
      const entry = (summary.todos[todo.kind] ??= {
        count: 0,
        files: 0,
        example: `${report.file}:${todo.line} ${todo.message}`,
      });
      entry.count++;
      kinds.add(todo.kind);
    }
    for (const kind of kinds) summary.todos[kind].files++;
  }
  return summary;
}

function printSummary(summary: Summary): void {
  const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : '-');
  console.log(
    c.bold(
      `\n${summary.files} files, ${summary.clean} fully transformed (${pct(summary.clean, summary.files)}), ${summary.errors} errors`,
    ),
  );
  console.log(c.bold('\nBy directory'));
  for (const [dir, d] of Object.entries(summary.byDir).sort()) {
    console.log(
      `  ${dir.padEnd(28)} ${String(d.clean).padStart(4)}/${String(d.files).padEnd(4)} ${pct(d.clean, d.files)}`,
    );
  }
  console.log(c.bold('\nTransform hits'));
  for (const [key, count] of Object.entries(summary.hits)
    .filter(([k]) => !k.startsWith('todo:'))
    .sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key.padEnd(28)} ${count}`);
  }
  console.log(c.bold('\nRemaining TODO(codemod) by kind (count / files)'));
  for (const [kind, entry] of Object.entries(summary.todos).sort((a, b) => b[1].count - a[1].count)) {
    console.log(
      `  ${kind.padEnd(28)} ${String(entry.count).padStart(5)} / ${String(entry.files).padStart(4)}   ${c.dim(entry.example.slice(0, 110))}`,
    );
  }
}

function printFileReport(report: FileReport, verbose: boolean): void {
  const status = report.error
    ? c.red('ERROR')
    : report.todos.length
      ? c.yellow(`${report.todos.length} TODO`)
      : c.green('clean');
  const hits = Object.entries(report.hits)
    .filter(([k]) => !k.startsWith('todo:'))
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  console.log(`${status.padEnd(16)} ${report.file}  ${c.dim(hits)}`);
  if (report.error) console.log(c.red(`  ${report.error}`));
  if (verbose) for (const todo of report.todos) console.log(c.yellow(`  L${todo.line} [${todo.kind}] ${todo.message}`));
}

function main(): void {
  const args = parseArgs(process.argv.slice(2), ['out', 'only', 'skip', 'reference']);
  const reference = args.values.get('reference') ? resolve(args.values.get('reference')!) : findReference();
  const sweep = args.flags.has('sweep');
  const dry = args.flags.has('dry');
  const json = args.flags.has('json');
  const wantReport = args.flags.has('report') || sweep || dry;
  const only = args.values.get('only')?.split(',').filter(Boolean);
  const skip = args.values.get('skip')?.split(',').filter(Boolean);
  let out = args.values.get('out') ? resolve(args.values.get('out')!) : undefined;

  let inputs: Input[];
  if (sweep) {
    if (!reference) {
      console.error(c.red('--sweep needs the telegram-tt reference (reference/telegram-tt or $TT_REFERENCE)'));
      process.exit(1);
    }
    out ??= SWEEP_OUT;
    const files = globSync(SWEEP_GLOBS, { cwd: reference, absolute: true, ignore: SWEEP_IGNORE }).sort();
    inputs = files.map((file) => ({ rel: relative(reference, file), from: file, fromReference: true }));
  } else {
    if (!args.rest.length) usage();
    inputs = resolveInputs(args.rest, reference);
    if (!inputs.length) process.exit(1);
  }

  const reports: FileReport[] = [];
  const started = Date.now();
  for (const input of inputs) {
    const code = readFileSync(input.from, 'utf8');
    const { code: output, report } = transformSource(code, { filePath: input.rel, only, skip });
    reports.push(report);
    if (!dry) {
      const target = out ? join(out, input.rel) : join(ROOT, input.rel);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, output);
    } else if (!sweep && !json && inputs.length === 1) {
      process.stdout.write(output);
      console.log(c.dim('-'.repeat(80)));
    }
    if (!sweep && !json) printFileReport(report, wantReport);
  }

  const summary = summarize(reports);
  if (json) {
    console.log(JSON.stringify(sweep ? { summary, reports } : reports, undefined, 2));
  } else if (sweep || inputs.length > 1) {
    printSummary(summary);
    console.log(c.dim(`\n${Date.now() - started} ms`));
  }
  if (sweep) {
    mkdirSync(dirname(SWEEP_REPORT), { recursive: true });
    writeFileSync(SWEEP_REPORT, JSON.stringify({ summary, reports }, undefined, 2));
    console.log(c.dim(`output: ${relative(ROOT, out!)}/, report: ${relative(ROOT, SWEEP_REPORT)}`));
  }
}

main();
