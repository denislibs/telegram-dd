// `pnpm exec tsx tests/perfcmp/msgnodes.ts --dir DIST [--top 60]`: which frameact reactive nodes an open chat creates.
// Opens the top chat of the perfcmp-large scenario (60 messages rendered), takes heap snapshots before and after, and
// groups the Computation / Effect / SignalNode objects that appeared by the source location of their `_compute`
// (memos and effects) and `_apply` (effects) closures: "N per message" for every memo, effect and binding kind.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { SCENARIO_HASH, serveDir } from './apps';
import { CHAT_LIST_ROW, pc } from './scenarios';

const PROBE = join(import.meta.dirname, 'probe.js');
const { values: args } = parseArgs({
  options: { dir: { type: 'string' }, top: { type: 'string', default: '80' } },
});

interface Snap {
  byKind: Map<string, Map<string, number>>;
  ids: Set<number>;
}

function parse(json: string, scripts: Map<string, string>, lines: Map<string, string[]>, skip?: Set<number>): Snap {
  const snap = JSON.parse(json);
  const meta = snap.snapshot.meta;
  const nf: string[] = meta.node_fields;
  const ef: string[] = meta.edge_fields;
  const nTypes: string[] = meta.node_types[0];
  const eTypes: string[] = meta.edge_types[0];
  const N = nf.length;
  const E = ef.length;
  const nodes: number[] = snap.nodes;
  const edges: number[] = snap.edges;
  const strings: string[] = snap.strings;
  const iType = nf.indexOf('type');
  const iName = nf.indexOf('name');
  const iId = nf.indexOf('id');
  const iEc = nf.indexOf('edge_count');
  const eType = ef.indexOf('type');
  const eName = ef.indexOf('name_or_index');
  const eTo = ef.indexOf('to_node');
  // locations: [object_index, script_id, line, column]
  const loc = new Map<number, string>();
  const L: number[] = snap.locations ?? [];
  const lf: string[] = meta.location_fields ?? ['object_index', 'script_id', 'line', 'column'];
  const LS = lf.length;
  const lo = lf.indexOf('object_index');
  const ls = lf.indexOf('script_id');
  const ll = lf.indexOf('line');
  if (process.env.DEBUG_LOC) process.stderr.write(`location_fields ${lf} first ${L.slice(0, 12)}\n`);
  for (let i = 0; i < L.length; i += LS) {
    const url = scripts.get(String(L[i + ls])) ?? `script${L[i + ls]}`;
    const file = url.replace(/^.*\//, '');
    const src = lines.get(file)?.[L[i + ll]]?.trim().slice(0, 90) ?? '';
    loc.set(L[i + lo], `${file}:${L[i + ll] + 1}  ${src}`);
  }
  const firstEdge: number[] = new Array(nodes.length / N);
  for (let i = 0, e = 0; i < nodes.length / N; i++) {
    firstEdge[i] = e;
    e += nodes[i * N + iEc] * E;
  }
  const byKind = new Map<string, Map<string, number>>();
  const ids = new Set<number>();
  const want = new Set(['Computation', 'Effect', 'SignalNode', 'Scope']);
  for (let i = 0; i < nodes.length / N; i++) {
    const base = i * N;
    if (nTypes[nodes[base + iType]] !== 'object') continue;
    const name = strings[nodes[base + iName]];
    if (!want.has(name)) continue;
    const id = nodes[base + iId];
    ids.add(id);
    if (skip?.has(id)) continue;
    let compute = '-';
    let apply = '';
    const ec = nodes[base + iEc];
    for (let k = 0; k < ec; k++) {
      const e = firstEdge[i] + k * E;
      if (eTypes[edges[e + eType]] !== 'property') continue;
      const ename = strings[edges[e + eName]];
      if (ename !== '_compute' && ename !== '_apply') continue;
      const to = edges[e + eTo];
      const where = loc.get(to) ?? strings[nodes[to + iName]];
      if (ename === '_compute') compute = where;
      else apply = where;
    }
    const key = name === 'Effect' ? `${compute}  =>  ${apply}` : compute;
    if (!byKind.has(name)) byKind.set(name, new Map());
    const m = byKind.get(name)!;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return { byKind, ids };
}

async function main() {
  const server = await serveDir(args.dir!);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.addInitScript({ content: 'window.__name = (f) => f;' });
    await page.addInitScript({ path: PROBE });
    const cdp = await context.newCDPSession(page);
    const scripts = new Map<string, string>();
    cdp.on('Debugger.scriptParsed', (e: { scriptId: string; url: string }) => scripts.set(e.scriptId, e.url));
    await cdp.send('Debugger.enable');
    await page.goto(server.url + SCENARIO_HASH, { waitUntil: 'commit' });
    await pc(page, 'waitForCount', CHAT_LIST_ROW, 1, 60_000);
    await pc(page, 'sleep', 2500);
    const lines = new Map<string, string[]>();
    const assets = join(args.dir!, 'assets');
    for (const url of scripts.values()) {
      const file = url.replace(/^.*\//, '');
      try {
        lines.set(file, readFileSync(join(assets, file), 'utf8').split('\n'));
      } catch {
        /* not ours */
      }
    }
    await cdp.send('HeapProfiler.enable');
    const take = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      const chunks: string[] = [];
      const onChunk = (e: { chunk: string }) => chunks.push(e.chunk);
      cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
      await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
      cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
      return chunks.join('');
    };
    const before = parse(await take(), scripts, lines);
    await pc(page, 'openFirstChat');
    await pc(page, 'sleep', 2000);
    const msgs = await page.evaluate(() => document.querySelectorAll('#MiddleColumn .message-list-item').length);
    const after = parse(await take(), scripts, lines, before.ids);
    const top = Number(args.top);
    process.stdout.write(`messages rendered: ${msgs}\n`);
    for (const [kind, m] of after.byKind) {
      const totalNew = [...m.values()].reduce((a, b) => a + b, 0);
      process.stdout.write(`\n== ${kind}: ${totalNew} new (${(totalNew / msgs).toFixed(1)} per message)\n`);
      for (const [k, v] of [...m].sort((a, b) => b[1] - a[1]).slice(0, top)) {
        process.stdout.write(`${String(v).padStart(6)} ${(v / msgs).toFixed(2).padStart(6)}/msg  ${k}\n`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exit(1);
});
