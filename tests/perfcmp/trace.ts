// Turns a Chrome trace (CDP `Tracing`, categories below) into the per-window numbers of the comparison: self time of
// script / style / layout / paint / GC on the renderer main thread, and the main-thread task durations.
//
// "Self time" is the time of an event minus the time of the events nested inside it, so a `Layout` forced from inside a
// `FunctionCall` is layout, not script, and nothing is counted twice. The windows are cut with `performance.mark`s the
// page probe places (`pc:start`, `pc:end`, `pc:anim-end`), which are part of the trace (category blink.user_timing).

/** What the harness records. `toplevel` gives the task durations, `devtools.timeline` the rendering / script events. */
export const TRACE_CATEGORIES = ['devtools.timeline', 'toplevel', 'blink.user_timing', 'v8.execute'];

export interface TraceEvent {
  name: string;
  cat?: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: Record<string, unknown>;
}

export type TimeCategory = 'script' | 'style' | 'layout' | 'paint' | 'gc' | 'other';

const SCRIPT_EVENTS = new Set([
  'FunctionCall',
  'EvaluateScript',
  'v8.evaluateModule',
  'v8.compile',
  'v8.compileModule',
  'v8.run',
  'v8.callFunction',
  'RunMicrotasks',
  'FireAnimationFrame',
  'FireIdleCallback',
  'TimerFire',
  'EventDispatch',
  'HandlePostMessage',
  'XHRReadyStateChange',
  'XHRLoad',
  'V8.StackGuard',
  'V8.HandleInterrupts',
]);
const STYLE_EVENTS = new Set(['UpdateLayoutTree', 'RecalculateStyles', 'ParseAuthorStyleSheet']);
const PAINT_EVENTS = new Set([
  'Paint',
  'PrePaint',
  'Layerize',
  'UpdateLayer',
  'UpdateLayerTree',
  'Commit',
  'CompositeLayers',
]);
export const TASK_EVENT = 'ThreadControllerImpl::RunTask';

export function categorize(name: string): TimeCategory {
  if (name.startsWith('V8.GC') || name === 'MinorGC' || name === 'MajorGC') return 'gc';
  if (SCRIPT_EVENTS.has(name) || name.startsWith('V8.BytecodeBudgetInterrupt')) return 'script';
  if (STYLE_EVENTS.has(name)) return 'style';
  if (name === 'Layout') return 'layout';
  if (PAINT_EVENTS.has(name)) return 'paint';
  return 'other';
}

export interface TraceWindow {
  /** µs, trace clock. */
  startUs: number;
  endUs: number;
}

export interface TraceMetrics {
  scriptMs: number;
  styleMs: number;
  layoutMs: number;
  paintMs: number;
  gcMs: number;
  /** Top-level main-thread tasks that started in the window. */
  taskCount: number;
  /** Longest of them, ms (resolution well below the 50 ms of the long-task API). */
  maxTaskMs: number;
  layoutCount: number;
  styleRecalcCount: number;
}

export interface MainThread {
  pid: number;
  tid: number;
}

/** The renderer main thread of the page that placed the probe marks. */
export function findMainThread(events: TraceEvent[], markName = 'pc:start'): MainThread | undefined {
  const mark = events.find((event) => event.name === markName);
  if (mark) return { pid: mark.pid, tid: mark.tid };
  const meta = events.find(
    (event) => event.ph === 'M' && event.name === 'thread_name' && event.args?.name === 'CrRendererMain',
  );
  return meta ? { pid: meta.pid, tid: meta.tid } : undefined;
}

export function markTime(events: TraceEvent[], name: string, thread?: MainThread): number | undefined {
  const mark = events.find(
    (event) => event.name === name && (!thread || (event.pid === thread.pid && event.tid === thread.tid)),
  );
  return mark?.ts;
}

interface Complete {
  name: string;
  ts: number;
  dur: number;
}

/** Complete events of one thread; `B`/`E` pairs are folded into complete events. */
function completeEvents(events: TraceEvent[], thread: MainThread): Complete[] {
  const result: Complete[] = [];
  const open: TraceEvent[] = [];
  for (const event of events) {
    if (event.pid !== thread.pid || event.tid !== thread.tid) continue;
    if (event.ph === 'X' && typeof event.dur === 'number') {
      result.push({ name: event.name, ts: event.ts, dur: event.dur });
    } else if (event.ph === 'B') {
      open.push(event);
    } else if (event.ph === 'E') {
      const begin = open.pop();
      if (begin) result.push({ name: begin.name, ts: begin.ts, dur: event.ts - begin.ts });
    }
  }
  return result;
}

/** Self time per event (µs, same order as the sorted input) by walking the nesting with a stack. */
function selfTimes(sorted: Complete[]): number[] {
  const self = sorted.map((event) => event.dur);
  const stack: { end: number; index: number }[] = [];
  sorted.forEach((event, index) => {
    while (stack.length && stack[stack.length - 1].end <= event.ts) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) {
      // A child that outlives its parent (clock skew) is clipped to it.
      self[parent.index] -= Math.min(event.dur, parent.end - event.ts);
    }
    stack.push({ end: event.ts + event.dur, index });
  });
  return self.map((value) => Math.max(0, value));
}

export function analyzeTrace(events: TraceEvent[], thread: MainThread, window: TraceWindow): TraceMetrics {
  const sorted = completeEvents(events, thread)
    .filter((event) => event.dur > 0)
    // Parents first: earlier start, and for equal starts the longer one.
    .sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const self = selfTimes(sorted);

  const totals: Record<TimeCategory, number> = { script: 0, style: 0, layout: 0, paint: 0, gc: 0, other: 0 };
  const metrics: TraceMetrics = {
    scriptMs: 0,
    styleMs: 0,
    layoutMs: 0,
    paintMs: 0,
    gcMs: 0,
    taskCount: 0,
    maxTaskMs: 0,
    layoutCount: 0,
    styleRecalcCount: 0,
  };

  let taskEnd = -Infinity;
  sorted.forEach((event, index) => {
    if (event.ts < window.startUs || event.ts >= window.endUs) return;
    totals[categorize(event.name)] += self[index];
    if (event.name === 'Layout') metrics.layoutCount++;
    if (event.name === 'UpdateLayoutTree' || event.name === 'RecalculateStyles') metrics.styleRecalcCount++;
    // Top-level tasks: a RunTask that is not nested inside another one (nested run loops would double count).
    if (event.name === TASK_EVENT && event.ts >= taskEnd) {
      taskEnd = event.ts + event.dur;
      metrics.taskCount++;
      metrics.maxTaskMs = Math.max(metrics.maxTaskMs, event.dur / 1000);
    }
  });

  metrics.scriptMs = totals.script / 1000;
  metrics.styleMs = totals.style / 1000;
  metrics.layoutMs = totals.layout / 1000;
  metrics.paintMs = totals.paint / 1000;
  metrics.gcMs = totals.gc / 1000;
  return metrics;
}

/** The longest top-level task that starts at or after `fromUs` (before `toUs`), in ms; 0 when there is none. */
export function maxTaskAfter(events: TraceEvent[], thread: MainThread, fromUs: number, toUs: number): number {
  let max = 0;
  let taskEnd = -Infinity;
  const tasks = completeEvents(events, thread)
    .filter((event) => event.name === TASK_EVENT)
    .sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  for (const task of tasks) {
    if (task.ts < taskEnd) continue; // nested
    taskEnd = task.ts + task.dur;
    if (task.ts >= fromUs && task.ts < toUs) max = Math.max(max, task.dur / 1000);
  }
  return max;
}

/** Parses the buffer `browser.stopTracing()` returns (`{ traceEvents: [...] }` or a bare array). */
export function parseTrace(buffer: { toString(): string }): TraceEvent[] {
  const parsed = JSON.parse(buffer.toString()) as { traceEvents?: TraceEvent[] } | TraceEvent[];
  return Array.isArray(parsed) ? parsed : (parsed.traceEvents ?? []);
}
