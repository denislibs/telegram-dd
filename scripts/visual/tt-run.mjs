#!/usr/bin/env node
// Runs the telegram-tt reference app (mocked client) for the visual-comparison gate, WITHOUT touching `reference/`.
//
//   node scripts/visual/tt-run.mjs prepare   # copy reference/telegram-tt -> .cache/tt-run, patch, npm install
//   node scripts/visual/tt-run.mjs serve     # prepare (if needed) + `vite` on $TT_PORT (default 1235)
//   node scripts/visual/tt-run.mjs --refresh # force a fresh copy (also when the reference commit changed)
//
// tt ships its own fake backend: `APP_MOCKED_CLIENT=1` swaps the GramJS TelegramClient for `MockClient`
// (src/lib/gramjs/client/MockClient.ts + __mocks__/<scenario>.json), the app boots straight into the logged-in
// state and the scenario is chosen with `#?mockScenario=<name>`. Our src/lib/gramjs/client is a port of the same
// files, so both apps get the same data. See docs/quality-gates.md.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { patches } from './tt-patches.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// `reference/` is gitignored, so a git worktree (.worktrees/<name>) does not have it: fall back to the main checkout's.
const REFERENCE =
  [process.env.TT_REFERENCE, resolve(ROOT, 'reference/telegram-tt'), resolve(ROOT, '../../reference/telegram-tt')]
    .filter(Boolean)
    .find((path) => existsSync(join(path, 'package.json'))) || resolve(ROOT, 'reference/telegram-tt');
const COPY = resolve(ROOT, '.cache/tt-run');
const PORT = process.env.TT_PORT || '1235';
const STAMP = join(COPY, '.tt-run-stamp');
const SKIP = new Set(['node_modules', '.git', 'dist', '.cache', 'tests', 'playwright-report', 'test-results']);

const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith('--')) || 'serve';
const refresh = args.includes('--refresh');

function log(message) {
  process.stdout.write(`[tt-run] ${message}\n`);
}

function referenceSha() {
  const { stdout } = spawnSync('git', ['-C', REFERENCE, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  return stdout.trim() || 'unknown';
}

function patchesHash() {
  return JSON.stringify(patches);
}

function prepare() {
  if (!existsSync(join(REFERENCE, 'package.json'))) {
    throw new Error(`tt reference not found at ${REFERENCE} (clone it per AGENTS.md or set TT_REFERENCE)`);
  }
  const stamp = JSON.stringify({ sha: referenceSha(), patches: patchesHash() });
  const upToDate = !refresh && existsSync(STAMP) && readFileSync(STAMP, 'utf8') === stamp;
  if (upToDate && existsSync(join(COPY, 'node_modules'))) {
    log(`copy is up to date (tt@${referenceSha().slice(0, 7)})`);
    return;
  }

  // Keep node_modules between refreshes: only the sources are recopied.
  mkdirSync(COPY, { recursive: true });
  log(`copying ${REFERENCE} -> ${COPY}`);
  cpSync(REFERENCE, COPY, {
    recursive: true,
    force: true,
    filter: (source) => !SKIP.has(source.slice(REFERENCE.length + 1).split('/')[0]),
  });

  for (const patch of patches) {
    const file = join(COPY, patch.file);
    const original = readFileSync(file, 'utf8');
    if (!original.includes(patch.find)) {
      throw new Error(`patch "${patch.name}" does not apply: ${patch.file} no longer contains the expected text`);
    }
    writeFileSync(file, original.replace(patch.find, patch.replace));
    log(`patched ${patch.file} (${patch.name})`);
  }

  if (!existsSync(join(COPY, 'node_modules')) || refresh) {
    // `npm install`, not `npm ci`: tt's lockfile is written by a newer npm than CI/dev machines may have.
    log('npm install (this takes a while the first time)');
    const result = spawnSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: COPY,
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      rmSync(STAMP, { force: true });
      throw new Error('npm install failed in the tt copy');
    }
  }
  writeFileSync(STAMP, stamp);
}

function serve() {
  log(`vite on http://localhost:${PORT} (mocked client, APP_ENV=test)`);
  const child = spawn(
    join(COPY, 'node_modules/.bin/vite'),
    ['--mode', 'development', '--port', PORT, '--strictPort', '--host', '127.0.0.1'],
    {
      cwd: COPY,
      stdio: 'inherit',
      env: { ...process.env, APP_ENV: 'test', APP_MOCKED_CLIENT: '1' },
    },
  );
  const stop = () => child.kill('SIGTERM');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', (code) => process.exit(code ?? 0));
}

try {
  prepare();
  if (command === 'serve') serve();
} catch (error) {
  process.stderr.write(`[tt-run] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
