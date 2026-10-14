// Slice inventory: the transitive closure of a set of telegram-tt files (components, hooks, styles, assets, libs) that
// are not yet in src/, as a markdown table (docs/reports/slice-auth.md is generated from it).
//
//   pnpm slice:inventory --root 'src/components/auth/**' --root src/components/App.tsx --stop src/components/main/Main.tsx
//        [--out docs/reports/slice-auth.md] [--json]
//
// The walk starts at the roots and follows imports (Babel for .ts/.tsx/.js, regexes for .scss/.css: @use/@import/
// @forward/url()), `import()` calls and the `Bundles.X` -> src/bundles/x.ts edge of `*.async.tsx` wrappers. It does not
// descend into what is already settled: a file that exists in src/ (ported; a FOUNDATION STUB is descended, because the
// real port is still ahead), the teact/fasterdom internals (replaced by frameact), hooks that frameact has a primitive
// for, packages, and the `--stop` files (another slice).
import { parse } from '@babel/parser';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { globSync } from 'tinyglobby';

import { findReference, parseArgs, ROOT } from '../gates/lib/common.ts';

type Resolved =
  | { type: 'file'; path: string }
  | { type: 'package'; name: string }
  | { type: 'ignored'; reason: string }
  | { type: 'unresolved'; spec: string };

type Status =
  | 'already ported'
  | 'stub to replace'
  | 'port verbatim'
  | 'port via codemod'
  | 'replaced by frameact'
  | 'kit adapter'
  | 'deferred (other slice)'
  | 'dependency';

type Entry = {
  path: string;
  kind: string;
  status: Status;
  via: string;
  note: string;
  lines: number;
};

/** Hooks that frameact has a primitive for: the porting guide (§2, "Not ported") deletes them. */
const DELETED_HOOKS = new Set([
  'useLastCallback',
  'usePrevious',
  'usePreviousDeprecated',
  'useCurrentOrPrev',
  'useFrozenProps',
  'usePrevDuringAnimation',
  'useSyncEffect',
  'useSyncEffectWithPrevDeps',
  'useEffectWithPrevDeps',
  'useLayoutEffectWithPrevDeps',
  'useForceUpdate',
  'useStateRef',
  'useSignal',
  'useSignalEffect',
  'useDerivedState',
  'useDerivedSignal',
  'useHeavyAnimation',
  'useMountAfterHeavyAnimation',
  'useModuleLoader',
  'useShowTransition',
  'useShowTransitionDeprecated',
  'useMediaTransition',
  'useMediaTransitionDeprecated',
  'useThrottleForHeavyAnimation',
]);
const KIT_ADAPTERS = new Set([
  'src/components/ui/Transition.tsx',
  'src/components/ui/ShowTransition.tsx',
  'src/components/ui/InfiniteScroll.tsx',
  'src/components/ui/Portal.ts',
]);

const args = parseArgs(process.argv.slice(2), ['root', 'stop', 'out', 'base']);
// `--base <rev>`: judge "already in src/" against that commit instead of the working tree (the report is made from
// the tree before the slice was imported).
const baseRev = args.values.get('base');
const roots = collectMulti('--root');
const stops = new Set(collectMulti('--stop'));
const outFile = args.values.get('out');

function collectMulti(flag: string): string[] {
  const out: string[] = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag) out.push(argv[++i]);
    else if (argv[i].startsWith(`${flag}=`)) out.push(argv[i].slice(flag.length + 1));
  }
  return out;
}

const reference = findReference();
if (!reference) throw new Error('telegram-tt reference not found (see docs/quality-gates.md)');
if (!roots.length) throw new Error('give at least one --root');

const SCRIPT_EXT = ['.ts', '.tsx', '.js', '.jsx', '.json', '.d.ts'];
const isFile = (p: string) => existsSync(p) && statSync(p).isFile();
const refFile = (p: string) => join(reference, p);

function resolveSpec(from: string, spec: string, style: boolean): Resolved {
  const clean = spec.replace(/[?#].*$/, '');
  if (spec.startsWith('sass:')) return { type: 'ignored', reason: 'sass builtin' };
  if (/^(?:data:|https?:|\/\/)/.test(clean)) return { type: 'ignored', reason: 'url' };
  if (clean === '@teact' || clean.startsWith('@teact/')) {
    return { type: 'file', path: `src/lib/teact/${clean.slice(7) || 'teact.ts'}` };
  }
  if (clean.startsWith('@gili/')) return tryFile(`src/components/gili/${clean.slice(6)}`, style);
  if (clean === 'buffer') return { type: 'file', path: 'src/@types/buffer.d.ts' };
  if (!clean.startsWith('.') && !clean.startsWith('/')) {
    // In a stylesheet a bare name is relative to the file first (`@use 'variables'`, `url(font.woff2)`).
    if (style) {
      const local = tryFile(posix.join(posix.dirname(from), clean), true);
      if (local.type === 'file') return local;
    }
    const name = clean.startsWith('@') ? clean.split('/').slice(0, 2).join('/') : clean.split('/')[0];
    // Sass `@use "../x"` is always relative; a bare name there is a package or a load path.
    return { type: 'package', name };
  }
  const base = clean.startsWith('/') ? posix.join('public', clean) : posix.join(posix.dirname(from), clean);
  return tryFile(base, style);
}

function tryFile(base: string, style: boolean): Resolved {
  const dir = posix.dirname(base);
  const name = posix.basename(base);
  const candidates = [base];
  for (const ext of SCRIPT_EXT) candidates.push(base + ext);
  for (const ext of SCRIPT_EXT) candidates.push(posix.join(base, `index${ext}`));
  if (style || /\.s?css$/.test(base) || !posix.extname(base)) {
    candidates.push(`${base}.scss`, `${base}.css`, posix.join(dir, `_${name}.scss`), posix.join(dir, `_${name}`));
    candidates.push(posix.join(base, '_index.scss'), posix.join(base, 'index.scss'));
    if (/\.scss$/.test(base)) candidates.push(posix.join(dir, `_${name}`));
  }
  for (const candidate of candidates) {
    if (isFile(refFile(candidate))) return { type: 'file', path: candidate };
  }
  return { type: 'unresolved', spec: base };
}

function scriptDeps(path: string, source: string): string[] {
  const specs = new Set<string>();
  let ast;
  try {
    ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'], errorRecovery: true });
  } catch {
    return [];
  }
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const n = node as {
      type?: string;
      source?: { value?: string };
      importKind?: string;
      exportKind?: string;
      specifiers?: { importKind?: string }[];
      arguments?: { type: string; value?: string }[];
      callee?: { type: string };
    };
    if (
      (n.type === 'ImportDeclaration' || n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') &&
      n.source?.value
    ) {
      // Type-only imports are not part of the runtime closure (the type-only stubs in src/ already satisfy tsc).
      const typeOnly =
        n.importKind === 'type' ||
        n.exportKind === 'type' ||
        (n.type === 'ImportDeclaration' &&
          Boolean(n.specifiers?.length) &&
          n.specifiers!.every((sp) => sp.importKind === 'type'));
      if (!typeOnly) specs.add(n.source.value);
    }
    if ((n.type === 'CallExpression' || n.type === 'ImportExpression') && n.callee?.type === 'Import') {
      const arg = n.arguments?.[0];
      if (arg?.type === 'StringLiteral' && arg.value) specs.add(arg.value);
    }
    if (n.type === 'ImportExpression') {
      const src = (n as { source?: { type: string; value?: string } }).source;
      if (src?.type === 'StringLiteral' && src.value) specs.add(src.value);
    }
    for (const key of Object.keys(n)) {
      if (key === 'loc' || key === 'extra') continue;
      visit((n as Record<string, unknown>)[key]);
    }
  };
  visit(ast.program.body);
  return [...specs];
}

function styleDeps(source: string): string[] {
  const specs = new Set<string>();
  for (const m of source.matchAll(/@(?:use|forward)\s+['"]([^'"]+)['"]/g)) specs.add(m[1]);
  for (const m of source.matchAll(/@import\s+([^;]+);/g)) {
    for (const q of m[1].matchAll(/['"]([^'"]+)['"]/g)) specs.add(q[1]);
  }
  for (const m of source.matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g)) specs.add(m[1]);
  return [...specs];
}

function kindOf(path: string): string {
  if (/\.async\.tsx$/.test(path)) return 'async wrapper';
  if (/\.module\.s?css$/.test(path)) return 'style (module)';
  if (/\.s?css$/.test(path)) return 'style';
  if (/^src\/components\/.*\.tsx?$/.test(path)) return 'component';
  if (/^src\/hooks\//.test(path)) return 'hook';
  if (/^src\/bundles\//.test(path)) return 'bundle';
  if (/^src\/global\//.test(path)) return 'global';
  if (/^src\/lib\//.test(path)) return 'lib';
  if (/^src\/util\//.test(path)) return 'util';
  if (/^src\/(?:types|@types)\//.test(path)) return 'types';
  if (/^src\/assets\//.test(path) || /\.(?:svg|png|jpe?g|gif|webp|tgs|woff2?|ttf|mp3|mp4|wasm)$/.test(path)) {
    return 'asset';
  }
  if (/^src\/api\//.test(path)) return 'api';
  if (/^src\/config/.test(path)) return 'config';
  if (/\.json$/.test(path)) return 'data';
  return 'other';
}

function usesTeact(source: string): boolean {
  return /from\s+['"][^'"]*(?:lib\/teact|@teact|fasterdom|stricterdom)/.test(source);
}

const entries = new Map<string, Entry>();
const packages = new Map<string, string>();
const unresolved = new Map<string, string>();
const queue: { path: string; via: string }[] = [];

const rootFiles = new Set<string>();
for (const pattern of roots) {
  for (const file of globSync(pattern, { cwd: reference, dot: false })) rootFiles.add(file);
}
for (const file of [...rootFiles].sort()) queue.push({ path: file, via: '(root)' });

const ourPackages = new Set<string>(
  Object.keys({
    ...(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).dependencies ?? {}),
    ...(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).devDependencies ?? {}),
  }),
);

function readOurs(path: string): string | undefined {
  if (baseRev) {
    try {
      return execFileSync('git', ['show', `${baseRev}:${path}`], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      return undefined;
    }
  }
  return isFile(join(ROOT, path)) ? readFileSync(join(ROOT, path), 'utf8') : undefined;
}

function classify(path: string, source: string): { status: Status; descend: boolean; note: string } {
  const base = posix.basename(path).replace(/\.[^.]+$/, '');
  if (stops.has(path)) return { status: 'deferred (other slice)', descend: false, note: 'stops the walk' };
  if (/^src\/lib\/(?:teact|fasterdom)\//.test(path)) {
    return { status: 'replaced by frameact', descend: false, note: 'frameact / frameact/dom / frameact/scheduler' };
  }
  if (KIT_ADAPTERS.has(path)) {
    return { status: 'kit adapter', descend: false, note: "thin adapter over src/lib/kit (stylesheet stays tt's)" };
  }
  if (/^src\/hooks\//.test(path) && DELETED_HOOKS.has(base)) {
    return {
      status: 'replaced by frameact',
      descend: false,
      note: 'framework primitive (porting guide §4.2); call sites change',
    };
  }
  const ourSource = readOurs(path);
  if (ourSource !== undefined) {
    const stub = /FOUNDATION STUB/.test(ourSource.split('\n').slice(0, 12).join('\n'));
    if (stub) return { status: 'stub to replace', descend: true, note: 'FOUNDATION STUB in src/' };
    return { status: 'already ported', descend: false, note: '' };
  }
  const kind = kindOf(path);
  const isUi = kind === 'component' || kind === 'hook' || kind === 'async wrapper' || kind === 'bundle';
  if (/\.tsx?$/.test(path) && isUi) {
    return {
      status: 'port via codemod',
      descend: true,
      note: usesTeact(source) ? 'teact imports' : 'no teact imports (imports only)',
    };
  }
  if (/\.tsx?$/.test(path) && usesTeact(source)) {
    return { status: 'port verbatim', descend: true, note: 'imports only (teact/fasterdom swap)' };
  }
  return { status: 'port verbatim', descend: true, note: '' };
}

while (queue.length) {
  const { path, via } = queue.shift()!;
  if (entries.has(path)) continue;
  const abs = refFile(path);
  if (!isFile(abs)) continue;
  const binary = !/\.(?:tsx?|jsx?|s?css|json|svg|d\.ts)$/.test(path);
  const source = binary ? '' : readFileSync(abs, 'utf8');
  const { status, descend, note } = classify(path, source);
  entries.set(path, {
    path,
    kind: kindOf(path),
    status,
    via,
    note,
    lines: source ? source.split('\n').length : 0,
  });
  if (!descend) continue;

  const specs: { spec: string; style: boolean }[] = [];
  if (/\.(?:tsx?|jsx?)$/.test(path)) {
    for (const spec of scriptDeps(path, source)) specs.push({ spec, style: false });
    // Workers and wasm: `new URL('./x.worker.ts', import.meta.url)`.
    for (const m of source.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g)) {
      specs.push({ spec: m[1], style: false });
    }
    // `*.async.tsx`: useModuleLoader(Bundles.Auth, 'AuthCode') -> src/bundles/auth.ts
    for (const m of /\.async\.tsx$/.test(path) ? source.matchAll(/Bundles\.(\w+)/g) : []) {
      const bundle = `src/bundles/${m[1][0].toLowerCase()}${m[1].slice(1)}.ts`;
      if (isFile(refFile(bundle)) && !entries.has(bundle)) queue.push({ path: bundle, via: path });
    }
  } else if (/\.s?css$/.test(path)) {
    for (const spec of styleDeps(source)) specs.push({ spec, style: true });
  }
  for (const { spec, style } of specs) {
    const resolved = resolveSpec(path, spec, style);
    // moduleLoader.ts `import()`s every bundle; a bundle joins the closure only through the `Bundles.X` of an *.async wrapper.
    if (resolved.type === 'file' && /^src\/bundles\//.test(resolved.path)) continue;
    if (resolved.type === 'file') {
      if (!entries.has(resolved.path)) queue.push({ path: resolved.path, via: path });
    } else if (resolved.type === 'package') {
      if (!packages.has(resolved.name)) packages.set(resolved.name, path);
    } else if (resolved.type === 'unresolved') {
      if (!unresolved.has(resolved.spec)) unresolved.set(resolved.spec, path);
    }
  }
}

const rows = [...entries.values()];
const order: Status[] = [
  'stub to replace',
  'port via codemod',
  'port verbatim',
  'kit adapter',
  'replaced by frameact',
  'deferred (other slice)',
  'already ported',
  'dependency',
];
rows.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.path.localeCompare(b.path));

const count = (status: Status) => rows.filter((r) => r.status === status).length;
const lineSum = (status: Status) => rows.filter((r) => r.status === status).reduce((sum, r) => sum + r.lines, 0);

const short = (p: string) => p.replace(/^src\//, '');
const md: string[] = [];
md.push('## Inventory (generated by `pnpm slice:inventory`)');
md.push('');
md.push(
  `Roots: ${roots.map((r) => `\`${r}\``).join(', ')}.${stops.size ? ` Walk stops at: ${[...stops].map((s) => `\`${s}\``).join(', ')}.` : ''}`,
);
md.push(
  `Reference: \`${relative(ROOT, reference) || reference}\`. Closure of files not yet in \`src/\`; a file that is already ported is listed once and not descended into.`,
);
md.push('');
md.push('| status | files | lines |');
md.push('| --- | ---: | ---: |');
for (const status of order) {
  if (status === 'dependency') continue;
  if (count(status)) md.push(`| ${status} | ${count(status)} | ${lineSum(status)} |`);
}
md.push('');
md.push('| file | kind | status | needed by | note |');
md.push('| --- | --- | --- | --- | --- |');
for (const row of rows) {
  md.push(
    `| \`${short(row.path)}\` | ${row.kind} | ${row.status} | ${row.via === '(root)' ? 'root' : `\`${short(row.via)}\``} | ${row.note} |`,
  );
}
md.push('');
md.push('### Packages imported by the closure');
md.push('');
md.push('| package | in package.json | first imported by |');
md.push('| --- | --- | --- |');
for (const [name, by] of [...packages].sort()) {
  md.push(`| \`${name}\` | ${ourPackages.has(name) ? 'yes' : name === 'frameact' ? 'yes' : 'no'} | \`${short(by)}\` |`);
}
if (unresolved.size) {
  md.push('');
  md.push('### Unresolved specifiers');
  md.push('');
  for (const [spec, by] of unresolved) md.push(`- \`${spec}\` from \`${short(by)}\``);
}
md.push('');

if (args.flags.has('json')) {
  console.log(
    JSON.stringify({ entries: rows, packages: [...packages.keys()], unresolved: [...unresolved.keys()] }, undefined, 2),
  );
} else if (outFile) {
  // Only the region between the markers is rewritten, so the hand-written report around it stays.
  const START = '<!-- inventory:start -->';
  const END = '<!-- inventory:end -->';
  const target = join(ROOT, outFile);
  const block = `${START}\n${md.join('\n')}\n${END}`;
  const previous = existsSync(target) ? readFileSync(target, 'utf8') : '';
  const from = previous.indexOf(START);
  const to = previous.indexOf(END);
  writeFileSync(
    target,
    from !== -1 && to > from
      ? previous.slice(0, from) + block + previous.slice(to + END.length)
      : previous + block + '\n',
  );
  console.log(`wrote ${outFile}: ${rows.length} files`);
  for (const status of order) if (count(status)) console.log(`  ${status}: ${count(status)}`);
} else {
  console.log(md.join('\n'));
}
void dirname;
