// One measured run: a fresh Chromium, one app, one scenario, CPU throttled, with the probe, a CDP trace and a heap
// reading. Everything a run measures ends up in a flat `MetricValues` object (metrics.ts).
import { type Browser, type BrowserContext, chromium, type Page } from '@playwright/test';
import { loadavg } from 'node:os';
import { join } from 'node:path';

import type { MetricValues } from './metrics';

import { type Capabilities, CHAT_LIST_ROW, pc, type Scenario, type ScenarioOutput } from './scenarios';
import { droppedFrames, longTaskStats } from './stats';
import { analyzeTrace, findMainThread, markTime, maxTaskAfter, parseTrace, TRACE_CATEGORIES } from './trace';

const PROBE = join(import.meta.dirname, 'probe.js');
const VIEWPORT = { width: 1280, height: 800 };

export interface RunConfig {
  /** `Emulation.setCPUThrottlingRate` factor. */
  cpuRate: number;
  /** Record a CDP trace (script / style / layout / paint, longest task). The trace itself costs some CPU, equally in both apps. */
  trace: boolean;
  headed: boolean;
  /** Hard limit of one run, ms. */
  timeoutMs: number;
}

export const DEFAULT_CONFIG: RunConfig = { cpuRate: 4, trace: true, headed: false, timeoutMs: 150_000 };

export interface RunResult {
  metrics: MetricValues;
  /** 1-minute load average of the machine when the run started (see the noise note in the report). */
  load1: number;
  /** Page errors seen during the run (diagnostics; both apps log harmless ones). */
  pageErrors: string[];
}

interface Opened {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  pageErrors: string[];
}

async function open(config: RunConfig, initScripts: string[] = []): Promise<Opened> {
  const browser = await chromium.launch({
    headless: !config.headed,
    // A background-throttled page would flatter whichever app is measured second; keep both at full speed.
    args: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    serviceWorkers: 'block',
  });
  // Both apps: no `navigator.serviceWorker`, so no `./progressive/` URL is requested (decision D1, docs/quality-gates.md).
  await context.addInitScript(() => {
    delete (Navigator.prototype as { serviceWorker?: unknown }).serviceWorker;
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 300)));
  await page.addInitScript({ path: PROBE });
  for (const script of initScripts) await page.addInitScript(script);
  return { browser, context, page, pageErrors };
}

async function heapMb(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('HeapProfiler.enable');
    // Two passes: the first may only schedule finalizers (the same as tests/perf/leaks.ts).
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    const { usedSize } = await cdp.send('Runtime.getHeapUsage');
    return usedSize / 1024 / 1024;
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

async function setThrottle(page: Page, rate: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  // Not detached on purpose: the emulation belongs to the session and would be dropped with it.
}

/** What the app under test can do, found by loading it once (unthrottled). Used to report "n/a" instead of failing. */
export async function preflight(url: string, config: RunConfig): Promise<Capabilities> {
  const { browser, page } = await open(config);
  try {
    await page.goto(url, { waitUntil: 'commit' });
    const hasShell = await pc<boolean>(page, 'waitForCount', '#Main', 1, 30_000).catch(() => false);
    const hasChatList =
      hasShell && (await pc<boolean>(page, 'waitForCount', CHAT_LIST_ROW, 1, 20_000).catch(() => false));
    const hasFolders =
      hasChatList &&
      (await pc<boolean>(page, 'waitForCount', '.ChatFolders .TabList > [data-file-hover-open]', 2, 8000).catch(
        () => false,
      ));
    const canInject = await page.evaluate(
      () => typeof (window as unknown as { getActions?: unknown }).getActions === 'function',
    );
    return { shell: hasShell, chatList: hasChatList, folders: hasFolders, inject: canInject };
  } finally {
    await browser.close();
  }
}

export async function runScenario(url: string, scenario: Scenario, config: RunConfig): Promise<RunResult> {
  const load1 = loadavg()[0];
  const cold = scenario.cold;
  const initScripts = cold
    ? [`window.__pc.watchReady(${JSON.stringify(cold.readySelector)}, 1); window.__pc.start();`]
    : [];
  const { browser, page, pageErrors } = await open(config, initScripts);
  const timer = setTimeout(() => void browser.close().catch(() => undefined), config.timeoutMs);

  try {
    let output: ScenarioOutput = {};

    if (cold) {
      // Throttled and traced from the first byte; the window starts with the document (the init script's pc.start()).
      await setThrottle(page, config.cpuRate);
      if (config.trace) await browser.startTracing(page, { categories: TRACE_CATEGORIES });
      await page.goto(url, { waitUntil: 'commit' });
      await page.waitForFunction(
        () => (window as unknown as { __pc?: { ready(): unknown } }).__pc?.ready() !== undefined,
        undefined,
        {
          timeout: config.timeoutMs - 15_000,
          polling: 100,
        },
      );
      await pc(page, 'sleep', cold.tailMs);
    } else {
      // Boot at full speed, let the app settle, then throttle and measure only the scenario.
      await page.goto(url, { waitUntil: 'commit' });
      const ready = await pc<boolean>(page, 'waitForCount', CHAT_LIST_ROW, 1, 60_000);
      if (!ready) throw new Error('the chat list did not render');
      await pc(page, 'sleep', 2500);
      if (scenario.needs.includes('folders')) {
        await pc(page, 'waitForCount', '.ChatFolders .TabList > [data-file-hover-open]', 2, 5000);
      }
      await heapMb(page); // a forced GC before the window, so a collection scheduled by the boot does not land in it
      await setThrottle(page, config.cpuRate);
      await pc(page, 'sleep', 300);
      if (config.trace) await browser.startTracing(page, { categories: TRACE_CATEGORIES });
      await pc(page, 'start');
      output = (await scenario.run!({ page })) ?? {};
    }

    const sample = await pc<{
      t0: number;
      t1: number;
      readyAt?: number;
      longTasks: { start: number; duration: number }[];
      frames: number[];
      mutations: { records: number };
    }>(page, 'stop');
    const traceBuffer = config.trace ? await browser.stopTracing() : undefined;

    const longTasks = longTaskStats(sample.longTasks);
    const frames = droppedFrames(sample.frames, sample.t0, sample.t1);
    const metrics: MetricValues = {
      longTaskCount: longTasks.count,
      longTaskTotalMs: longTasks.totalMs,
      longTaskMaxMs: longTasks.maxMs,
      tbtMs: longTasks.tbtMs,
      droppedFrames: frames.dropped,
      domMutations: sample.mutations.records,
      windowMs: sample.t1 - sample.t0,
    };
    if (sample.readyAt !== undefined) metrics.readyMs = sample.readyAt;

    if (traceBuffer) {
      const events = parseTrace(traceBuffer);
      const thread = findMainThread(events);
      const startUs = thread && markTime(events, 'pc:start', thread);
      const endUs = thread && markTime(events, 'pc:end', thread);
      if (!thread || startUs === undefined || endUs === undefined) {
        throw new Error('the trace has no probe marks (no main thread found)');
      }
      const trace = analyzeTrace(events, thread, { startUs, endUs });
      Object.assign(metrics, {
        maxTaskMs: trace.maxTaskMs,
        scriptMs: trace.scriptMs,
        styleMs: trace.styleMs,
        layoutMs: trace.layoutMs,
        paintMs: trace.paintMs,
        gcMs: trace.gcMs,
      });
      if (output.animationEnd !== undefined) {
        const releaseUs = markTime(events, 'pc:anim-end', thread);
        if (releaseUs !== undefined) {
          metrics.postReleaseMaxTaskMs = maxTaskAfter(events, thread, releaseUs - 16_000, endUs);
        }
      }
    }

    if (output.animationEnd !== undefined) {
      const release = output.animationEnd - 16;
      metrics.postReleaseLongTaskMs = longTaskStats(sample.longTasks.filter((task) => task.start >= release)).totalMs;
      metrics.droppedDuringAnimation = droppedFrames(sample.frames, sample.t0, output.animationEnd).dropped;
    }
    Object.assign(metrics, output.extra);
    metrics.heapMb = await heapMb(page);

    return { metrics, load1, pageErrors };
  } finally {
    clearTimeout(timer);
    await browser.close().catch(() => undefined);
  }
}
