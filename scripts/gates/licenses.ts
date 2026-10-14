// Gate 4: licenses of the production dependencies must be GPL-3.0-or-later compatible, and NOTICE.md must account for
// every vendored library under src/lib that came from telegram-tt.
//
//   pnpm gates:licenses            # exit 1 on a disallowed or unknown license, or a src/lib entry missing in NOTICE.md
//   pnpm gates:licenses --list     # print every package with its license
//
// Allowed licenses (each with the reason it is compatible): scripts/gates/license-policy.json.
// Exceptions (a package that must stay although its license is not on the list, with a reason):
// scripts/gates/license-exceptions.json -> { "packages": { "name" | "name@version": { "reason": "..." } } }
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { c, findReference, finish, GATES_DIR, heading, parseArgs, readJson, ROOT, table } from './lib/common.ts';

type Policy = { allowed: Record<string, string> };
type Exceptions = { packages: Record<string, { reason: string }> };
type Pkg = { name: string; version: string; license: string };

const args = parseArgs(process.argv.slice(2));
const policy = readJson<Policy>(join(GATES_DIR, 'license-policy.json'), { allowed: {} });
const exceptions = readJson<Exceptions>(join(GATES_DIR, 'license-exceptions.json'), { packages: {} }).packages;
const failures: string[] = [];

// --- SPDX expressions ---------------------------------------------------------------------------------------------

/** Deprecated SPDX ids and the ids they mean. */
const DEPRECATED: Record<string, string> = {
  'GPL-2.0': 'GPL-2.0-only',
  'GPL-2.0+': 'GPL-2.0-or-later',
  'GPL-3.0': 'GPL-3.0-only',
  'GPL-3.0+': 'GPL-3.0-or-later',
  'LGPL-2.1': 'LGPL-2.1-only',
  'LGPL-2.1+': 'LGPL-2.1-or-later',
  'LGPL-3.0': 'LGPL-3.0-only',
  'LGPL-3.0+': 'LGPL-3.0-or-later',
  'AGPL-3.0': 'AGPL-3.0-only',
};

const isAllowedId = (id: string) => Object.hasOwn(policy.allowed, DEPRECATED[id] ?? id);

/** Evaluates `(MIT OR Apache-2.0) AND ISC`, `GPL-2.0-or-later WITH Classpath-exception-2.0`; false for anything else. */
function isAllowedExpression(expression: string): boolean {
  const tokens = expression
    .replace(/([()])/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean);
  let pos = 0;
  const keyword = (word: string) => tokens[pos]?.toUpperCase() === word;
  const parseAtom = (): boolean => {
    const token = tokens[pos++];
    if (token === undefined) {
      return false;
    }
    if (token === '(') {
      const inner = parseOr();
      if (tokens[pos] === ')') {
        pos++;
      }
      return inner;
    }
    if (keyword('WITH')) {
      pos += 2; // a license exception only adds permissions
    }
    return isAllowedId(token);
  };
  const parseAnd = (): boolean => {
    let result = parseAtom();
    while (keyword('AND')) {
      pos++;
      const right = parseAtom();
      result = result && right;
    }
    return result;
  };
  const parseOr = (): boolean => {
    let result = parseAnd();
    while (keyword('OR')) {
      pos++;
      const right = parseAnd();
      result = result || right;
    }
    return result;
  };
  const result = parseOr();
  return result && pos === tokens.length;
}

// --- production dependencies --------------------------------------------------------------------------------------

const listed = spawnSync('pnpm', ['licenses', 'list', '--json', '--prod'], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
if (listed.status !== 0) {
  console.error(c.red('`pnpm licenses list --json --prod` failed (run `pnpm install` first):\n') + listed.stderr);
  process.exit(2);
}
type Listed = { name: string; versions: string[]; license: string };
const packages: Pkg[] = Object.values(JSON.parse(listed.stdout) as Record<string, Listed[]>)
  .flat()
  .flatMap((p) => p.versions.map((version) => ({ name: p.name, version, license: p.license })));

// Workspace packages (frameact) are not in `pnpm licenses`: read their package.json.
const rootPackage = readJson<{ dependencies?: Record<string, string> }>(join(ROOT, 'package.json'), {});
for (const [name, spec] of Object.entries(rootPackage.dependencies ?? {})) {
  if (!spec.startsWith('workspace:')) {
    continue;
  }
  const manifest = join(ROOT, 'src/vendor', name, 'package.json');
  const license = existsSync(manifest)
    ? (JSON.parse(readFileSync(manifest, 'utf8')) as { license?: string }).license
    : undefined;
  packages.push({ name, version: 'workspace', license: license ?? 'Unknown' });
}
packages.sort((x, y) => x.name.localeCompare(y.name) || x.version.localeCompare(y.version));

const names = new Set(packages.map((p) => p.name));
for (const name of Object.keys(rootPackage.dependencies ?? {})) {
  if (!names.has(name)) {
    failures.push(`${name}: a direct dependency that \`pnpm licenses\` did not report (is it installed?)`);
  }
}

const usedExceptions = new Set<string>();
const byLicense = new Map<string, number>();
const accepted: { pkg: Pkg; reason: string }[] = [];
for (const pkg of packages) {
  byLicense.set(pkg.license, (byLicense.get(pkg.license) ?? 0) + 1);
  const key = exceptions[`${pkg.name}@${pkg.version}`] ? `${pkg.name}@${pkg.version}` : pkg.name;
  const exception = exceptions[key];
  if (exception) {
    usedExceptions.add(key);
  }
  if (isAllowedExpression(pkg.license)) {
    continue;
  }
  if (exception?.reason?.trim()) {
    accepted.push({ pkg, reason: exception.reason });
  } else {
    failures.push(`${pkg.name}@${pkg.version}: license "${pkg.license}" is not GPL-3.0-or-later compatible or unknown`);
  }
}
for (const [key, exception] of Object.entries(exceptions)) {
  if (!exception.reason?.trim()) {
    failures.push(`license-exceptions.json: "${key}" has no reason`);
  }
  if (!usedExceptions.has(key)) {
    failures.push(`license-exceptions.json: "${key}" matches no production dependency (stale entry)`);
  }
}

console.log(c.bold('gates:licenses'));
console.log(`production dependencies (incl. transitive): ${packages.length} package versions`);
const counts = [...byLicense].sort((x, y) => y[1] - x[1]).map(([license, count]) => [String(count), license]);
console.log(table(counts, ['r', 'l']));
if (args.flags.has('list')) {
  heading('All packages');
  console.log(table(packages.map((p) => [p.name, p.version, p.license])));
}
if (accepted.length) {
  heading('Accepted exceptions');
  for (const { pkg, reason } of accepted) {
    console.log(`  ${pkg.name}@${pkg.version} (${pkg.license}): ${reason}`);
  }
}

// --- NOTICE.md covers the vendored libs ---------------------------------------------------------------------------

const noticeTokens = [...readFileSync(join(ROOT, 'NOTICE.md'), 'utf8').matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (entry: string) => {
  const bounded = new RegExp(`(^|[\\s,/(])${escapeRegExp(entry)}(?=$|[\\s,/)*{.])`);
  return noticeTokens.some((token) => token.includes(`lib/${entry}`) || bounded.test(token));
};

const referenceDir = findReference();
if (!referenceDir) {
  console.log(`${c.yellow('warn')} no telegram-tt reference found: every src/lib entry is treated as vendored from tt`);
}
// Original (non-tt) entries carry no third-party notice duty; only what also exists in the reference counts.
const vendoredFromTt = readdirSync(join(ROOT, 'src/lib')).filter(
  (name) => !referenceDir || existsSync(join(referenceDir, 'src/lib', name)),
);
heading(`NOTICE.md vs src/lib (${vendoredFromTt.length} entries from telegram-tt)`);
const missingInNotice = vendoredFromTt.filter((name) => !mentions(name));
for (const name of missingInNotice) {
  failures.push(`src/lib/${name} is not mentioned in NOTICE.md (third-party inventory)`);
}
if (!missingInNotice.length) {
  console.log('  every src/lib/* entry is accounted for in the NOTICE.md inventory');
}

if (failures.length) {
  heading('Problems');
  for (const failure of failures) {
    console.log(`  ${c.red('x')} ${failure}`);
  }
  console.log(
    c.dim(
      '\nDependency: replace it, or accept it in scripts/gates/license-exceptions.json with a reason (new SPDX ids go to\n' +
        'scripts/gates/license-policy.json with the compatibility argument). src/lib entry: add it to the NOTICE.md\n' +
        'inventory. See docs/quality-gates.md.',
    ),
  );
}
finish('gates:licenses', failures.length);
