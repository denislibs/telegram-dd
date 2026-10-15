// `tsx tests/perfcmp/leakcheck.ts --dir <unminified build> --mode cycle|type|switch|codeblock [--runs 20] [--warmup 30]`:
// heap snapshots around the composer leak-gate cycles, counted by constructor name. Three snapshots: after the warm-up (A),
// after `runs` cycles (B), after `runs` more (C). Prints the per-cycle growth by name (count / self size) between A-B and
// B-C, and the live count of the composer's objects (tiptap Editor, EditorView, Marked, MarkdownManager, TeactNodeView,
// frameact nodes, detached DOM) in each snapshot.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { serveDir } from './apps';

const { values: args } = parseArgs({
  options: {
    dir: { type: 'string' },
    mode: { type: 'string', default: 'cycle' },
    runs: { type: 'string', default: '20' },
    warmup: { type: 'string', default: '30' },
    settle: { type: 'string', default: '3000' },
    out: { type: 'string' },
    names: { type: 'string', default: '' },
    save: { type: 'string' },
  },
});

const ROW = '#LeftColumn .chat-list .ListItem.Chat';
const LIST = '#MiddleColumn .MessageList';
const INPUT = '#editable-message-text';
const WATCH = [
  'Editor',
  'EditorView',
  'EditorState',
  'ExtensionManager',
  'Marked',
  'MarkdownManager',
  'TeactNodeView',
  'NodeView',
  'Computation',
  'Effect',
  'SignalNode',
  'Scope',
  'Node',
  'DOMObserver',
  'InputRule',
  'Plugin',
  'PluginKey',
  'Schema',
  'UndoStep',
  'InsertIntoTextNodeCommand',
  'InstructionStream',
  ...args.names.split(',').filter(Boolean),
];

type Snapshot = {
  snapshot: { meta: { node_fields: string[]; node_types: [string[]] } };
  nodes: number[];
  strings: string[];
};

function summarize(snap: Snapshot) {
  const meta = snap.snapshot.meta;
  const nf = meta.node_fields.length;
  const ti = meta.node_fields.indexOf('type');
  const ni = meta.node_fields.indexOf('name');
  const si = meta.node_fields.indexOf('self_size');
  const detI = meta.node_fields.indexOf('detachedness');
  const types = meta.node_types[0];
  const byName = new Map<string, { count: number; size: number }>();
  const byType = new Map<string, { count: number; size: number }>();
  let detachedDom = 0;
  let total = 0;
  for (let i = 0; i < snap.nodes.length; i += nf) {
    const type = types[snap.nodes[i + ti]];
    let name = snap.strings[snap.nodes[i + ni]];
    const size = snap.nodes[i + si];
    total += size;
    if (detI >= 0 && snap.nodes[i + detI] === 2 && type === 'native') detachedDom++;
    if (type === 'code') name = `(code) ${name.startsWith('system /') ? name.split(' ')[1] : 'code'}`;
    else if (type === 'string' || type === 'concatenated string' || type === 'sliced string') name = '(string)';
    else if (type === 'number' || type === 'heap number') name = '(number)';
    else if (type === 'array') name = `(array) ${name}`;
    else if (type === 'hidden') name = `(hidden) ${name.split(' ')[0]}`;
    else if (type === 'closure') name = `(closure)`;
    else if (type === 'object shape') name = '(shape)';
    const entry = byName.get(name) ?? { count: 0, size: 0 };
    entry.count++;
    entry.size += size;
    byName.set(name, entry);
    const t = byType.get(type) ?? { count: 0, size: 0 };
    t.count++;
    t.size += size;
    byType.set(type, t);
  }
  return { byName, byType, detachedDom, total };
}

async function main() {
  if (!args.dir) throw new Error('--dir');
  const server = await serveDir(args.dir);
  const browser = await chromium.launch();
  const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' })
  ).newPage();
  try {
    await page.goto(`${server.url}#?mockScenario=messages`);
    await page.locator(ROW).first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(3000);
    const open = async (name: string) => {
      await (
        name === '#other'
          ? page.locator(`${ROW}.private`).filter({ hasNotText: 'Carol Short' }).first()
          : page.locator(ROW).filter({ hasText: name })
      ).click();
      await page.locator(`${LIST} .message-list-item`).first().waitFor();
      await page.locator(`${INPUT}[contenteditable="true"]`).waitFor();
    };
    const other = '#other';
    let cycle: (i: number) => Promise<void>;
    let codeChecks = 0;
    if (args.mode === 'cycle') {
      cycle = async () => {
        await open('Carol Short');
        await page.locator(INPUT).click();
        await page.keyboard.type('hi');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(150);
        await page.keyboard.press('Escape');
        await page.locator(LIST).waitFor({ state: 'detached' });
        await page.waitForTimeout(150);
      };
    } else if (args.mode === 'codeblock') {
      cycle = async () => {
        await open('Carol Short');
        await page.locator(INPUT).click();
        await page.keyboard.type('``` ');
        await page.keyboard.type('code');
        await page.waitForTimeout(100);
        if (codeChecks++ < 2) {
          process.stdout.write(
            `code block in the input: ${await page.locator(`${INPUT} pre`).count()}, html ${(await page.locator(INPUT).innerHTML()).slice(0, 160)}\n`,
          );
        }
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(150);
        for (let k = 0; k < 3 && (await page.locator(LIST).count()); k++) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(200);
        }
        await page.locator(LIST).waitFor({ state: 'detached' });
        await page.waitForTimeout(150);
      };
    } else if (args.mode === 'switch') {
      cycle = async (i) => {
        await open(i % 2 ? other : 'Carol Short');
        await page.locator(INPUT).click();
        await page.keyboard.type('draft');
        await page.waitForTimeout(150);
      };
    } else {
      await open('Carol Short');
      cycle = async () => {
        await page.locator(INPUT).click();
        await page.keyboard.type('some typed text, never sent');
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(150);
      };
    }
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    const snap = async (label: string) => {
      await page.waitForTimeout(Number(args.settle));
      await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('HeapProfiler.collectGarbage');
      const { usedSize } = await cdp.send('Runtime.getHeapUsage');
      const { nodes, jsEventListeners } = await cdp.send('Memory.getDOMCounters');
      const chunks: string[] = [];
      const handler = (event: { chunk: string }) => chunks.push(event.chunk);
      cdp.on('HeapProfiler.addHeapSnapshotChunk', handler);
      await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, exposeInternals: false });
      cdp.off('HeapProfiler.addHeapSnapshotChunk', handler);
      const raw = chunks.join('');
      if (args.save && label === 'C') writeFileSync(args.save, raw);
      const summary = summarize(JSON.parse(raw) as Snapshot);
      process.stdout.write(
        `${label}: heap ${(usedSize / 1024).toFixed(0)} KB, snapshot ${(summary.total / 1024).toFixed(0)} KB, DOM nodes ${nodes}, listeners ${jsEventListeners}, detached native ${summary.detachedDom}\n`,
      );
      return { usedKb: usedSize / 1024, nodes, listeners: jsEventListeners, ...summary };
    };
    const runs = Number(args.runs);
    let i = 0;
    for (let w = 0; w < Number(args.warmup); w++) await cycle(i++);
    const A = await snap('A');
    for (let r = 0; r < runs; r++) await cycle(i++);
    const B = await snap('B');
    for (let r = 0; r < runs; r++) await cycle(i++);
    const C = await snap('C');
    const diff = (x: typeof A, y: typeof A) =>
      [...new Set([...x.byName.keys(), ...y.byName.keys()])]
        .map((name) => {
          const a = x.byName.get(name) ?? { count: 0, size: 0 };
          const b = y.byName.get(name) ?? { count: 0, size: 0 };
          return { name, count: b.count - a.count, size: b.size - a.size };
        })
        .sort((p, q) => Math.abs(q.size) - Math.abs(p.size));
    const report = {
      mode: args.mode,
      runs,
      heapKb: [A.usedKb, B.usedKb, C.usedKb],
      domNodes: [A.nodes, B.nodes, C.nodes],
      listeners: [A.listeners, B.listeners, C.listeners],
      detached: [A.detachedDom, B.detachedDom, C.detachedDom],
      watch: Object.fromEntries(WATCH.map((name) => [name, [A, B, C].map((s) => s.byName.get(name)?.count ?? 0)])),
      byType: [...new Set([...A.byType.keys(), ...C.byType.keys()])].map((type) => [
        type,
        ((B.byType.get(type)?.size ?? 0) - (A.byType.get(type)?.size ?? 0)) / 1024,
        ((C.byType.get(type)?.size ?? 0) - (B.byType.get(type)?.size ?? 0)) / 1024,
      ]),
      diffAB: diff(A, B).slice(0, 40),
      diffBC: diff(B, C).slice(0, 40),
    };
    if (args.out) writeFileSync(args.out, JSON.stringify(report, undefined, 1));
    process.stdout.write(
      `heap growth A->B ${(B.usedKb - A.usedKb).toFixed(0)} KB, B->C ${(C.usedKb - B.usedKb).toFixed(0)} KB over ${runs} runs each\n`,
    );
    process.stdout.write(`watched counts A / B / C:\n`);
    for (const [name, counts] of Object.entries(report.watch)) {
      process.stdout.write(`  ${name.padEnd(28)} ${counts.join(' / ')}\n`);
    }
    process.stdout.write('growth by node type KB (A->B, B->C):\n');
    for (const [type, ab, bc] of report.byType) {
      process.stdout.write(
        `  ${String(type).padEnd(22)} ${(ab as number).toFixed(1).padStart(8)} ${(bc as number).toFixed(1).padStart(8)}\n`,
      );
    }
    process.stdout.write('top growth by name B->C (count, KB):\n');
    for (const entry of report.diffBC.slice(0, 25)) {
      process.stdout.write(
        `  ${String(entry.count).padStart(6)} ${(entry.size / 1024).toFixed(1).padStart(8)}  ${entry.name}\n`,
      );
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
