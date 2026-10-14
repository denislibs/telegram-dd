import { describe, expect, it } from 'vitest';

import type { RunResult } from './runner';

import { finishScenario, noiseOf, renderMarkdown, type Report, type ScenarioResult, summarize } from './report';

const run = (metrics: Record<string, number>): RunResult => ({ metrics, load1: 1, pageErrors: [] });

function scenario(partial: Partial<ScenarioResult>): ScenarioResult {
  return {
    id: 's',
    title: 'S',
    description: 'd',
    notApplicable: {},
    runs: {},
    failures: {},
    summary: {},
    ratios: {},
    ...partial,
  };
}

describe('summarize / finishScenario', () => {
  it('takes medians over the runs and the ratio first / second', () => {
    const result = scenario({
      runs: {
        a: [run({ scriptMs: 100 }), run({ scriptMs: 300 }), run({ scriptMs: 200 })],
        b: [run({ scriptMs: 400 }), run({ scriptMs: 400 }), run({ scriptMs: 400 })],
      },
    });
    finishScenario(result, 'a', 'b');
    expect(result.summary.a.scriptMs).toMatchObject({ median: 200, min: 100, max: 300, runs: 3 });
    expect(result.ratios.scriptMs).toBe(0.5);
  });

  it('has no ratios when one side did not run', () => {
    const result = scenario({ runs: { b: [run({ scriptMs: 1 })] } });
    finishScenario(result, 'a', 'b');
    expect(result.ratios).toEqual({});
    expect(summarize([])).toEqual({});
  });
});

describe('noiseOf', () => {
  it('summarises |ratio - 1| over comparable metrics and skips 0 vs 0 and informational ones', () => {
    const result = scenario({
      runs: {
        a: [
          run({ scriptMs: 1000, longTaskCount: 0, windowMs: 5000 }),
          run({ scriptMs: 1000, longTaskCount: 0, windowMs: 5000 }),
        ],
        b: [
          run({ scriptMs: 1100, longTaskCount: 0, windowMs: 9000 }),
          run({ scriptMs: 1100, longTaskCount: 0, windowMs: 9000 }),
        ],
      },
    });
    finishScenario(result, 'a', 'b');
    const noise = noiseOf([result], 'a', 'b');
    expect(noise.deviation.count).toBe(1);
    expect(noise.deviation.max).toBeCloseTo(0.0909, 3);
    expect(noise.largeDeviation.count).toBe(1);
  });
});

describe('renderMarkdown', () => {
  it('prints n/a for an app that could not run a scenario and a ratio for the metrics both have', () => {
    const result = scenario({
      title: '1. Cold start',
      notApplicable: { a: 'the chat list is not rendered' },
      runs: { b: [run({ scriptMs: 500 })] },
    });
    finishScenario(result, 'a', 'b');
    const report: Report = {
      generatedAt: '2026-10-14T00:00:00.000Z',
      mode: 'compare',
      config: { runs: 1, cpuRate: 4, trace: true, scenarios: ['s'] },
      machine: {
        cpu: 'cpu',
        cores: 1,
        memoryGb: 1,
        platform: 'p',
        node: 'n',
        chromium: 'c',
        uptimeBefore: 'u1',
        uptimeAfter: 'u2',
        loadAverageDuringRuns: { min: 1, median: 1, max: 1 },
      },
      apps: [
        { label: 'a', description: 'app a' },
        { label: 'b', description: 'app b' },
      ],
      scenarios: [result],
    };
    const markdown = renderMarkdown(report);
    expect(markdown).toContain('**a: n/a** - the chat list is not rendered');
    expect(markdown).toContain('| script ms | n/a | 500 |');
    expect(markdown).toContain('u1');
  });
});
