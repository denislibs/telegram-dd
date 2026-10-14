import { describe, expect, it } from 'vitest';

import {
  analyzeTrace,
  categorize,
  findMainThread,
  markTime,
  maxTaskAfter,
  parseTrace,
  TASK_EVENT,
  type TraceEvent,
} from './trace';

const MAIN = { pid: 1, tid: 10 };
const x = (name: string, ts: number, dur: number, thread = MAIN): TraceEvent => ({ name, ph: 'X', ts, dur, ...thread });
const mark = (name: string, ts: number): TraceEvent => ({ name, ph: 'I', ts, ...MAIN });

describe('categorize', () => {
  it('maps the renderer events to the report categories', () => {
    expect(categorize('FunctionCall')).toBe('script');
    expect(categorize('RunMicrotasks')).toBe('script');
    expect(categorize('V8.BytecodeBudgetInterrupt')).toBe('script');
    expect(categorize('UpdateLayoutTree')).toBe('style');
    expect(categorize('Layout')).toBe('layout');
    expect(categorize('PrePaint')).toBe('paint');
    expect(categorize('MinorGC')).toBe('gc');
    expect(categorize('V8.GC_SCAVENGER_SCAVENGE')).toBe('gc');
    expect(categorize(TASK_EVENT)).toBe('other');
  });
});

describe('analyzeTrace', () => {
  it('counts self time: a forced layout inside a script call is layout, not script', () => {
    const events = [
      mark('pc:start', 0),
      x(TASK_EVENT, 1000, 10_000),
      x('FunctionCall', 1000, 6000),
      x('Layout', 3000, 2000), // inside the call
      x('UpdateLayoutTree', 8000, 1000),
      mark('pc:end', 20_000),
    ];
    const metrics = analyzeTrace(events, MAIN, { startUs: 0, endUs: 20_000 });
    expect(metrics.scriptMs).toBeCloseTo(4); // 6 ms call - 2 ms layout
    expect(metrics.layoutMs).toBeCloseTo(2);
    expect(metrics.styleMs).toBeCloseTo(1);
    expect(metrics.taskCount).toBe(1);
    expect(metrics.maxTaskMs).toBeCloseTo(10);
    expect(metrics.layoutCount).toBe(1);
    expect(metrics.styleRecalcCount).toBe(1);
  });

  it('counts GC once even though V8 nests several GC events', () => {
    const events = [
      x(TASK_EVENT, 0, 9000),
      x('MinorGC', 1000, 4000),
      x('V8.GC_SCAVENGER', 1000, 4000),
      x('V8.GC_SCAVENGER_SCAVENGE', 1500, 3000),
    ];
    const metrics = analyzeTrace(events, MAIN, { startUs: 0, endUs: 10_000 });
    expect(metrics.gcMs).toBeCloseTo(4);
  });

  it('ignores other threads and events outside the window', () => {
    const events = [
      x('FunctionCall', 100, 1000),
      x('FunctionCall', 100, 5000, { pid: 1, tid: 11 }), // another thread
      x('FunctionCall', 50_000, 1000), // after the window
    ];
    const metrics = analyzeTrace(events, MAIN, { startUs: 0, endUs: 10_000 });
    expect(metrics.scriptMs).toBeCloseTo(1);
  });

  it('counts only top-level tasks for the longest task (a nested run loop is not a second task)', () => {
    const events = [x(TASK_EVENT, 0, 30_000), x(TASK_EVENT, 5000, 20_000), x(TASK_EVENT, 40_000, 8000)];
    const metrics = analyzeTrace(events, MAIN, { startUs: 0, endUs: 100_000 });
    expect(metrics.taskCount).toBe(2);
    expect(metrics.maxTaskMs).toBeCloseTo(30);
  });

  it('folds B/E pairs into complete events', () => {
    const events: TraceEvent[] = [
      { name: 'Layout', ph: 'B', ts: 100, ...MAIN },
      { name: 'Layout', ph: 'E', ts: 3100, ...MAIN },
    ];
    expect(analyzeTrace(events, MAIN, { startUs: 0, endUs: 10_000 }).layoutMs).toBeCloseTo(3);
  });
});

describe('maxTaskAfter', () => {
  it('finds the longest task that starts after the release mark', () => {
    const events = [x(TASK_EVENT, 0, 90_000), x(TASK_EVENT, 100_000, 12_000), x(TASK_EVENT, 130_000, 45_000)];
    expect(maxTaskAfter(events, MAIN, 100_000, 1_000_000)).toBeCloseTo(45);
    expect(maxTaskAfter(events, MAIN, 200_000, 1_000_000)).toBe(0);
  });
});

describe('thread and mark lookup', () => {
  it('takes the thread that placed the probe marks, not the first renderer', () => {
    const events: TraceEvent[] = [
      { name: 'thread_name', ph: 'M', ts: 0, pid: 5, tid: 50, args: { name: 'CrRendererMain' } },
      { name: 'pc:start', ph: 'I', ts: 10, pid: 7, tid: 70 },
      { name: 'pc:end', ph: 'I', ts: 90, pid: 7, tid: 70 },
    ];
    const thread = findMainThread(events);
    expect(thread).toEqual({ pid: 7, tid: 70 });
    expect(markTime(events, 'pc:end', thread)).toBe(90);
  });

  it('falls back to the CrRendererMain thread when there is no mark', () => {
    const events: TraceEvent[] = [
      { name: 'thread_name', ph: 'M', ts: 0, pid: 5, tid: 50, args: { name: 'CrRendererMain' } },
    ];
    expect(findMainThread(events)).toEqual({ pid: 5, tid: 50 });
  });
});

describe('parseTrace', () => {
  it('accepts both trace container shapes', () => {
    const event = x('Layout', 1, 1);
    expect(parseTrace(JSON.stringify({ traceEvents: [event] }))).toEqual([event]);
    expect(parseTrace(Buffer.from(JSON.stringify([event])))).toEqual([event]);
  });
});
