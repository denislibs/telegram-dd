// `pnpm exec tsx tests/perfcmp/profile.ts`: where the time of a perf:compare scenario goes, per JS function, in both
// apps. Unminified production builds of the mocked client (same data and patches as perf:compare), one Chromium per
// run, CPU x4, a CDP trace (tasks, forced layouts) plus the CDP sampling profiler (200 us), on the same clock: every
// number can be cut to "inside long tasks". PROF_RAW=<prefix> also writes each run's profile and long-task windows.
//
//   tsx tests/perfcmp/profile.ts --scenario scroll --runs 3 [--app dd,tt] [--no-build] [--out DIR]
//
// Output (stdout + DIR/<app>-<scenario>.json): self and total time per function (all, and inside tasks >= 50 ms),
// task breakdown (script / style / layout / paint / gc), forced (in-script) layout and style counts.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { PERFCMP_ENV } from '../config';
import { patches } from '../../scripts/visual/tt-patches.mjs';
import { SCENARIO_HASH, serveDir } from './apps';
import { buildLargeScenario, DEFAULT_CHAT_COUNT, LARGE_SCENARIO_NAME } from './scenario';
import { CHAT_LIST_ROW, pc, scenarioById } from './scenarios';
import { categorize, findMainThread, markTime, parseTrace, TASK_EVENT, type TraceEvent } from './trace';

const ROOT = resolve(import.meta.dirname, '../..');
const TT_COPY = join(ROOT, '.cache/tt-run');
const PROBE = join(import.meta.dirname, 'probe.js');
const MOCK_FILE = `src/lib/gramjs/client/__mocks__/${LARGE_SCENARIO_NAME}.json`;

const { values: args } = parseArgs({
  options: {
    scenario: { type: 'string', default: 'scroll' },
    runs: { type: 'string', default: '3' },
    app: { type: 'string', default: 'dd,tt' },
    'no-build': { type: 'boolean', default: false },
    out: { type: 'string', default: join(ROOT, '.cache/perfprof') },
    'dd-dir': { type: 'string' },
    top: { type: 'string', default: '40' },
    cpu: { type: 'string', default: '4' },
  },
});

function run(command: string, argv: string[], cwd: string, env: Record<string, string>) {
  return new Promise<void>((done, fail) => {
    const child = spawn(command, argv, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const keep = (chunk: Buffer) => (tail = (tail + chunk.toString()).slice(-4000));
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`${command} failed\n${tail}`))));
  });
}

async function buildDd(outDir: string) {
  const json = JSON.stringify(buildLargeScenario(DEFAULT_CHAT_COUNT).json);
  const shared = patches.filter((patch) => (patch as { shared?: boolean }).shared);
  const files = [...new Set([MOCK_FILE, ...shared.map((patch) => patch.file)])].map((file) => join(ROOT, file));
  const originals = files.map((file) => (existsSync(file) ? readFileSync(file, 'utf8') : undefined));
  try {
    writeFileSync(join(ROOT, MOCK_FILE), json);
    for (const file of files.slice(1)) {
      let text = readFileSync(file, 'utf8');
      for (const patch of shared.filter((candidate) => join(ROOT, candidate.file) === file)) {
        if (text.includes(patch.find)) text = text.replace(patch.find, patch.replace);
      }
      writeFileSync(file, text);
    }
    await run(
      'pnpm',
      ['exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir', '--minify', 'false'],
      ROOT,
      PERFCMP_ENV,
    );
  } finally {
    files.forEach((file, index) => {
      const original = originals[index];
      if (original === undefined) rmSync(file, { force: true });
      else writeFileSync(file, original);
    });
  }
}

async function buildTt(outDir: string) {
  // The copy already holds the scenario and the patches (perf:compare's buildTt).
  if (!existsSync(join(TT_COPY, MOCK_FILE))) throw new Error('run pnpm perf:compare once first (tt copy + scenario)');
  await run(
    join(TT_COPY, 'node_modules/.bin/vite'),
    ['build', '--outDir', outDir, '--emptyOutDir', '--minify', 'false'],
    TT_COPY,
    {
      ...PERFCMP_ENV,
      TELEGRAM_API_ID: PERFCMP_ENV.TG_TELEGRAM_API_ID,
      TELEGRAM_API_HASH: PERFCMP_ENV.TG_TELEGRAM_API_HASH,
    },
  );
}

// ---- profile analysis ---------------------------------------------------------------------------------------------

interface Node {
  id: number;
  parent?: number;
  name: string;
  url: string;
  line: number;
}

interface Sample {
  ts: number;
  node: number;
}

function fromCdpProfile(profile: {
  nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }[];
  startTime: number;
  samples?: number[];
  timeDeltas?: number[];
}) {
  const nodes = new Map<number, Node>();
  for (const node of profile.nodes) {
    nodes.set(node.id, {
      id: node.id,
      name: node.callFrame.functionName || '(anonymous)',
      url: node.callFrame.url,
      line: node.callFrame.lineNumber,
    });
  }
  for (const node of profile.nodes) for (const child of node.children ?? []) nodes.get(child)!.parent = node.id;
  const samples: Sample[] = [];
  let time = profile.startTime;
  (profile.samples ?? []).forEach((id, index) => {
    time += profile.timeDeltas?.[index] ?? 0;
    samples.push({ ts: time, node: id });
  });
  return { nodes, samples };
}

const shortUrl = (url: string) => {
  const match = url.match(/\/([^/?#]+)(?:[?#].*)?$/);
  return match ? match[1] : url;
};

function key(node: Node) {
  return node.url ? `${node.name} ${shortUrl(node.url)}:${node.line + 1}` : node.name;
}

interface Task {
  ts: number;
  dur: number;
}

interface Breakdown {
  self: Map<string, number>;
  total: Map<string, number>;
  ms: number;
}

function attribute(
  nodes: Map<number, Node>,
  samples: Sample[],
  windows: { from: number; to: number }[],
  intervalCap = 2000,
): Breakdown {
  const self = new Map<string, number>();
  const total = new Map<string, number>();
  let ms = 0;
  let w = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    const sample = samples[i];
    const dt = Math.min(samples[i + 1].ts - sample.ts, intervalCap) / 1000;
    while (w < windows.length && windows[w].to <= sample.ts) w++;
    if (w >= windows.length) break;
    if (sample.ts < windows[w].from) continue;
    const leaf = nodes.get(sample.node);
    if (!leaf || leaf.name === '(idle)') continue;
    ms += dt;
    const leafKey = key(leaf);
    self.set(leafKey, (self.get(leafKey) ?? 0) + dt);
    const seen = new Set<string>();
    for (let node: Node | undefined = leaf; node; node = node.parent ? nodes.get(node.parent) : undefined) {
      const k = key(node);
      if (seen.has(k)) continue;
      seen.add(k);
      total.set(k, (total.get(k) ?? 0) + dt);
    }
  }
  return { self, total, ms };
}

function topOf(map: Map<string, number>, n: number) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/** Top-level tasks of the main thread in the window, and per-category self time inside long ones. */
function taskAnalysis(events: TraceEvent[], pid: number, tid: number, startUs: number, endUs: number) {
  const mine = events
    .filter((event) => event.pid === pid && event.tid === tid && event.ph === 'X' && typeof event.dur === 'number')
    .sort((a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0));
  const tasks: Task[] = [];
  let taskEnd = -Infinity;
  for (const event of mine) {
    if (event.name !== TASK_EVENT || event.ts < taskEnd) continue;
    taskEnd = event.ts + event.dur!;
    if (event.ts >= startUs && event.ts < endUs) tasks.push({ ts: event.ts, dur: event.dur! });
  }
  // Self time by category inside long tasks; forced layout/style (nested inside script) counted apart.
  const longTasks = tasks.filter((task) => task.dur >= 50_000);
  const cats: Record<string, number> = {};
  let forcedLayout = 0;
  let forcedLayoutMs = 0;
  let forcedStyle = 0;
  let forcedStyleMs = 0;
  let layouts = 0;
  let styles = 0;
  const stack: TraceEvent[] = [];
  const selfOf = new Map<TraceEvent, number>();
  for (const event of mine) {
    if (event.ts < startUs || event.ts >= endUs) continue;
    while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur! <= event.ts) stack.pop();
    const parent = stack[stack.length - 1];
    selfOf.set(event, event.dur!);
    if (parent)
      selfOf.set(parent, (selfOf.get(parent) ?? 0) - Math.min(event.dur!, parent.ts + parent.dur! - event.ts));
    if (event.name === 'Layout' || event.name === 'UpdateLayoutTree') {
      const inScript = stack.some((outer) => categorize(outer.name) === 'script');
      if (event.name === 'Layout') {
        layouts++;
        if (inScript) {
          forcedLayout++;
          forcedLayoutMs += event.dur! / 1000;
        }
      } else {
        styles++;
        if (inScript) {
          forcedStyle++;
          forcedStyleMs += event.dur! / 1000;
        }
      }
    }
    stack.push(event);
  }
  for (const [event, self] of selfOf) {
    const inLong = longTasks.some((task) => event.ts >= task.ts && event.ts < task.ts + task.dur);
    if (!inLong) continue;
    const category = categorize(event.name);
    cats[category] = (cats[category] ?? 0) + Math.max(0, self) / 1000;
  }
  return {
    taskCount: tasks.length,
    longTasks: longTasks.map((task) => Math.round(task.dur / 1000)),
    longTaskCategoriesMs: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, Math.round(v)])),
    layouts,
    styles,
    forcedLayout,
    forcedLayoutMs: Math.round(forcedLayoutMs),
    forcedStyle,
    forcedStyleMs: Math.round(forcedStyleMs),
    longWindows: longTasks.map((task) => ({ from: task.ts, to: task.ts + task.dur })),
    allWindow: [{ from: startUs, to: endUs }],
  };
}

async function profileOnce(url: string, scenarioId: string, cpuRate: number) {
  const scenario = scenarioById(scenarioId)!;
  const browser = await chromium.launch({
    args: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'UTC',
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await page.addInitScript({ path: PROBE });
    await page.goto(url, { waitUntil: 'commit' });
    if (!(await pc<boolean>(page, 'waitForCount', CHAT_LIST_ROW, 1, 60_000))) throw new Error('no chat list');
    await pc(page, 'sleep', 2500);
    if (scenario.needs.includes('folders')) {
      await pc(page, 'waitForCount', '.ChatFolders .TabList > [data-file-hover-open]', 2, 5000);
    }
    const cdp = await context.newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    await pc(page, 'sleep', 300);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await browser.startTracing(page, {
      categories: ['devtools.timeline', 'toplevel', 'blink.user_timing', 'v8.execute'],
    });
    await cdp.send('Profiler.start');
    await pc(page, 'start');
    await scenario.run!({ page });
    const sample = await pc<{ longTasks: { duration: number }[] }>(page, 'stop');
    const { profile } = await cdp.send('Profiler.stop');
    const events = parseTrace(await browser.stopTracing());
    const thread = findMainThread(events)!;
    const startUs = markTime(events, 'pc:start', thread)!;
    const endUs = markTime(events, 'pc:end', thread)!;
    const tasks = taskAnalysis(events, thread.pid, thread.tid, startUs, endUs);
    const { nodes, samples } = fromCdpProfile(profile);
    if (process.env.PROF_RAW) {
      writeFileSync(
        `${process.env.PROF_RAW}-${Date.now()}.json`,
        JSON.stringify({ profile, longWindows: tasks.longWindows }),
      );
    }
    return {
      observerLongTasks: sample.longTasks.map((task) => Math.round(task.duration)),
      tasks,
      all: attribute(nodes, samples, tasks.allWindow),
      long: attribute(nodes, samples, tasks.longWindows),
      sampleCount: samples.length,
    };
  } finally {
    await browser.close();
  }
}

function merge(target: Map<string, number>, source: Map<string, number>) {
  for (const [k, v] of source) target.set(k, (target.get(k) ?? 0) + v);
}

async function main() {
  const out = args.out!;
  mkdirSync(out, { recursive: true });
  const apps = args.app!.split(',');
  const dirs: Record<string, string> = {
    dd: args['dd-dir'] ?? join(out, 'dist-dd'),
    tt: join(TT_COPY, 'dist-prof'),
  };
  if (!args['no-build']) {
    if (apps.includes('dd')) {
      process.stdout.write('building dd (unminified)...\n');
      await buildDd(dirs.dd);
    }
    if (apps.includes('tt')) {
      process.stdout.write('building tt (unminified)...\n');
      await buildTt(dirs.tt);
    }
  }
  const runs = Number(args.runs);
  const top = Number(args.top);
  for (const scenarioId of args.scenario!.split(',')) {
    for (const app of apps) {
      const server = await serveDir(dirs[app]);
      const self = new Map<string, number>();
      const total = new Map<string, number>();
      const longSelf = new Map<string, number>();
      const longTotal = new Map<string, number>();
      let ms = 0;
      let longMs = 0;
      const perRun = [];
      try {
        for (let i = 0; i < runs; i++) {
          const result = await profileOnce(server.url + SCENARIO_HASH, scenarioId, Number(args.cpu));
          merge(self, result.all.self);
          merge(total, result.all.total);
          merge(longSelf, result.long.self);
          merge(longTotal, result.long.total);
          ms += result.all.ms;
          longMs += result.long.ms;
          const { longWindows, allWindow, ...taskInfo } = result.tasks;
          void longWindows;
          void allWindow;
          perRun.push({ observerLongTasks: result.observerLongTasks, ...taskInfo, samples: result.sampleCount });
          process.stdout.write(`${app} ${scenarioId} run ${i + 1}: ${JSON.stringify(perRun.at(-1))}\n`);
        }
      } finally {
        await server.close();
      }
      const per = (value: number) => Math.round((value / runs) * 10) / 10;
      const report = {
        app,
        scenario: scenarioId,
        runs,
        busyMsPerRun: per(ms),
        busyInLongTasksMsPerRun: per(longMs),
        perRun,
        selfAll: topOf(self, top).map(([k, v]) => [k, per(v)]),
        totalAll: topOf(total, top).map(([k, v]) => [k, per(v)]),
        selfLong: topOf(longSelf, top).map(([k, v]) => [k, per(v)]),
        totalLong: topOf(longTotal, top).map(([k, v]) => [k, per(v)]),
      };
      writeFileSync(join(out, `${app}-${scenarioId}.json`), JSON.stringify(report, undefined, 2));
      process.stdout.write(
        `\n== ${app} ${scenarioId}: busy ${report.busyMsPerRun} ms/run, inside long tasks ${report.busyInLongTasksMsPerRun} ms/run\n`,
      );
      process.stdout.write('-- self (inside long tasks), ms per run\n');
      for (const [k, v] of report.selfLong.slice(0, 25)) process.stdout.write(`${String(v).padStart(8)}  ${k}\n`);
      process.stdout.write('-- total (inside long tasks), ms per run\n');
      for (const [k, v] of report.totalLong.slice(0, 40)) process.stdout.write(`${String(v).padStart(8)}  ${k}\n`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exit(1);
});
