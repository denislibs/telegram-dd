import { describe, expect, it } from 'vitest';

import { droppedFrames, formatRatio, longTaskStats, median, quantile, ratio, relativeMad } from './stats';

describe('median / quantile', () => {
  it('handles odd, even and empty inputs', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
    expect(quantile([1, 2, 3, 4, 5], 0.9)).toBeCloseTo(4.6);
  });

  it('relative MAD is the noise of a metric across runs', () => {
    expect(relativeMad([10, 10, 10])).toBe(0);
    expect(relativeMad([90, 100, 110])).toBeCloseTo(0.1);
    expect(relativeMad([0, 0])).toBe(0);
  });
});

describe('ratio', () => {
  it('treats 0 / 0 as a tie and x / 0 as infinite', () => {
    expect(ratio(0, 0)).toBe(1);
    expect(ratio(5, 0)).toBe(Infinity);
    expect(ratio(0, 5)).toBe(0);
    expect(ratio(10, 20)).toBe(0.5);
    expect(formatRatio(Infinity)).toBe('inf');
    expect(formatRatio(0.456)).toBe('0.46x');
  });
});

describe('droppedFrames', () => {
  const frame = 1000 / 60;
  it('is zero for a steady 60 Hz stream', () => {
    const frames = Array.from({ length: 60 }, (_, index) => index * frame);
    expect(droppedFrames(frames, 0, 59 * frame).dropped).toBe(0);
  });

  it('counts the frames missed inside a gap', () => {
    // one 100 ms stall: 6 intervals, 5 frames missed
    const frames = [0, frame, 2 * frame, 2 * frame + 100, 2 * frame + 100 + frame];
    expect(droppedFrames(frames, 0, 2 * frame + 100 + frame).dropped).toBe(5);
  });

  it('counts a stall at the very start of the window (no frame for a long time)', () => {
    expect(droppedFrames([200], 0, 200).dropped).toBe(11);
  });
});

describe('longTaskStats', () => {
  it('computes count, total, max and blocking time', () => {
    const stats = longTaskStats([
      { start: 0, duration: 60 },
      { start: 100, duration: 120 },
    ]);
    expect(stats).toEqual({ count: 2, totalMs: 180, maxMs: 120, tbtMs: 80 });
    expect(longTaskStats([])).toEqual({ count: 0, totalMs: 0, maxMs: 0, tbtMs: 0 });
  });
});
