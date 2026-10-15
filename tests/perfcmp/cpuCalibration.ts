// Calibrated CPU throttling for the performance gates (tests/perf) and `pnpm perf:compare`.
//
// `Emulation.setCPUThrottlingRate(4)` slows the machine it runs on by 4: on a slower machine "4x" is a slower device than on
// a faster one, so a millisecond cap measured on one machine does not hold on another (PR #16: 78 ms locally, 147 ms on a GitHub
// runner, same code, same "4x"). Like Lighthouse's `benchmarkIndex`, a fixed JS workload is timed in the browser before the
// throttling is set, and the throttling rate is scaled by how fast this machine is against the machine the caps were set on:
//
//   rate = targetRate * referenceMs / measuredMs      (clamped to [1, 8])
//
// A faster machine is throttled more, a slower one less, so "the target device" (the reference machine at 4x) is the same
// everywhere. A machine so slow that even rate 1 is faster than the target device cannot run the gate honestly: it fails
// with a message instead of passing. docs/quality-gates.md ("Calibrated throttling") says how to re-measure the reference.
import type { BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const MIN_RATE = 1;
export const MAX_RATE = 8;

export interface CpuReference {
  /** The throttling rate on the reference machine that defines the target device. */
  targetRate: number;
  /** Median time of `cpuBenchmark` on the reference machine at low load, ms. */
  referenceMs: number;
  /** `cpuBenchmark` revision the reference was measured with: change the workload, bump this, re-measure. */
  benchmark: number;
  /** For humans: where and when it was measured. */
  measuredOn?: string;
}

export const CPU_REFERENCE_FILE = join(import.meta.dirname, 'cpu-reference.json');

export function readCpuReference(file = CPU_REFERENCE_FILE): CpuReference {
  const reference = JSON.parse(readFileSync(file, 'utf8')) as CpuReference;
  if (!(reference.referenceMs > 0) || !(reference.targetRate >= MIN_RATE)) {
    throw new Error(`${file}: referenceMs and targetRate must be positive numbers`);
  }
  if (reference.benchmark !== CPU_BENCHMARK_REVISION) {
    throw new Error(
      `${file}: measured with benchmark revision ${reference.benchmark}, the workload is revision ${CPU_BENCHMARK_REVISION}: ` +
        'run `pnpm perf:calibrate --write` on the reference machine at low load',
    );
  }
  return reference;
}

export interface CpuCalibration {
  /** The rate to pass to `Emulation.setCPUThrottlingRate`. */
  rate: number;
  /** Unclamped `targetRate * referenceMs / measuredMs`. */
  rawRate: number;
  targetRate: number;
  referenceMs: number;
  /** Median of the benchmark on this machine now, ms; undefined when the rate was forced. */
  measuredMs?: number;
  /** Every benchmark sample, ms. */
  samples?: number[];
  forced: boolean;
  clamped?: 'min' | 'max';
  /** The machine is faster than the target device even without throttling: the gate cannot be run honestly here. */
  belowTarget: boolean;
}

/** The pure part: the throttling rate for a machine whose benchmark took `measuredMs`. */
export function computeRate(input: {
  referenceMs: number;
  measuredMs: number;
  targetRate?: number;
}): Pick<CpuCalibration, 'rate' | 'rawRate' | 'clamped' | 'belowTarget'> {
  const { referenceMs, measuredMs, targetRate = 4 } = input;
  if (!(referenceMs > 0) || !(measuredMs > 0) || !Number.isFinite(measuredMs)) {
    throw new Error(`cannot calibrate: referenceMs=${referenceMs}, measuredMs=${measuredMs}`);
  }
  const rawRate = (targetRate * referenceMs) / measuredMs;
  if (rawRate < MIN_RATE) return { rate: MIN_RATE, rawRate, clamped: 'min', belowTarget: true };
  if (rawRate > MAX_RATE) return { rate: MAX_RATE, rawRate, clamped: 'max', belowTarget: false };
  return { rate: Math.round(rawRate * 100) / 100, rawRate, belowTarget: false };
}

/** Median of a non-empty list (the mean of the two middle values for an even count). */
export function median(values: number[]): number {
  if (!values.length) throw new Error('median of nothing');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** A forced rate (`--cpu 4`, `PERF_CPU_RATE=4`, `cpuThrottlingRate: 4`): no benchmark, the number as it is. */
export function forcedCalibration(rate: number, reference = readCpuReference()): CpuCalibration {
  if (!(rate >= MIN_RATE && rate <= 20)) throw new Error(`CPU throttling rate must be in [1, 20], got ${rate}`);
  return {
    rate,
    rawRate: rate,
    targetRate: reference.targetRate,
    referenceMs: reference.referenceMs,
    forced: true,
    belowTarget: false,
  };
}

/** `auto` or a number (a CLI value, an env var, an option). `undefined` and '' mean auto. */
export function parseRate(value: string | number | undefined): number | 'auto' {
  if (value === undefined || value === '' || value === 'auto') return 'auto';
  const rate = Number(value);
  if (!Number.isFinite(rate)) throw new Error(`CPU throttling rate must be a number or "auto", got "${value}"`);
  return rate;
}

export function describeCalibration(calibration: CpuCalibration): string {
  if (calibration.forced) return `CPU throttling x${calibration.rate} (forced; no benchmark)`;
  const samples = calibration.samples?.map((sample) => sample.toFixed(1)).join(', ');
  return (
    `CPU benchmark ${calibration.measuredMs!.toFixed(1)} ms (reference ${calibration.referenceMs} ms, samples ${samples}) ` +
    `-> CPU throttling x${calibration.rate} (target x${calibration.targetRate}` +
    `${calibration.clamped ? `, raw ${calibration.rawRate.toFixed(2)} clamped to ${calibration.rate}` : ''})`
  );
}

/** The failure for a machine below the target device (a clear message, never a silent pass). */
export function belowTargetMessage(calibration: CpuCalibration): string {
  return (
    `this machine is below the target device of the perf gates: the CPU benchmark took ${calibration.measuredMs!.toFixed(1)} ms ` +
    `against the reference ${calibration.referenceMs} ms, so even without throttling it is ${calibration.rawRate.toFixed(2)}x ` +
    `as slow as the target (x${calibration.targetRate} on the reference machine) needs. The millisecond caps cannot be checked ` +
    'honestly here; run the gate on a faster machine (or force a rate with PERF_CPU_RATE, knowing what it means).'
  );
}

/** Bump when the workload in cpuBenchmark.js changes (the reference must be measured again). */
export const CPU_BENCHMARK_REVISION = 1;

/** The benchmark as source text for the page (the `export` keyword removed). */
export const benchmarkSource = () =>
  readFileSync(join(import.meta.dirname, 'cpuBenchmark.js'), 'utf8').replace(/^export /m, '');

export const BENCHMARK_ROUNDS = 7;
export const BENCHMARK_WARMUP = 1;

/** Times the benchmark in a blank page of `context` (the throttling of the app's page is not touched). */
export async function measureCpuBenchmark(
  context: BrowserContext,
  { rounds = BENCHMARK_ROUNDS, warmup = BENCHMARK_WARMUP } = {},
): Promise<{ medianMs: number; samples: number[] }> {
  const page = await context.newPage();
  try {
    await page.goto('about:blank');
    const { samples } = (await page.evaluate(`(${benchmarkSource()})(${JSON.stringify({ rounds, warmup })})`)) as {
      samples: number[];
    };
    return { medianMs: median(samples), samples };
  } finally {
    await page.close().catch(() => undefined);
  }
}

/**
 * The rate for the machine the context's browser runs on. `forced` (a number) skips the benchmark. The result is
 * returned even when the machine is below the target (`belowTarget`): the caller decides to fail (the gates) or to warn.
 */
export async function calibrateCpu(
  context: BrowserContext,
  forced: number | 'auto' = 'auto',
  reference = readCpuReference(),
): Promise<CpuCalibration> {
  if (forced !== 'auto') return forcedCalibration(forced, reference);
  const { medianMs, samples } = await measureCpuBenchmark(context);
  const computed = computeRate({
    referenceMs: reference.referenceMs,
    measuredMs: medianMs,
    targetRate: reference.targetRate,
  });
  return {
    ...computed,
    targetRate: reference.targetRate,
    referenceMs: reference.referenceMs,
    measuredMs: medianMs,
    samples,
    forced: false,
  };
}
