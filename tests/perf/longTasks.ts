import { type CDPSession, expect, type Page, test } from '@playwright/test';

import {
  belowTargetMessage,
  calibrateCpu,
  type CpuCalibration,
  describeCalibration,
  parseRate,
} from '../perfcmp/cpuCalibration';

export interface LongTasksOptions {
  /**
   * Longest allowed task in ms (default 50). The browser only reports tasks above 50 ms, so values below 50 are the
   * same as 50; raise it to tolerate known slow spots while they are being fixed.
   */
  maxMs?: number;
  /**
   * CPU slowdown factor for the action. Default 'auto' (or the PERF_CPU_RATE environment variable): the rate is calibrated
   * on this machine so that it emulates the target device, "4x on the reference machine" (tests/perfcmp/cpuCalibration.ts,
   * docs/quality-gates.md, "Calibrated throttling"). A number forces that rate, with no benchmark.
   */
  cpuThrottlingRate?: number | 'auto';
}

/** Times the CPU benchmark in a blank page and logs / attaches the result; fails on a machine below the target device. */
export async function calibratedRate(page: Page, requested: number | 'auto' | undefined): Promise<CpuCalibration> {
  const forced = requested ?? parseRate(process.env.PERF_CPU_RATE);
  const calibration = await calibrateCpu(page.context(), forced);
  const line = describeCalibration(calibration);
  process.stdout.write(`[perf] ${line}\n`);
  try {
    await test.info().attach('cpu-calibration', {
      body: JSON.stringify({ line, ...calibration }, undefined, 2),
      contentType: 'application/json',
    });
  } catch {
    // outside a test (no attachments)
  }
  expect(calibration.belowTarget, belowTargetMessage(calibration)).toBe(false);
  return calibration;
}

export interface LongTaskEntry {
  name: string;
  startTime: number;
  duration: number;
}

declare global {
  interface Window {
    __longTasks?: LongTaskEntry[];
  }
}

/** Starts collecting `longtask` entries in the current document (re-call after a navigation). */
export async function startLongTaskCollector(page: Page) {
  await page.evaluate(() => {
    window.__longTasks = [];
    const observer = new PerformanceObserver((list) => {
      for (const { name, startTime, duration } of list.getEntries()) {
        window.__longTasks!.push({ name, startTime, duration });
      }
    });
    observer.observe({ type: 'longtask' });
  });
}

export async function collectLongTasks(page: Page): Promise<LongTaskEntry[]> {
  // The observer delivers entries asynchronously: yield a few frames so the last task's entry has arrived.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(() => setTimeout(resolve, 0), 0))),
  );
  return page.evaluate(() => window.__longTasks ?? []);
}

/**
 * Runs `action` under CDP CPU throttling (`Emulation.setCPUThrottlingRate`) while a `PerformanceObserver('longtask')`
 * records main-thread tasks, and fails when any task took longer than `maxMs`. Returns the recorded tasks.
 */
export async function expectNoLongTasks(
  page: Page,
  action: () => Promise<void>,
  { maxMs = 50, cpuThrottlingRate }: LongTasksOptions = {},
): Promise<LongTaskEntry[]> {
  // The benchmark runs before the throttling is set (and in another page, so the app under test is not disturbed).
  const { rate } = await calibratedRate(page, cpuThrottlingRate);
  const cdp: CDPSession = await page.context().newCDPSession(page);
  try {
    await startLongTaskCollector(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await action();
    const tasks = await collectLongTasks(page);
    const offenders = tasks.filter((task) => task.duration > maxMs);
    expect(
      offenders,
      `main-thread tasks longer than ${maxMs} ms at ${rate}x CPU throttling (calibrated to the target device, x4 on the reference machine):\n` +
        offenders
          .map((task) => `  ${task.duration.toFixed(0)} ms at ${task.startTime.toFixed(0)} ms (${task.name})`)
          .join('\n'),
    ).toEqual([]);
    return tasks;
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  }
}
