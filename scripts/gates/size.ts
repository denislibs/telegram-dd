// Gate 3: bundle budgets, measured on the production build (`dist/`).
//
//   pnpm build && pnpm gates:size     # compare with scripts/gates/size-budget.json, exit 1 when over
//   pnpm gates:size --build           # run `pnpm build` first
//   pnpm gates:size --update          # rewrite the budget: current sizes + 10% (an explicit, reviewed change)
//   pnpm gates:size --update --headroom 0.05
//
// Budgeted: every entry chunk (scripts and stylesheets referenced from dist/index.html) and every worker chunk,
// each by brotli and gzip size, plus the total of all JS and the total of all CSS. Other (lazy) chunks are only
// reported and counted in the totals. Chunk names are matched without their content hash (`index-Ab12Cd34.js` is
// `assets/index.js`).
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

import { c, finish, GATES_DIR, heading, parseArgs, readJson, ROOT, table } from './lib/common.ts';

type Size = { brotli: number; gzip: number };
type Kind = 'entry' | 'worker' | 'chunk';
type Budgeted = { baseline: Size; budget: Size };
type Budget = {
  headroom: number;
  chunks: Record<string, Budgeted & { kind: Kind }>;
  totals: { js: Budgeted; css: Budgeted };
};
type Measured = Size & { name: string; kind: Kind; ext: 'js' | 'css'; raw: number };

const args = parseArgs(process.argv.slice(2), ['dist', 'headroom']);
const dist = join(ROOT, args.values.get('dist') ?? 'dist');
const budgetPath = join(GATES_DIR, 'size-budget.json');
const headroom = Number(args.values.get('headroom') ?? 0.1);

if (args.flags.has('build')) {
  const build = spawnSync('pnpm', ['build'], { cwd: ROOT, stdio: 'inherit' });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]))
    .sort();
}

let files: string[];
let html: string;
try {
  files = walk(dist).filter((file) => /\.(?:m?js|css)$/.test(file));
  html = readFileSync(join(dist, 'index.html'), 'utf8');
} catch {
  console.error(c.red(`No build output in ${dist}. Run \`pnpm build\` first (or pass --build).`));
  process.exit(2);
}

const stripHash = (file: string) => file.replace(/-[A-Za-z0-9_-]{8}(?=\.[a-z]+$)/, '');
const entryFiles = new Set<string>();
for (const match of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)=["']([^"']+\.(?:m?js|css))["']/g)) {
  entryFiles.add(join(dist, match[1].replace(/^\.?\//, '')));
}

const seen = new Map<string, number>();
const measured: Measured[] = files.map((file) => {
  const content = readFileSync(file);
  const base = stripHash(relative(dist, file));
  const count = (seen.get(base) ?? 0) + 1;
  seen.set(base, count);
  const name = count > 1 ? base.replace(/(\.[a-z]+)$/, `#${count}$1`) : base;
  const kind: Kind = entryFiles.has(file) ? 'entry' : /worker/i.test(name) ? 'worker' : 'chunk';
  const brotliParams = {
    [constants.BROTLI_PARAM_QUALITY]: 11,
    [constants.BROTLI_PARAM_SIZE_HINT]: content.length,
  };
  return {
    name,
    kind,
    ext: file.endsWith('.css') ? 'css' : 'js',
    raw: content.length,
    brotli: brotliCompressSync(content, { params: brotliParams }).length,
    gzip: gzipSync(content, { level: 9 }).length,
  };
});

const sum = (ext: 'js' | 'css'): Size => {
  const own = measured.filter((m) => m.ext === ext);
  return {
    brotli: own.reduce((total, m) => total + m.brotli, 0),
    gzip: own.reduce((total, m) => total + m.gzip, 0),
  };
};
const withHeadroom = (size: Size): Budgeted => ({
  baseline: { brotli: size.brotli, gzip: size.gzip },
  budget: { brotli: Math.ceil(size.brotli * (1 + headroom)), gzip: Math.ceil(size.gzip * (1 + headroom)) },
});

const fmt = (bytes: number) => `${(bytes / 1024).toFixed(2)} KiB`;
const signed = (delta: number) => (delta === 0 ? '±0' : `${delta > 0 ? '+' : '-'}${fmt(Math.abs(delta))}`);

if (args.flags.has('update')) {
  const old = readJson<Budget | undefined>(budgetPath, undefined);
  const next: Budget = {
    headroom,
    chunks: Object.fromEntries(
      measured.filter((m) => m.kind !== 'chunk').map((m) => [m.name, { kind: m.kind, ...withHeadroom(m) }]),
    ),
    totals: { js: withHeadroom(sum('js')), css: withHeadroom(sum('css')) },
  };
  writeFileSync(budgetPath, `${JSON.stringify(next, undefined, 2)}\n`);
  console.log(c.bold('gates:size --update') + c.dim(`  budget = measured + ${Math.round(headroom * 100)}%`));
  const rows = [['', 'brotli budget', 'gzip budget']];
  const entries: [string, Budgeted | undefined, Budgeted][] = [
    ...Object.entries(next.chunks).map(([name, b]): [string, Budgeted | undefined, Budgeted] => [
      name,
      old?.chunks[name],
      b,
    ]),
    ['TOTAL js', old?.totals.js, next.totals.js],
    ['TOTAL css', old?.totals.css, next.totals.css],
  ];
  for (const [name, before, after] of entries) {
    const delta = (key: keyof Size) =>
      before ? ` (${signed(after.budget[key] - before.budget[key])})` : c.dim(' (new)');
    rows.push([name, fmt(after.budget.brotli) + delta('brotli'), fmt(after.budget.gzip) + delta('gzip')]);
  }
  console.log(table(rows, ['l', 'r', 'r']));
  console.log(`\nWrote ${relative(ROOT, budgetPath)}. Review it and commit it with the change that needed the room.`);
  process.exit(0);
}

const budget = readJson<Budget | undefined>(budgetPath, undefined);
if (!budget) {
  console.error(c.red(`${relative(ROOT, budgetPath)} is missing. Create it with \`pnpm gates:size --update\`.`));
  process.exit(2);
}

const failures: string[] = [];
const warnings: string[] = [];
const rows = [['file', 'kind', 'raw', 'brotli', 'budget', 'vs base', 'gzip', 'budget', 'vs base', '']];

function addRow(label: string, kind: string, raw: number | undefined, actual: Size, entry: Budgeted | undefined) {
  let ok = true;
  const cell = (key: keyof Size): string[] => {
    if (!entry) {
      return ['-', '-'];
    }
    if (actual[key] > entry.budget[key]) {
      ok = false;
      const over = signed(actual[key] - entry.budget[key]);
      failures.push(`${label}: ${key} ${fmt(actual[key])} is over the budget ${fmt(entry.budget[key])} (${over})`);
    }
    return [fmt(entry.budget[key]), signed(actual[key] - entry.baseline[key])];
  };
  const [brotliBudget, brotliDelta] = cell('brotli');
  const [gzipBudget, gzipDelta] = cell('gzip');
  rows.push([
    label,
    kind,
    raw === undefined ? '' : fmt(raw),
    fmt(actual.brotli),
    brotliBudget,
    brotliDelta,
    fmt(actual.gzip),
    gzipBudget,
    gzipDelta,
    ok ? '' : c.red('OVER'),
  ]);
}

for (const m of measured) {
  if (m.kind === 'chunk') {
    continue;
  }
  const entry = budget.chunks[m.name];
  if (!entry) {
    failures.push(`${m.name}: new ${m.kind} chunk without a budget (run \`pnpm gates:size --update\` and review it)`);
  }
  addRow(m.name, m.kind, m.raw, m, entry);
}
for (const name of Object.keys(budget.chunks)) {
  if (!measured.some((m) => m.name === name && m.kind !== 'chunk')) {
    warnings.push(`${name} is budgeted but is no longer an entry/worker chunk: drop it with --update`);
  }
}
const jsFiles = measured.filter((m) => m.ext === 'js').length;
const cssFiles = measured.filter((m) => m.ext === 'css').length;
addRow('TOTAL js', `${jsFiles} files`, undefined, sum('js'), budget.totals.js);
addRow('TOTAL css', `${cssFiles} files`, undefined, sum('css'), budget.totals.css);

console.log(
  c.bold('gates:size') +
    c.dim(`  ${relative(ROOT, dist)}/, brotli q11 and gzip -9; "vs base" is the change against the budget baseline`),
);
console.log(table(rows, ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'l']));
const lazy = measured.filter((m) => m.kind === 'chunk');
if (lazy.length) {
  heading(`Other chunks (${lazy.length}, counted in the totals only)`);
  for (const m of [...lazy].sort((x, y) => y.brotli - x.brotli).slice(0, 10)) {
    console.log(`  ${fmt(m.brotli).padStart(11)} brotli  ${m.name}`);
  }
}
for (const warning of warnings) {
  console.log(`${c.yellow('warn')} ${warning}`);
}
if (failures.length) {
  heading('Over budget');
  for (const failure of failures) {
    console.log(`  ${c.red('x')} ${failure}`);
  }
  console.log(
    c.dim(
      '\nShrink the bundle, or raise the budget deliberately with `pnpm gates:size --update` and justify it in the PR.',
    ),
  );
}
finish('gates:size', failures.length);
