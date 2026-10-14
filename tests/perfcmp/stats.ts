// Small statistics for the report: medians and spreads over a handful of runs, and the app ratio.

export function median(values: number[]): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function quantile(values: number[], q: number): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

/** Median absolute deviation, relative to the median (the run-to-run noise of one app on one metric). */
export function relativeMad(values: number[]): number {
  const mid = median(values);
  if (!values.length || !mid) return 0;
  return median(values.map((value) => Math.abs(value - mid))) / Math.abs(mid);
}

/**
 * Ratio candidate / baseline of two medians. Both zero is a tie (1); a zero baseline with a non-zero candidate is
 * `Infinity` (the report prints it as "inf" instead of hiding it).
 */
export function ratio(candidate: number, baseline: number): number {
  if (Number.isNaN(candidate) || Number.isNaN(baseline)) return NaN;
  if (candidate === 0 && baseline === 0) return 1;
  return baseline === 0 ? Infinity : candidate / baseline;
}

export function formatRatio(value: number): string {
  if (Number.isNaN(value)) return 'n/a';
  if (!Number.isFinite(value)) return 'inf';
  return `${value.toFixed(2)}x`;
}

export function formatNumber(value: number, digits = 1): string {
  if (Number.isNaN(value)) return 'n/a';
  return Number.isInteger(value) && Math.abs(value) < 1e6 ? String(value) : value.toFixed(digits);
}

/** Dropped frames from rAF timestamps: a gap of N frame intervals is N-1 dropped frames. Window edges count too. */
export function droppedFrames(frames: number[], t0: number, t1: number, frameMs = 1000 / 60) {
  const times = [t0, ...frames.filter((time) => time >= t0 && time <= t1), t1];
  let dropped = 0;
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    // The window edges are not frames: only gaps clearly longer than two intervals count there.
    const isEdge = i === 1 || i === times.length - 1;
    if (gap > (isEdge ? 2.5 : 1.5) * frameMs) dropped += Math.round(gap / frameMs) - 1;
  }
  return { dropped, frames: Math.max(0, times.length - 2) };
}

/** Long-task metrics: count, total, longest, and total blocking time (sum over 50 ms), all in ms. */
export function longTaskStats(tasks: { start: number; duration: number }[]) {
  const durations = tasks.map((task) => task.duration);
  return {
    count: tasks.length,
    totalMs: durations.reduce((sum, value) => sum + value, 0),
    maxMs: durations.length ? Math.max(...durations) : 0,
    tbtMs: durations.reduce((sum, value) => sum + Math.max(0, value - 50), 0),
  };
}
