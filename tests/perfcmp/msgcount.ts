// `pnpm exec tsx tests/perfcmp/msgcount.ts --dd-dir DIR [--tt-dir DIR] [--heap]`: the open-chat scenario under calibrated CPU throttling (x4 on the reference machine) with
// counters: message elements created / removed (unique elements), the message count per page-in, long tasks, and
// optionally (--heap) frameact node counts from heap snapshots (Computation / Effect / SignalNode / Scope) at three points.
import { type CDPSession, chromium } from '@playwright/test';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { SCENARIO_HASH, serveDir } from './apps';
import { calibrateCpu, describeCalibration, parseRate } from './cpuCalibration';
import { CHAT_LIST_ROW, pc, scenarioById } from './scenarios';

const ROOT = resolve(import.meta.dirname, '../..');
const PROBE = join(import.meta.dirname, 'probe.js');
const { values: args } = parseArgs({
  options: {
    'dd-dir': { type: 'string' },
    'tt-dir': { type: 'string' },
    heap: { type: 'boolean', default: false },
    runs: { type: 'string', default: '1' },
    cpu: { type: 'string', default: 'auto' },
  },
});

const COUNTER = () => {
  const w = window as any;
  const seen = new WeakSet<Element>();
  const c = { created: 0, removedEver: 0, timeline: [] as [number, number, number][], live: new Set<Element>() };
  w.__mc = c;
  const isItem = (n: Node): n is Element => n instanceof Element && n.classList.contains('message-list-item');
  const scan = (n: Node, fn: (e: Element) => void) => {
    if (!(n instanceof Element)) return;
    if (isItem(n)) fn(n);
    n.querySelectorAll?.('.message-list-item').forEach(fn);
  };
  new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) =>
        scan(n, (e) => {
          if (!seen.has(e)) {
            seen.add(e);
            c.created++;
          }
        }),
      );
    }
  }).observe(document, { subtree: true, childList: true });
};

async function nodeCounts(cdp: CDPSession) {
  await cdp.send('HeapProfiler.collectGarbage');
  const chunks: string[] = [];
  const onChunk = (e: { chunk: string }) => chunks.push(e.chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
  const snap = JSON.parse(chunks.join(''));
  const fields: string[] = snap.snapshot.meta.node_fields;
  const types: string[] = snap.snapshot.meta.node_types[0];
  const stride = fields.length;
  const ti = fields.indexOf('type');
  const ni = fields.indexOf('name');
  const counts: Record<string, number> = {};
  const want = new Set([
    'Computation',
    'Effect',
    'SignalNode',
    'Scope',
    'StoreNode',
    'Object',
    'Array',
    'HTMLDivElement',
  ]);
  let closures = 0;
  for (let i = 0; i < snap.nodes.length; i += stride) {
    const type = types[snap.nodes[i + ti]];
    const name = snap.strings[snap.nodes[i + ni]];
    if (type === 'closure') closures++;
    if (type === 'object' && want.has(name)) counts[name] = (counts[name] ?? 0) + 1;
  }
  counts.closures = closures;
  return counts;
}

// The CPU throttling is calibrated to the target device (cpuCalibration.ts), as `perf:compare` does; `--cpu N` forces a rate.
let cpuRate = 4;
async function calibrate() {
  const browser = await chromium.launch();
  try {
    const calibration = await calibrateCpu(await browser.newContext(), parseRate(args.cpu));
    cpuRate = calibration.rate;
    process.stdout.write(`${describeCalibration(calibration)}\n`);
  } finally {
    await browser.close();
  }
}

async function once(url: string, heap: boolean) {
  const browser = await chromium.launch({
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.addInitScript({ content: 'window.__name = (f) => f;' });
    await page.addInitScript({ path: PROBE });
    await page.addInitScript(COUNTER);
    await page.goto(url, { waitUntil: 'commit' });
    await pc(page, 'waitForCount', CHAT_LIST_ROW, 1, 60_000);
    await pc(page, 'sleep', 2500);
    const cdp = await context.newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    const count = () => page.evaluate(() => document.querySelectorAll('#MiddleColumn .message-list-item').length);
    const heaps: Record<string, unknown> = {};
    if (heap) heaps.before = { msgs: await count(), ...(await nodeCounts(cdp)) };
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    await pc(page, 'start');
    await pc(page, 'openFirstChat');
    await pc(page, 'sleep', 1500);
    if (heap) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      heaps.opened = { msgs: await count(), ...(await nodeCounts(cdp)) };
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    }
    const createdAtOpen = await page.evaluate(() => (window as any).__mc.created);
    // the scenario's scroll with a timeline of page-ins (created count changes)
    const scroll = (pauseAt: number) =>
      page.evaluate(async (pauseAtCreated: number) => {
        const list = document.querySelector('#MiddleColumn .MessageList')!;
        const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));
        const start = performance.now();
        const steps: string[] = [];
        let last = -1;
        let stableSince = performance.now();
        const mc = (window as any).__mc;
        const ids = () =>
          [...list.querySelectorAll('.message-list-item')].map((el) => Number((el as HTMLElement).dataset.messageId));
        let frames = 0;
        while (performance.now() - start < 60000) {
          if (mc.created >= pauseAtCreated && performance.now() - stableSince > 400) break;
          list.scrollTop -= 400;
          frames++;
          await nextFrame();
          const all = ids();
          if (mc.created !== last) {
            steps.push(
              `${Math.round(performance.now() - start)}ms n=${all.length} [${Math.min(...all)}..${Math.max(...all)}] created=${mc.created}`,
            );
            last = mc.created;
            stableSince = performance.now();
          }
          if (list.scrollTop <= 1 && Math.min(...all) <= 1 && performance.now() - stableSince > 600) break;
        }
        return { frames, ms: Math.round(performance.now() - start), steps };
      }, pauseAt);
    let paged;
    if (heap) {
      paged = await scroll(createdAtOpen + 1);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      heaps.paged = {
        msgs: await count(),
        created: await page.evaluate(() => (window as any).__mc.created),
        ...(await nodeCounts(cdp)),
      };
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    }
    const scrolled = await scroll(Infinity);
    void paged;
    await pc(page, 'sleep', 500);
    const sample = await pc<{ longTasks: { duration: number }[] }>(page, 'stop');
    if (heap) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      heaps.end = { msgs: await count(), ...(await nodeCounts(cdp)) };
    }
    const created = await page.evaluate(() => (window as any).__mc.created);
    return {
      createdAtOpen,
      created,
      finalCount: await count(),
      scrolled,
      longTasks: sample.longTasks.map((t) => Math.round(t.duration)),
      heaps,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  void scenarioById;
  await calibrate();
  for (const [app, dir] of [
    ['dd', args['dd-dir']],
    ['tt', args['tt-dir']],
  ] as const) {
    if (!dir) continue;
    const server = await serveDir(dir);
    try {
      for (let i = 0; i < Number(args.runs); i++) {
        const r = await once(server.url + SCENARIO_HASH, args.heap);
        process.stdout.write(`== ${app} run ${i + 1}\n${JSON.stringify(r, undefined, 1)}\n`);
      }
    } finally {
      await server.close();
    }
  }
  void ROOT;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exit(1);
});
