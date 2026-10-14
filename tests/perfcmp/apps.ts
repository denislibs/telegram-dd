// Builds and serves the two apps of the comparison, both as PRODUCTION builds of the mocked client:
//   dd - this repo (telegram-dd on frameact): `vite build`, output .cache/perfcmp/dist-dd
//   tt - the patched COPY of telegram-tt (.cache/tt-run, made by scripts/visual/tt-run.mjs; `reference/` is never
//        touched): `vite build`, output .cache/tt-run/dist-perf
// APP_ENV=production keeps DEBUG off in both (no debug copies of the global, no dev logging); APP_MOCKED_CLIENT=1 swaps
// the GramJS client for MockClient and exposes `window.getActions()` (see src/global/index.ts and tt-patches.mjs).
// The large mock scenario (scenario.ts) is written into each tree for the duration of its build only: ours is restored
// afterwards (journal in .cache/perfcmp/edits.json survives a crash), so `git status` stays clean.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, resolve } from 'node:path';

import { PERFCMP_ENV } from '../config';
import { patches } from '../../scripts/visual/tt-patches.mjs';
import { buildLargeScenario, DEFAULT_CHAT_COUNT, LARGE_SCENARIO_NAME } from './scenario';

export const ROOT = resolve(import.meta.dirname, '../..');
export const CACHE = join(ROOT, '.cache/perfcmp');
const TT_COPY = join(ROOT, '.cache/tt-run');
const MOCKS = 'src/lib/gramjs/client/__mocks__';
const SCENARIO_FILE = `${MOCKS}/${LARGE_SCENARIO_NAME}.json`;
const JOURNAL = join(CACHE, 'edits.json');

export type AppId = 'dd' | 'tt';

export interface BuiltApp {
  id: AppId;
  dir: string;
  /** What was built: revision and whether it was rebuilt or reused. */
  description: string;
}

function log(message: string) {
  process.stdout.write(`[perfcmp] ${message}\n`);
}

function sha(...parts: (string | Uint8Array)[]) {
  const hash = createHash('sha1');
  for (const part of parts) hash.update(part);
  return hash.digest('hex').slice(0, 16);
}

function run(command: string, args: string[], cwd: string, env: Record<string, string>) {
  return new Promise<void>((done, fail) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const keep = (chunk: Buffer) => (tail = (tail + chunk.toString()).slice(-4000));
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('error', fail);
    child.on('exit', (code) =>
      code === 0 ? done() : fail(new Error(`${command} ${args.join(' ')} failed (${code}) in ${cwd}\n${tail}`)),
    );
  });
}

function git(...args: string[]) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : '';
}

// ---- temporary edits of our own tree -------------------------------------------------------------------------------

interface JournalEntry {
  file: string;
  /** Original content, or undefined when the file did not exist. */
  original: string | undefined;
}

function restoreJournal() {
  if (!existsSync(JOURNAL)) return;
  const entries = JSON.parse(readFileSync(JOURNAL, 'utf8')) as JournalEntry[];
  for (const { file, original } of entries.reverse()) {
    if (original === undefined) rmSync(file, { force: true });
    else writeFileSync(file, original);
  }
  rmSync(JOURNAL, { force: true });
}

async function withTemporaryEdits<T>(
  edits: { file: string; transform: (text: string | undefined) => string | undefined }[],
  fn: () => Promise<T>,
) {
  mkdirSync(CACHE, { recursive: true });
  restoreJournal(); // a previous run that was killed mid-build
  const journal: JournalEntry[] = edits.map(({ file }) => ({
    file,
    original: existsSync(file) ? readFileSync(file, 'utf8') : undefined,
  }));
  writeFileSync(JOURNAL, JSON.stringify(journal));
  try {
    edits.forEach(({ file, transform }, index) => {
      const next = transform(journal[index].original);
      if (next !== undefined) writeFileSync(file, next);
    });
    return await fn();
  } finally {
    restoreJournal();
  }
}

// ---- the apps ------------------------------------------------------------------------------------------------------

const scenarioJson = () => JSON.stringify(buildLargeScenario(DEFAULT_CHAT_COUNT).json);

/** tt: copy + patch (tt-run.mjs), add the scenario, `vite build`. Rebuilt only when the inputs changed. */
export async function buildTt({ force = false, skip = false } = {}): Promise<BuiltApp> {
  const prepare = spawnSync('node', ['scripts/visual/tt-run.mjs', 'prepare'], { cwd: ROOT, encoding: 'utf8' });
  if (prepare.status !== 0) throw new Error(`tt-run prepare failed:\n${prepare.stdout}${prepare.stderr}`);

  const referenceStamp = readFileSync(join(TT_COPY, '.tt-run-stamp'), 'utf8');
  const reference = `tt@${(JSON.parse(referenceStamp) as { sha: string }).sha.slice(0, 7)}`;
  const json = scenarioJson();
  const stampFile = join(TT_COPY, '.perfcmp-stamp');
  const stamp = sha(referenceStamp, JSON.stringify(patches), json, JSON.stringify(PERFCMP_ENV));
  const dir = join(TT_COPY, 'dist-perf');
  const isCurrent = existsSync(stampFile) && readFileSync(stampFile, 'utf8') === stamp;
  if (existsSync(join(dir, 'index.html')) && ((!force && isCurrent) || skip)) {
    return {
      id: 'tt',
      dir,
      description: `telegram-tt copy ${reference} (reused build${isCurrent ? '' : ' - stale, --no-build'} ${stamp.slice(0, 7)})`,
    };
  }

  log('building the telegram-tt copy (production, mocked client)...');
  writeFileSync(join(TT_COPY, SCENARIO_FILE), json);
  await run(
    join(TT_COPY, 'node_modules/.bin/vite'),
    ['build', '--outDir', 'dist-perf', '--emptyOutDir'],
    TT_COPY,
    // tt's own variable names (it requires an api id outside APP_ENV=test); dummies, nothing reaches Telegram.
    {
      ...PERFCMP_ENV,
      TELEGRAM_API_ID: PERFCMP_ENV.TG_TELEGRAM_API_ID,
      TELEGRAM_API_HASH: PERFCMP_ENV.TG_TELEGRAM_API_HASH,
    },
  );
  writeFileSync(stampFile, stamp);
  return { id: 'tt', dir, description: `telegram-tt copy ${reference} (built ${stamp.slice(0, 7)})` };
}

/** Fingerprint of this checkout's sources: HEAD, uncommitted changes and untracked files under src/. */
function sourceFingerprint() {
  const untracked = git('ls-files', '-o', '--exclude-standard', '-z', '--', 'src', 'plugins', 'index.html')
    .split('\0')
    .filter(Boolean)
    .map((file) => `${file}:${sha(readFileSync(join(ROOT, file)))}`);
  return {
    head: git('rev-parse', '--short', 'HEAD').trim(),
    hash: sha(git('rev-parse', 'HEAD'), git('diff', 'HEAD'), untracked.join('\n')),
  };
}

/** dd: `vite build` of this checkout. Rebuilt only when the sources changed (HEAD, working tree, untracked files). */
export async function buildDd({ force = false, skip = false } = {}): Promise<BuiltApp> {
  const dir = join(CACHE, 'dist-dd');
  const { head, hash } = sourceFingerprint();
  const json = scenarioJson();
  const stamp = sha(hash, json, JSON.stringify(PERFCMP_ENV), JSON.stringify(patches));
  const stampFile = join(CACHE, 'dd-stamp');
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').trim();
  const label = `telegram-dd ${branch}@${head}`;
  const isCurrent = existsSync(stampFile) && readFileSync(stampFile, 'utf8') === stamp;
  if (existsSync(join(dir, 'index.html')) && ((!force && isCurrent) || skip)) {
    return {
      id: 'dd',
      dir,
      description: `${label} (reused build${isCurrent ? '' : ' - stale, --no-build'} ${stamp.slice(0, 7)})`,
    };
  }

  log(`building ${label} (production, mocked client)...`);
  const shared = patches.filter((patch) => (patch as { shared?: boolean }).shared);
  await withTemporaryEdits(
    [
      { file: join(ROOT, SCENARIO_FILE), transform: () => json },
      // The mock fixes tt's copy needs (MockClient.start/onConnected, GetDialogFilters) are applied to ours too until it
      // has them natively: a patch whose text is already gone is skipped, so it does nothing once the port fixed it.
      ...[...new Set(shared.map((patch) => patch.file))].map((file) => ({
        file: join(ROOT, file),
        transform: (text: string | undefined) => {
          let next = text ?? '';
          for (const patch of shared.filter((candidate) => candidate.file === file)) {
            if (next.includes(patch.find)) next = next.replace(patch.find, patch.replace);
          }
          return next;
        },
      })),
    ],
    () => run('pnpm', ['exec', 'vite', 'build', '--outDir', dir, '--emptyOutDir'], ROOT, PERFCMP_ENV),
  );
  writeFileSync(stampFile, stamp);
  return { id: 'dd', dir, description: `${label} (built ${stamp.slice(0, 7)})` };
}

// ---- static server -------------------------------------------------------------------------------------------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.tgs': 'application/octet-stream',
};

export interface Served {
  url: string;
  close(): Promise<void>;
}

/** A plain static file server on an ephemeral port: the same for both apps, so server behaviour cannot differ. */
export async function serveDir(dir: string): Promise<Served> {
  const server: Server = createServer((request, response) => {
    let path = decodeURIComponent((request.url ?? '/').split('?')[0]);
    if (path.endsWith('/')) path += 'index.html';
    const file = join(dir, path);
    if (!file.startsWith(dir) || !existsSync(file)) {
      response.statusCode = 404;
      response.end();
      return;
    }
    try {
      const body = readFileSync(file);
      response.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
      response.setHeader('cache-control', 'no-store');
      response.end(body);
    } catch {
      response.statusCode = 404; // a directory
      response.end();
    }
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () =>
      new Promise((done) => {
        server.close(() => done());
        server.closeAllConnections();
      }),
  };
}

export const SCENARIO_HASH = `#?mockScenario=${LARGE_SCENARIO_NAME}`;
