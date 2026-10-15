import { type CDPSession, expect, type Page } from '@playwright/test';

export interface LeakOptions {
  /** How many times the action runs between the two heap measurements (default 50). */
  runs?: number;
  /** Allowed JS heap growth over all `runs`, after a forced GC, in KB (default 512); the second half of the runs may add half of it at most. */
  maxGrowthKb?: number;
  /** Unmeasured runs before the baseline, so lazy caches / JIT / first-use allocations do not count (default 5). */
  warmupRuns?: number;
}

export interface LeakResult {
  baselineKb: number;
  finalKb: number;
  growthKb: number;
  growthPerRunKb: number;
  /** Growth over the second half of the runs: JIT code and one-time caches settle early, a leak keeps growing. */
  secondHalfGrowthKb: number;
}

async function usedHeapKb(cdp: CDPSession): Promise<number> {
  // Two passes: the first GC may only schedule finalizers (FinalizationRegistry / weak refs), the second frees what they release.
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return usedSize / 1024;
}

/**
 * Runs `action` `runs` times and fails when the JS heap (after a forced GC) grew by more than `maxGrowthKb` over the
 * runs: the signature of a leak is growth proportional to the number of runs, so keep the action a full
 * open / close (mount / unmount) cycle of the thing under test, not a one-way state change.
 * The measure is `Runtime.getHeapUsage` before and after `HeapProfiler.collectGarbage` (CDP), main thread only.
 */
export async function expectNoLeak(
  page: Page,
  action: (run: number) => Promise<void>,
  { runs = 50, maxGrowthKb = 512, warmupRuns = 5 }: LeakOptions = {},
): Promise<LeakResult> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  try {
    for (let i = 0; i < warmupRuns; i++) await action(-1 - i);

    const baselineKb = await usedHeapKb(cdp);
    const half = Math.floor(runs / 2);
    for (let i = 0; i < half; i++) await action(i);
    const midKb = await usedHeapKb(cdp);
    for (let i = half; i < runs; i++) await action(i);
    const finalKb = await usedHeapKb(cdp);

    const growthKb = finalKb - baselineKb;
    const secondHalfGrowthKb = finalKb - midKb;
    const result = { baselineKb, finalKb, growthKb, growthPerRunKb: growthKb / runs, secondHalfGrowthKb };
    expect(
      growthKb,
      `JS heap grew by ${growthKb.toFixed(0)} KB over ${runs} runs (${result.growthPerRunKb.toFixed(1)} KB/run); ` +
        `limit ${maxGrowthKb} KB. Something retains what the action creates.`,
    ).toBeLessThanOrEqual(maxGrowthKb);
    // A leak is linear: the second half of the runs grows as much as the first. Compiled code and warmed caches are front-loaded,
    // so the second half alone must stay under half of the limit.
    expect(
      secondHalfGrowthKb,
      `JS heap still grew by ${secondHalfGrowthKb.toFixed(0)} KB over the second half of the ${runs} runs; limit ${maxGrowthKb / 2} KB. ` +
        `The growth is not settling: something retains what the action creates.`,
    ).toBeLessThanOrEqual(maxGrowthKb / 2);
    return result;
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}
