import { type CDPSession, expect, type Page } from '@playwright/test';

export interface LeakOptions {
  /** How many times the action runs between the two heap measurements (default 50). */
  runs?: number;
  /** Allowed JS heap growth over all `runs`, after a forced GC, in KB (default 512). */
  maxGrowthKb?: number;
  /** Unmeasured runs before the baseline, so lazy caches / JIT / first-use allocations do not count (default 5). */
  warmupRuns?: number;
}

export interface LeakResult {
  baselineKb: number;
  finalKb: number;
  growthKb: number;
  growthPerRunKb: number;
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
    for (let i = 0; i < runs; i++) await action(i);
    const finalKb = await usedHeapKb(cdp);

    const growthKb = finalKb - baselineKb;
    const result = { baselineKb, finalKb, growthKb, growthPerRunKb: growthKb / runs };
    expect(
      growthKb,
      `JS heap grew by ${growthKb.toFixed(0)} KB over ${runs} runs (${result.growthPerRunKb.toFixed(1)} KB/run); ` +
        `limit ${maxGrowthKb} KB. Something retains what the action creates.`,
    ).toBeLessThanOrEqual(maxGrowthKb);
    return result;
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}
