// Shared helpers for the script quality gates (see docs/quality-gates.md, "Script gates").
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../../..');
export const GATES_DIR = join(ROOT, 'scripts/gates');
export const CACHE_DIR = join(ROOT, '.cache/gates');

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: number) => (text: string) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
export const c = {
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  cyan: paint(36),
  bold: paint(1),
  dim: paint(2),
};

export type Args = { flags: Set<string>; values: Map<string, string>; rest: string[] };

/** `--flag`, `--key value`, `--key=value`. A `--key` listed in `valueKeys` consumes the next token. */
export function parseArgs(argv: string[], valueKeys: string[] = []): Args {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      rest.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      values.set(arg.slice(2, eq), arg.slice(eq + 1));
    } else if (valueKeys.includes(arg.slice(2))) {
      values.set(arg.slice(2), argv[++i] ?? '');
    } else {
      flags.add(arg.slice(2));
    }
  }
  return { flags, values, rest };
}

export function git(cwd: string, args: string[], options: { allowFail?: boolean } = {}): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (options.allowFail) {
      return '';
    }
    throw error;
  }
}

export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) {
    return fallback;
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/**
 * The telegram-tt reference clone. Order: `$TT_REFERENCE`, `<repo>/reference/telegram-tt`, then the same path in the
 * main worktree (a git worktree of this repo has no `reference/`, because it is gitignored).
 */
export function findReference(): string | undefined {
  const candidates: string[] = [];
  if (process.env.TT_REFERENCE) {
    candidates.push(resolve(process.env.TT_REFERENCE));
  }
  candidates.push(join(ROOT, 'reference/telegram-tt'));
  const common = git(ROOT, ['rev-parse', '--path-format=absolute', '--git-common-dir'], { allowFail: true }).trim();
  if (common) {
    candidates.push(join(dirname(common), 'reference/telegram-tt'));
  }
  return candidates.find((dir) => existsSync(join(dir, 'src')) && existsSync(join(dir, 'package.json')));
}

export function requireReference(): string {
  const dir = findReference();
  if (!dir) {
    console.error(c.red('The telegram-tt reference clone is missing.'));
    console.error('Run `pnpm gates:reference` (clones Ajaxy/telegram-tt at the recorded base commit into');
    console.error('reference/telegram-tt), or point $TT_REFERENCE at an existing clone.');
    process.exit(2);
  }
  return dir;
}

/** The telegram-tt baseline commit recorded in NOTICE.md (`.../commit/<40 hex>`). */
export function readBaseCommit(): string {
  const notice = readFileSync(join(ROOT, 'NOTICE.md'), 'utf8');
  const match = /github\.com\/Ajaxy\/telegram-tt\/commit\/([0-9a-f]{40})/.exec(notice);
  if (!match) {
    throw new Error('NOTICE.md does not record a telegram-tt baseline commit (…/telegram-tt/commit/<sha>)');
  }
  return match[1];
}

/** Files of the app (`src/`, minus the framework submodule), tracked or untracked-but-not-ignored. */
export function listOurFiles(): string[] {
  const out = git(ROOT, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'src', ':!src/vendor']);
  return [...new Set(out.split('\0').filter(Boolean))].filter((file) => existsSync(join(ROOT, file))).sort();
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function looksBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, 8000).includes(0);
}

// eslint-disable-next-line no-control-regex
const stripAnsi = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '');

/** Plain-text table; `align[col] === 'r'` right-aligns a column. ANSI colors do not count towards the width. */
export function table(rows: string[][], align: ('l' | 'r')[] = []): string {
  const widths = rows[0].map((_, col) => Math.max(...rows.map((row) => stripAnsi(row[col] ?? '').length)));
  return rows
    .map((row) =>
      row
        .map((cell, col) => {
          const pad = ' '.repeat(widths[col] - stripAnsi(cell).length);
          return align[col] === 'r' ? pad + cell : cell + pad;
        })
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

export const pct = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;

export function heading(title: string) {
  console.log(`\n${c.bold(title)}`);
}

/** Final verdict line + exit code, shared by every gate. */
export function finish(name: string, failures: number, extra = ''): never {
  const note = extra ? ` ${c.dim(extra)}` : '';
  if (failures === 0) {
    console.log(`\n${c.green('PASS')} ${name}${note}`);
    process.exit(0);
  }
  console.log(`\n${c.red('FAIL')} ${name}: ${failures} problem${failures === 1 ? '' : 's'}${note}`);
  process.exit(1);
}
