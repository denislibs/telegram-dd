// `tsx tests/perfcmp/keycount.ts --dd-dir D --tt-dir T [--chars 20] [--cpu 4]`: what ONE keystroke (and one send) costs in
// each app, by count. Opens the typing scenario's chat, types and sends one warm-up message, then types `chars`
// characters exactly as the `typing` scenario does (keydown, insertText, keyup, two frames), then sends.
//   - function call counts (CDP precise coverage, callCount) per keystroke and for the send, mapped to source with the
//     build's source map (build with `profile.ts --sourcemap --build-only`);
//   - DOM mutation records per keystroke, grouped by the target's nearest classed ancestor;
//   - trace events per keystroke: style recalcs, layouts (forced = inside script), paints.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { SCENARIO_HASH, serveDir } from './apps';
import { CHAT_LIST_ROW, pc } from './scenarios';
import { categorize, findMainThread, parseTrace, type TraceEvent } from './trace';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SourceMapConsumer } = (await import(
  join(import.meta.dirname, '../../node_modules/.pnpm/source-map-js@1.2.2/node_modules/source-map-js/source-map.js')
)) as { SourceMapConsumer: new (raw: unknown) => SourceMapLike };

interface SourceMapLike {
  originalPositionFor(pos: { line: number; column: number }): {
    source: string | null;
    line: number | null;
    name: string | null;
  };
}

const { values: args } = parseArgs({
  options: {
    'dd-dir': { type: 'string' },
    'tt-dir': { type: 'string' },
    app: { type: 'string', default: 'dd,tt' },
    chars: { type: 'string', default: '20' },
    cpu: { type: 'string', default: '4' },
    out: { type: 'string', default: '.cache/keycount' },
    top: { type: 'string', default: '80' },
    messages: { type: 'string', default: '0' },
    rest: { type: 'string', default: '100' },
    warmup: { type: 'string', default: '1' },
    coverage: { type: 'boolean', default: true },
    'no-coverage': { type: 'boolean', default: false },
  },
});

const PROBE = join(import.meta.dirname, 'probe.js');

async function countsOf(
  cdp: import('@playwright/test').CDPSession,
  scripts: Map<string, { url: string; map?: SourceMapLike; lineStarts: number[] }>,
) {
  const { result } = (await cdp.send('Profiler.takePreciseCoverage')) as {
    result: {
      scriptId: string;
      url: string;
      functions: { functionName: string; ranges: { startOffset: number; endOffset: number; count: number }[] }[];
    }[];
  };
  const counts = new Map<string, number>();
  let total = 0;
  for (const script of result) {
    const info = scripts.get(script.scriptId);
    for (const fn of script.functions) {
      const count = fn.ranges[0]?.count ?? 0;
      if (!count) continue;
      total += count;
      let where = `${script.url.split('/').pop()}@${fn.ranges[0].startOffset}`;
      if (info) {
        const offset = fn.ranges[0].startOffset;
        let lo = 0;
        let hi = info.lineStarts.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (info.lineStarts[mid] <= offset) lo = mid;
          else hi = mid - 1;
        }
        const line = lo + 1;
        const column = offset - info.lineStarts[lo];
        if (info.map) {
          const original = info.map.originalPositionFor({ line, column });
          if (original.source) {
            where = `${original.source.replace(/^.*?(src\/|node_modules\/)/, '$1').replace(/^node_modules\/.pnpm\/[^/]+\/node_modules\//, '')}:${original.line}`;
          }
        } else {
          where = `${script.url.split('/').pop()}:${line}`;
        }
      }
      const key = `${fn.functionName || '(anon)'} ${where}`;
      counts.set(key, (counts.get(key) ?? 0) + count);
    }
  }
  return { counts, total };
}

function traceCounts(events: TraceEvent[], from: string, to: string) {
  const thread = findMainThread(events)!;
  const mark = (name: string) =>
    events.find(
      (event) =>
        event.name === name &&
        event.pid === thread.pid &&
        (event.ph === 'R' || event.ph === 'I' || event.ph === 'n' || event.ph === 'b'),
    )?.ts;
  const start = mark(from);
  const end = mark(to);
  if (start === undefined || end === undefined) return undefined;
  const mine = events
    .filter(
      (event) =>
        event.pid === thread.pid && event.tid === thread.tid && event.ph === 'X' && event.ts >= start && event.ts < end,
    )
    .sort((a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0));
  const reasons: Record<string, number> = {};
  const out = {
    styles: 0,
    styleMs: 0,
    layouts: 0,
    layoutMs: 0,
    forcedLayouts: 0,
    forcedStyles: 0,
    paints: 0,
    paintMs: 0,
    scriptMs: 0,
    styleElements: 0,
    layoutObjects: 0,
  };
  const openEvents: TraceEvent[] = [];
  for (const event of mine) {
    while (
      openEvents.length &&
      openEvents[openEvents.length - 1].ts + openEvents[openEvents.length - 1].dur! <= event.ts
    ) {
      openEvents.pop();
    }
    const inScript = openEvents.some((outer) => categorize(outer.name) === 'script');
    const category = categorize(event.name);
    if (event.name === 'UpdateLayoutTree') {
      out.styles++;
      out.styleMs += event.dur! / 1000;
      if (inScript) {
        out.forcedStyles++;
        const stack = (
          event.args?.beginData as
            | { stackTrace?: { functionName: string; url: string; lineNumber: number; columnNumber: number }[] }
            | undefined
        )?.stackTrace;
        const k =
          'S ' +
          (stack
            ? stack
                .slice(0, 3)
                .map((f) => frameKey(f))
                .join(' < ')
            : '?');
        reasons[k] = (reasons[k] ?? 0) + 1;
      }
      const count = (event.args?.elementCount as number | undefined) ?? 0;
      out.styleElements += count;
    } else if (event.name === 'Layout') {
      out.layouts++;
      out.layoutMs += event.dur! / 1000;
      if (inScript) {
        out.forcedLayouts++;
        const stack = (
          event.args?.beginData as
            | { stackTrace?: { functionName: string; url: string; lineNumber: number; columnNumber: number }[] }
            | undefined
        )?.stackTrace;
        const k =
          'L ' +
          (stack
            ? stack
                .slice(0, 3)
                .map((f) => frameKey(f))
                .join(' < ')
            : '?');
        reasons[k] = (reasons[k] ?? 0) + 1;
      }
      const begin = event.args?.beginData as { dirtyObjects?: number } | undefined;
      out.layoutObjects += begin?.dirtyObjects ?? 0;
    } else if (event.name === 'Paint') {
      out.paints++;
      out.paintMs += event.dur! / 1000;
    } else if (category === 'script' && !openEvents.some((outer) => categorize(outer.name) === 'script')) {
      out.scriptMs += event.dur! / 1000;
    }
    openEvents.push(event);
  }
  return { ...out, reasons } as typeof out & { reasons: Record<string, number> };
}

const mapCache = new Map<string, SourceMapLike | false>();
let mapDir = '';
function frameKey(f: { functionName: string; url: string; lineNumber: number; columnNumber: number }) {
  const file = f.url.split('/').pop() ?? '';
  let map = mapCache.get(file);
  if (map === undefined) {
    const path = join(mapDir, 'assets', `${file}.map`);
    map = existsSync(path) ? new SourceMapConsumer(JSON.parse(readFileSync(path, 'utf8'))) : false;
    mapCache.set(file, map);
  }
  if (map) {
    const o = map.originalPositionFor({ line: f.lineNumber + 1, column: f.columnNumber });
    if (o.source) {
      return `${f.functionName || '(anon)'} ${o.source.replace(/^.*?(src\/|node_modules\/)/, '$1').replace(/^node_modules\/.pnpm\/[^/]+\/node_modules\//, '')}:${o.line}`;
    }
  }
  return `${f.functionName || '(anon)'} ${file}:${f.lineNumber + 1}`;
}

async function measure(app: string, dir: string) {
  mapDir = dir;
  mapCache.clear();
  const server = await serveDir(dir);
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
    await page.addInitScript({ path: join(import.meta.dirname, 'keycount-page.js') });
    const cdp = await context.newCDPSession(page);
    const scripts = new Map<string, { url: string; map?: SourceMapLike; lineStarts: number[] }>();
    await cdp.send('Debugger.enable');
    cdp.on('Debugger.scriptParsed', (event: { scriptId: string; url: string }) => {
      if (!event.url.startsWith(server.url)) return;
      const file = join(dir, new URL(event.url).pathname);
      if (!existsSync(file)) return;
      const source = readFileSync(file, 'utf8');
      const lineStarts = [0];
      for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) lineStarts.push(i + 1);
      const mapFile = `${file}.map`;
      scripts.set(event.scriptId, {
        url: event.url,
        lineStarts,
        map: existsSync(mapFile) ? new SourceMapConsumer(JSON.parse(readFileSync(mapFile, 'utf8'))) : undefined,
      });
    });
    await cdp.send('Profiler.enable');
    const withCoverage = !args['no-coverage'];
    if (withCoverage) await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
    await page.goto(server.url + SCENARIO_HASH, { waitUntil: 'commit' });
    if (!(await pc<boolean>(page, 'waitForCount', CHAT_LIST_ROW, 1, 60_000))) throw new Error('no chat list');
    await pc(page, 'sleep', 2500);
    await pc<boolean>(page, 'openFirstChat', 5);
    await pc<boolean>(page, 'waitForCount', '#editable-message-text[contenteditable="true"]', 1, 20000);
    await pc(page, 'sleep', 1500);
    // Warm-up: one message typed and sent (lazy chunks, tooltips, first-send paths).
    if (args.warmup !== '0') {
      await page.evaluate(async () => {
        const kc = (
          window as unknown as {
            __kc: { type(n: number, t?: string): Promise<void>; send(ms: number, t?: string): Promise<void> };
          }
        ).__kc;
        await kc.type(20, 'w');
        await kc.send(1500, 'w');
      });
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(args.cpu) });
    await pc(page, 'sleep', 500);
    const chars = Number(args.chars);
    await browser.startTracing(page, {
      categories: [
        'devtools.timeline',
        'toplevel',
        'blink.user_timing',
        'v8.execute',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.stack',
      ],
    });
    const messages = Number(args.messages);
    if (messages > 0) {
      if (withCoverage) await countsOf(cdp, scripts);
      const keyCounts = new Map<string, number>();
      const sendCounts = new Map<string, number>();
      const add = (into: Map<string, number>, from: Map<string, number>) => {
        for (const [k, v] of from) into.set(k, (into.get(k) ?? 0) + v);
      };
      let keyMut = 0;
      const keyScrolls = new Map<string, number>();
      const keyTargets = new Map<string, number>();
      let sendMut = 0;
      for (let m = 0; m < messages; m++) {
        await page.evaluate(() => (window as unknown as { __kc: { reset(): void } }).__kc.reset());
        await page.evaluate(
          ([n, tag]) =>
            (window as unknown as { __kc: { type(n: number, t: string): Promise<void> } }).__kc.type(n, tag),
          [chars, `m${m}_`] as const,
        );
        const taken = await page.evaluate(() =>
          (
            window as unknown as {
              __kc: {
                take(): { kinds: { records: number }; byTarget: [string, number][]; scrolls: [string, number][] };
              };
            }
          ).__kc.take(),
        );
        keyMut += taken.kinds.records;
        for (const [k, v] of taken.scrolls) keyScrolls.set(k, (keyScrolls.get(k) ?? 0) + v);
        for (const [k, v] of taken.byTarget) keyTargets.set(k, (keyTargets.get(k) ?? 0) + v);
        if (withCoverage) add(keyCounts, (await countsOf(cdp, scripts)).counts);
        await page.evaluate(() => (window as unknown as { __kc: { reset(): void } }).__kc.reset());
        await page.evaluate(
          ([ms, tag]) =>
            (window as unknown as { __kc: { send(ms: number, t: string): Promise<void> } }).__kc.send(ms, tag),
          [Number(args.rest), `m${m}`] as const,
        );
        sendMut += (
          await page.evaluate(() =>
            (window as unknown as { __kc: { take(): { kinds: { records: number } } } }).__kc.take(),
          )
        ).kinds.records;
        if (withCoverage) add(sendCounts, (await countsOf(cdp, scripts)).counts);
      }
      const events = parseTrace(await browser.stopTracing());
      {
        const thread = findMainThread(events)!;
        const a = events.find((e) => e.name === 'kc:keym3_0')?.ts ?? 0;
        const b = events.find((e) => e.name === 'kc:typedm3_')?.ts ?? 0;
        writeFileSync(
          join(args.out, `${app}-trace-m3.json`),
          JSON.stringify(events.filter((e) => e.pid === thread.pid && e.ts >= a && e.ts <= b)),
        );
        writeFileSync(
          join(args.out, `${app}-trace-main.json`),
          JSON.stringify(events.filter((e) => e.pid === thread.pid && e.tid === thread.tid && e.ph !== 'M')),
        );
      }
      const sum = (pairs: [string, string][]) => {
        const out: Record<string, number> = {};
        for (const [a, b] of pairs) {
          const part = traceCounts(events, a, b);
          if (!part) continue;
          for (const [k, v] of Object.entries(part)) {
            if (k === 'reasons') {
              for (const [r, c] of Object.entries(v as Record<string, number>)) {
                out[`reason ${r}`] = (out[`reason ${r}`] ?? 0) + c;
              }
            } else out[k] = (out[k] ?? 0) + (v as number);
          }
        }
        return out;
      };
      const keyWin: [string, string][] = [];
      const sendWin: [string, string][] = [];
      const perMessage = [];
      for (let m = 0; m < messages; m++) {
        keyWin.push([`kc:keym${m}_0`, `kc:typedm${m}_`]);
        sendWin.push([`kc:sendm${m}`, `kc:sentm${m}`]);
        const k1 = traceCounts(events, `kc:keym${m}_0`, `kc:typedm${m}_`);
        const s1 = traceCounts(events, `kc:sendm${m}`, `kc:sentm${m}`);
        perMessage.push({ keys: { ...k1, reasons: undefined }, send: { ...s1, reasons: undefined } });
      }
      const total = (map: Map<string, number>) => [...map.values()].reduce((a, b) => a + b, 0);
      const top = Number(args.top);
      const sorted = (map: Map<string, number>, div: number) =>
        [...map.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, top)
          .map(([k, v]) => [Math.round((v / div) * 100) / 100, k] as const);
      return {
        app,
        chars,
        messages,
        keys: {
          callsPerKey: total(keyCounts) / (chars * messages),
          mutationsPerKey: keyMut / (chars * messages),
          trace: sum(keyWin),
          top: sorted(keyCounts, chars * messages),
          all: [...keyCounts.entries()],
        },
        sends: {
          callsPerSend: total(sendCounts) / messages,
          mutationsPerSend: sendMut / messages,
          trace: sum(sendWin),
          top: sorted(sendCounts, messages),
          all: [...sendCounts.entries()],
        },
        perMessage,
        keyScrolls: [...keyScrolls.entries()],
        keyTargets: [...keyTargets.entries()].sort((a, b) => b[1] - a[1]),
      };
    }
    await countsOf(cdp, scripts); // reset
    await page.evaluate(() => (window as unknown as { __kc: { reset(): void } }).__kc.reset());
    await page.evaluate((n) => (window as unknown as { __kc: { type(n: number): Promise<void> } }).__kc.type(n), chars);
    const typingMutations = await page.evaluate(() => (window as unknown as { __kc: { take(): unknown } }).__kc.take());
    const typing = await countsOf(cdp, scripts);
    await page.evaluate(() => (window as unknown as { __kc: { reset(): void } }).__kc.reset());
    await page.evaluate(() => (window as unknown as { __kc: { send(ms: number): Promise<void> } }).__kc.send(2500));
    const sendMutations = await page.evaluate(() => (window as unknown as { __kc: { take(): unknown } }).__kc.take());
    const send = await countsOf(cdp, scripts);
    const events = parseTrace(await browser.stopTracing());
    const typingTrace = traceCounts(events, 'kc:key0', 'kc:typed');
    const sendTrace = traceCounts(events, 'kc:send', 'kc:sent');
    const top = Number(args.top);
    const perKey = (map: Map<string, number>) =>
      [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, top)
        .map(([k, v]) => [Math.round((v / chars) * 100) / 100, k] as const);
    const sorted = (map: Map<string, number>) =>
      [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, top)
        .map(([k, v]) => [v, k] as const);
    return {
      app,
      chars,
      typing: {
        callsPerKey: typing.total / chars,
        mutations: typingMutations,
        trace: typingTrace,
        top: perKey(typing.counts),
        all: [...typing.counts.entries()],
      },
      send: {
        calls: send.total,
        mutations: sendMutations,
        trace: sendTrace,
        top: sorted(send.counts),
        all: [...send.counts.entries()],
      },
    };
  } finally {
    await browser.close();
    await server.close();
  }
}

mkdirSync(args.out, { recursive: true });
const dirs: Record<string, string | undefined> = { dd: args['dd-dir'], tt: args['tt-dir'] };
for (const app of args.app.split(',')) {
  const dir = dirs[app];
  if (!dir) throw new Error(`--${app}-dir is required`);
  const result = (await measure(app, dir)) as any;
  writeFileSync(join(args.out, `${app}.json`), JSON.stringify(result, undefined, 1));
  if (result.messages) {
    const r = (o: Record<string, number>) =>
      JSON.stringify(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 10) / 10])));
    const plain = (o: Record<string, number>) =>
      Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('reason ')));
    const reasons = (o: Record<string, number>) =>
      Object.entries(o)
        .filter(([k]) => k.startsWith('reason '))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 14)
        .map(([k, v]) => `    ${String(v).padStart(5)} ${k.slice(7)}`)
        .join('\n');
    process.stdout.write(
      `\n== ${app}: ${result.messages} messages x ${result.chars} keys\n keys: ${result.keys.callsPerKey.toFixed(0)} calls/key, ${result.keys.mutationsPerKey.toFixed(2)} mutation records/key, trace ${r(plain(result.keys.trace))}\n  forced, by JS stack:\n${reasons(result.keys.trace)}\n sends: ${result.sends.callsPerSend.toFixed(0)} calls/send, ${result.sends.mutationsPerSend.toFixed(1)} records/send, trace ${r(plain(result.sends.trace))}\n  forced, by JS stack:\n${reasons(result.sends.trace)}\n`,
    );
    continue;
  }
  const t = result.typing;
  process.stdout.write(
    `\n== ${app}: ${t.callsPerKey.toFixed(0)} JS function calls per keystroke; mutations ${JSON.stringify(t.mutations.kinds)} over ${result.chars} keys\n` +
      `trace (all ${result.chars} keys): ${JSON.stringify(t.trace)}\nsend: ${result.send.calls} calls; mutations ${JSON.stringify(result.send.mutations.kinds)}; trace ${JSON.stringify(result.send.trace)}\n`,
  );
  for (const [v, k] of t.top.slice(0, 50)) process.stdout.write(`${String(v).padStart(8)}  ${k}\n`);
}
