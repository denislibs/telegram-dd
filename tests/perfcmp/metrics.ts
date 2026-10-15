// The metrics of one run and how the report prints them. Every metric is "lower is better".

export interface MetricDef {
  key: string;
  label: string;
  unit: string;
  digits: number;
  /** Where it comes from, for the report legend. */
  source: string;
  /** Smallest difference between two medians worth calling a difference (the report says "~" below it). */
  minDelta: number;
}

export const METRICS: MetricDef[] = [
  {
    key: 'longTaskCount',
    label: 'long tasks',
    unit: '',
    digits: 0,
    source: 'PerformanceObserver longtask (>= 50 ms)',
    minDelta: 1,
  },
  {
    key: 'longTaskTotalMs',
    label: 'long tasks, total',
    unit: 'ms',
    digits: 0,
    source: 'sum of long-task durations',
    minDelta: 20,
  },
  {
    key: 'longTaskMaxMs',
    label: 'long task, max',
    unit: 'ms',
    digits: 0,
    source: 'longest long task (0 = none)',
    minDelta: 20,
  },
  {
    key: 'tbtMs',
    label: 'total blocking time',
    unit: 'ms',
    digits: 0,
    source: 'sum of (long task - 50 ms)',
    minDelta: 20,
  },
  {
    key: 'maxTaskMs',
    label: 'longest task',
    unit: 'ms',
    digits: 1,
    source: 'trace: main-thread task, any length',
    minDelta: 10,
  },
  {
    key: 'scriptMs',
    label: 'script',
    unit: 'ms',
    digits: 0,
    source: 'trace: self time of script events',
    minDelta: 30,
  },
  {
    key: 'styleMs',
    label: 'style',
    unit: 'ms',
    digits: 0,
    source: 'trace: UpdateLayoutTree / stylesheet parse',
    minDelta: 10,
  },
  { key: 'layoutMs', label: 'layout', unit: 'ms', digits: 0, source: 'trace: Layout', minDelta: 10 },
  {
    key: 'paintMs',
    label: 'paint',
    unit: 'ms',
    digits: 0,
    source: 'trace: Paint / PrePaint / Layerize / Commit',
    minDelta: 10,
  },
  { key: 'gcMs', label: 'GC', unit: 'ms', digits: 0, source: 'trace: V8 GC on the main thread', minDelta: 10 },
  {
    key: 'droppedFrames',
    label: 'frames dropped',
    unit: '',
    digits: 0,
    source: 'rAF gaps > 1.5 frames (60 Hz)',
    minDelta: 4,
  },
  {
    key: 'domMutations',
    label: 'DOM mutations',
    unit: '',
    digits: 0,
    source: 'MutationObserver records',
    minDelta: 30,
  },
  {
    key: 'heapMb',
    label: 'JS heap after GC',
    unit: 'MB',
    digits: 1,
    source: 'Runtime.getHeapUsage after 2x collectGarbage',
    minDelta: 0.5,
  },
  // Scenario specific
  {
    key: 'readyMs',
    label: 'time to first chat row',
    unit: 'ms',
    digits: 0,
    source: 'cold start: navigation to the ready selector',
    minDelta: 30,
  },
  {
    key: 'windowMs',
    label: 'measured window',
    unit: 'ms',
    digits: 0,
    source: 'wall time of the window (information)',
    minDelta: 0,
  },
  {
    key: 'postReleaseMaxTaskMs',
    label: 'longest task after the animation ended',
    unit: 'ms',
    digits: 1,
    source: 'trace: tasks starting after the animation end',
    minDelta: 10,
  },
  {
    key: 'postReleaseLongTaskMs',
    label: 'long tasks after the animation ended',
    unit: 'ms',
    digits: 0,
    source: 'sum of long tasks after the animation end',
    minDelta: 20,
  },
  {
    key: 'droppedDuringAnimation',
    label: 'frames dropped during the animation',
    unit: '',
    digits: 0,
    source: 'rAF gaps until the animation end',
    minDelta: 3,
  },
  {
    key: 'scrollFrames',
    label: 'frames to reach the bottom',
    unit: '',
    digits: 0,
    source: 'scroll steps (fewer = the scroll finished sooner)',
    minDelta: 0,
  },
  {
    key: 'inputLatencyP50Ms',
    label: 'input latency, median',
    unit: 'ms',
    digits: 0,
    source: 'typing scenario: keydown until the frame after the update started',
    minDelta: 8,
  },
  {
    key: 'inputLatencyP95Ms',
    label: 'input latency, p95',
    unit: 'ms',
    digits: 0,
    source: 'typing scenario: 95th percentile of the 200 characters',
    minDelta: 15,
  },
  {
    key: 'inputLatencyMaxMs',
    label: 'input latency, worst',
    unit: 'ms',
    digits: 0,
    source: 'typing scenario: the slowest character',
    minDelta: 30,
  },
  { key: 'droppedFramesOpen', label: 'frames dropped, open phase (until the first key)', unit: '', digits: 0, source: 'typing scenario split', minDelta: 3 },
  { key: 'droppedFramesType', label: 'frames dropped, typing phase (first key to end)', unit: '', digits: 0, source: 'typing scenario split', minDelta: 3 },
  { key: 'longTaskCountOpen', label: 'long tasks, open phase (until the first key)', unit: '', digits: 0, source: 'typing scenario split', minDelta: 1 },
  { key: 'longTaskCountType', label: 'long tasks, typing phase (first key to end)', unit: '', digits: 0, source: 'typing scenario split', minDelta: 1 },
  { key: 'longTaskMaxMsOpen', label: 'long task, max, open phase (until the first key)', unit: 'ms', digits: 0, source: 'typing scenario split', minDelta: 20 },
  { key: 'longTaskMaxMsType', label: 'long task, max, typing phase (first key to end)', unit: 'ms', digits: 0, source: 'typing scenario split', minDelta: 20 },
  { key: 'scriptMsOpen', label: 'script, open phase (until the first key)', unit: 'ms', digits: 0, source: 'typing scenario split', minDelta: 40 },
  { key: 'scriptMsType', label: 'script, typing phase (first key to end)', unit: 'ms', digits: 0, source: 'typing scenario split', minDelta: 40 },
  { key: 'styleMsOpen', label: 'style, open phase (until the first key)', unit: 'ms', digits: 0, source: 'typing scenario split', minDelta: 10 },
  { key: 'styleMsType', label: 'style, typing phase (first key to end)', unit: 'ms', digits: 0, source: 'typing scenario split', minDelta: 10 },
  { key: 'layoutMsOpen', label: 'layout, open phase (until the first key)', unit: 'ms', digits: 0, source: 'typing scenario split', minDelta: 10 },
  { key: 'layoutMsType', label: 'layout, typing phase (first key to end)', unit: 'ms', digits: 0, source: 'typing scenario split', minDelta: 10 },
  { key: 'paintMsOpen', label: 'paint, open phase (until the first key)', unit: 'ms', digits: 0, source: 'typing scenario split', minDelta: 10 },
  { key: 'paintMsType', label: 'paint, typing phase (first key to end)', unit: 'ms', digits: 0, source: 'typing scenario split', minDelta: 10 },
  { key: 'maxTaskMsOpen', label: 'longest task, open phase (until the first key)', unit: 'ms', digits: 1, source: 'typing scenario split', minDelta: 10 },
  { key: 'maxTaskMsType', label: 'longest task, typing phase (first key to end)', unit: 'ms', digits: 1, source: 'typing scenario split', minDelta: 10 },
  { key: 'layoutCountOpen', label: 'layouts, open phase (until the first key)', unit: '', digits: 0, source: 'typing scenario split', minDelta: 5 },
  { key: 'layoutCountType', label: 'layouts, typing phase (first key to end)', unit: '', digits: 0, source: 'typing scenario split', minDelta: 5 },
  { key: 'styleCountOpen', label: 'style recalcs, open phase (until the first key)', unit: '', digits: 0, source: 'typing scenario split', minDelta: 5 },
  { key: 'styleCountType', label: 'style recalcs, typing phase (first key to end)', unit: '', digits: 0, source: 'typing scenario split', minDelta: 5 },
];

export const METRIC_BY_KEY = new Map(METRICS.map((metric) => [metric.key, metric]));

/** Metrics that describe the setup, not the app: shown in the report but left out of the A/A noise summary. */
export const INFORMATIONAL = new Set(['windowMs', 'scrollFrames', 'messagesSent']);

export type MetricValues = Record<string, number>;
