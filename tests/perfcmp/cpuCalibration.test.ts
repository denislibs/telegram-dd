import { describe, expect, it } from 'vitest';

import { cpuBenchmark } from './cpuBenchmark';
import {
  belowTargetMessage,
  computeRate,
  CPU_BENCHMARK_REVISION,
  describeCalibration,
  forcedCalibration,
  MAX_RATE,
  median,
  MIN_RATE,
  parseRate,
  readCpuReference,
} from './cpuCalibration';

describe('computeRate', () => {
  it('is the target rate on a machine as fast as the reference', () => {
    expect(computeRate({ referenceMs: 100, measuredMs: 100 })).toEqual({ rate: 4, rawRate: 4, belowTarget: false });
  });

  it('throttles a faster machine more and a slower one less, in proportion', () => {
    expect(computeRate({ referenceMs: 100, measuredMs: 80 }).rate).toBe(5); // 1.25x faster
    expect(computeRate({ referenceMs: 100, measuredMs: 200 }).rate).toBe(2); // 2x slower: the GitHub runner of PR #16
    expect(computeRate({ referenceMs: 100, measuredMs: 150 }).rate).toBe(2.67);
    expect(computeRate({ referenceMs: 100, measuredMs: 100, targetRate: 6 }).rate).toBe(6);
  });

  it('clamps to [1, 8]', () => {
    expect(computeRate({ referenceMs: 100, measuredMs: 25 })).toMatchObject({ rate: 8, rawRate: 16, clamped: 'max' });
    expect(computeRate({ referenceMs: 100, measuredMs: 50 }).clamped).toBeUndefined(); // exactly 8: not clamped
    expect(computeRate({ referenceMs: 100, measuredMs: 400 })).toMatchObject({ rate: 1, rawRate: 1 });
    expect(MIN_RATE).toBe(1);
    expect(MAX_RATE).toBe(8);
  });

  it('a machine too slow for even rate 1 is below the target device (not a silent pass)', () => {
    const slow = computeRate({ referenceMs: 100, measuredMs: 500 });
    expect(slow).toMatchObject({ rate: 1, clamped: 'min', belowTarget: true });
    expect(slow.rawRate).toBeCloseTo(0.8);
    // exactly at the edge is still fine
    expect(computeRate({ referenceMs: 100, measuredMs: 400 }).belowTarget).toBe(false);
  });

  it('refuses a missing or broken measurement', () => {
    expect(() => computeRate({ referenceMs: 100, measuredMs: 0 })).toThrow(/cannot calibrate/);
    expect(() => computeRate({ referenceMs: 100, measuredMs: Number.NaN })).toThrow(/cannot calibrate/);
    expect(() => computeRate({ referenceMs: 0, measuredMs: 100 })).toThrow(/cannot calibrate/);
  });
});

describe('helpers', () => {
  it('median', () => {
    expect(median([5, 1, 9])).toBe(5);
    expect(median([4, 1, 9, 2])).toBe(3);
    expect(() => median([])).toThrow();
  });

  it('parseRate: auto by default, numbers as they are, garbage refused', () => {
    expect(parseRate(undefined)).toBe('auto');
    expect(parseRate('')).toBe('auto');
    expect(parseRate('auto')).toBe('auto');
    expect(parseRate('6')).toBe(6);
    expect(parseRate(2.5)).toBe(2.5);
    expect(() => parseRate('fast')).toThrow(/number or "auto"/);
  });

  it('a forced rate is used as it is and says so', () => {
    const calibration = forcedCalibration(4, { targetRate: 4, referenceMs: 100, benchmark: CPU_BENCHMARK_REVISION });
    expect(calibration).toMatchObject({ rate: 4, forced: true, belowTarget: false });
    expect(describeCalibration(calibration)).toContain('forced');
    expect(() => forcedCalibration(0)).toThrow();
  });

  it('the messages carry the numbers', () => {
    const computed = computeRate({ referenceMs: 100, measuredMs: 500 });
    const calibration = {
      ...computed,
      targetRate: 4,
      referenceMs: 100,
      measuredMs: 500,
      samples: [500],
      forced: false,
    };
    expect(belowTargetMessage(calibration)).toMatch(/below the target device.*500\.0 ms.*reference 100 ms/);
    expect(describeCalibration(calibration)).toMatch(/500\.0 ms.*x1.*clamped/);
  });
});

describe('the committed reference and the benchmark', () => {
  it('the reference file matches the benchmark revision', () => {
    const reference = readCpuReference();
    expect(reference.benchmark).toBe(CPU_BENCHMARK_REVISION);
    expect(reference.targetRate).toBe(4);
    expect(reference.referenceMs).toBeGreaterThan(0);
  });

  it('the benchmark is deterministic: the same checksum every round and every call, one sample per round', () => {
    const first = cpuBenchmark({ rounds: 2, warmup: 1 });
    const second = cpuBenchmark({ rounds: 2, warmup: 1 });
    expect(first.samples).toHaveLength(2);
    expect(first.checksum).toBe(second.checksum);
    // three equal workloads (1 warm-up + 2 rounds): a third of the checksum each
    expect(first.checksum % 3).toBe(0);
    expect(cpuBenchmark({ rounds: 1, warmup: 0 }).checksum * 3).toBe(first.checksum);
    // a changed workload changes this number: re-measure the reference and bump CPU_BENCHMARK_REVISION
    expect(cpuBenchmark({ rounds: 1, warmup: 0 }).checksum).toBe(EXPECTED_CHECKSUM);
  });
});

const EXPECTED_CHECKSUM = 3815336;
