// `pnpm perf:calibrate [--write] [--runs 15]`: times the CPU benchmark (tests/perfcmp/cpuCalibration.ts) in headless Chromium
// several times and prints the spread. With --write the lowest median becomes the reference (tests/perfcmp/cpu-reference.json).
// Run it on the reference machine, with nothing else running (`uptime` load below ~2).
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { parseArgs } from 'node:util';

import {
  CPU_BENCHMARK_REVISION,
  CPU_REFERENCE_FILE,
  type CpuReference,
  measureCpuBenchmark,
  median,
  readCpuReference,
} from './cpuCalibration';

const { values } = parseArgs({
  options: { write: { type: 'boolean', default: false }, runs: { type: 'string', default: '15' } },
});

const browser = await chromium.launch();
try {
  const medians: number[] = [];
  for (let i = 0; i < Number(values.runs); i++) {
    const context = await browser.newContext();
    const { medianMs, samples } = await measureCpuBenchmark(context);
    await context.close();
    medians.push(medianMs);
    process.stdout.write(
      `run ${i + 1}: median ${medianMs.toFixed(1)} ms (samples ${samples.map((s) => s.toFixed(1)).join(' ')})\n`,
    );
  }
  const best = Math.min(...medians);
  const uptime = execFileSync('uptime', { encoding: 'utf8' }).trim();
  process.stdout.write(
    `\nmedians: min ${best.toFixed(1)}, median ${median(medians).toFixed(1)}, max ${Math.max(...medians).toFixed(1)} ms\n${uptime}\n`,
  );
  let current: CpuReference | undefined;
  try {
    current = readCpuReference();
  } catch {
    // no reference yet, or an old benchmark revision
  }
  if (current) {
    process.stdout.write(
      `committed reference: ${current.referenceMs} ms (target x${current.targetRate}), measured now: ${best.toFixed(1)} ms\n`,
    );
  }
  if (values.write) {
    const reference: CpuReference = {
      targetRate: current?.targetRate ?? 4,
      referenceMs: Math.round(best * 10) / 10,
      benchmark: CPU_BENCHMARK_REVISION,
      measuredOn: `${cpus()[0]?.model ?? 'unknown'}, ${platform()} ${release()}, Chromium ${browser.version()}, ${new Date().toISOString().slice(0, 10)}, ${uptime.split('load averages:')[1]?.trim() ?? uptime}`,
    };
    writeFileSync(CPU_REFERENCE_FILE, `${JSON.stringify(reference, undefined, 2)}\n`);
    process.stdout.write(`wrote ${CPU_REFERENCE_FILE}\n`);
  } else {
    process.stdout.write('not written (--write to make the lowest median the reference)\n');
  }
} finally {
  await browser.close();
}
