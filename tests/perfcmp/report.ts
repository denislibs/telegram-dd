// Aggregation and rendering of a comparison: medians per app and metric, the ratio first app / second app, the
// machine and its load, and (for tt vs tt) the measured noise of the method.
import type { RunResult } from './runner';

import { type CpuCalibration, describeCalibration } from './cpuCalibration';
import { INFORMATIONAL, METRIC_BY_KEY, METRICS } from './metrics';
import { formatNumber, formatRatio, median, quantile, ratio, relativeMad } from './stats';

export interface AppSummary {
  label: string;
  description: string;
}

export interface MetricSummary {
  median: number;
  min: number;
  max: number;
  /** Median absolute deviation / median: the run-to-run noise of this app on this metric. */
  relMad: number;
  runs: number;
}

export interface ScenarioResult {
  id: string;
  title: string;
  description: string;
  /** Per app label: why the scenario was not run ("n/a"), absent when it ran. */
  notApplicable: Record<string, string>;
  /** Raw runs per app label, in run order. */
  runs: Record<string, RunResult[]>;
  failures: Record<string, string[]>;
  summary: Record<string, Record<string, MetricSummary>>;
  /** first app / second app per metric (only when both ran). */
  ratios: Record<string, number>;
}

export interface Machine {
  cpu: string;
  cores: number;
  memoryGb: number;
  platform: string;
  node: string;
  chromium: string;
  uptimeBefore: string;
  uptimeAfter: string;
  loadAverageDuringRuns: { min: number; median: number; max: number };
}

export interface Report {
  generatedAt: string;
  mode: 'compare' | 'aa';
  config: { runs: number; cpuRate: number; cpuCalibration?: CpuCalibration; trace: boolean; scenarios: string[] };
  machine: Machine;
  apps: AppSummary[];
  scenarios: ScenarioResult[];
  /** Only in a tt vs tt run. */
  noise?: NoiseSummary;
}

export interface NoiseSummary {
  /** |ratio - 1| over every comparable metric of every scenario. */
  deviation: { count: number; median: number; p90: number; max: number };
  /** The same over the metrics that are well above their resolution floor (both medians >= 4x `minDelta`). */
  largeDeviation: { count: number; median: number; p90: number; max: number };
  /** Run-to-run spread (relative MAD) of one app, over the same metrics. */
  runSpread: { median: number; p90: number; max: number };
  /** The widest ratios, to show where the method is noisy. */
  worst: { scenario: string; metric: string; ratio: number }[];
}

export function summarize(runs: RunResult[]): Record<string, MetricSummary> {
  const keys = new Set(runs.flatMap((run) => Object.keys(run.metrics)));
  const summary: Record<string, MetricSummary> = {};
  for (const key of keys) {
    const values = runs.map((run) => run.metrics[key]).filter((value) => value !== undefined && !Number.isNaN(value));
    if (!values.length) continue;
    summary[key] = {
      median: median(values),
      min: Math.min(...values),
      max: Math.max(...values),
      relMad: relativeMad(values),
      runs: values.length,
    };
  }
  return summary;
}

export function finishScenario(result: ScenarioResult, first: string, second: string) {
  for (const label of Object.keys(result.runs)) result.summary[label] = summarize(result.runs[label]);
  const a = result.summary[first];
  const b = result.summary[second];
  if (!a || !b) return;
  for (const key of Object.keys(a)) {
    if (b[key]) result.ratios[key] = ratio(a[key].median, b[key].median);
  }
}

/** A metric is comparable when at least one side is not zero (0 vs 0 is "nothing happened" in both, not a tie to count). */
function comparable(a: MetricSummary, b: MetricSummary, key: string) {
  return !INFORMATIONAL.has(key) && (a.median !== 0 || b.median !== 0);
}

export function noiseOf(scenarios: ScenarioResult[], first: string, second: string): NoiseSummary {
  const deviations: number[] = [];
  const large: number[] = [];
  const spreads: number[] = [];
  const worst: NoiseSummary['worst'] = [];
  for (const scenario of scenarios) {
    const a = scenario.summary[first];
    const b = scenario.summary[second];
    if (!a || !b) continue;
    for (const key of Object.keys(a)) {
      if (!b[key] || !comparable(a[key], b[key], key)) continue;
      const value = scenario.ratios[key];
      if (!Number.isFinite(value)) continue;
      deviations.push(Math.abs(value - 1));
      const floor = 4 * (METRIC_BY_KEY.get(key)?.minDelta ?? 0);
      if (a[key].median >= floor && b[key].median >= floor) large.push(Math.abs(value - 1));
      spreads.push(a[key].relMad, b[key].relMad);
      worst.push({ scenario: scenario.id, metric: key, ratio: value });
    }
  }
  worst.sort((x, y) => Math.abs(y.ratio - 1) - Math.abs(x.ratio - 1));
  return {
    deviation: {
      count: deviations.length,
      median: median(deviations),
      p90: quantile(deviations, 0.9),
      max: Math.max(0, ...deviations),
    },
    largeDeviation: {
      count: large.length,
      median: median(large),
      p90: quantile(large, 0.9),
      max: Math.max(0, ...large),
    },
    runSpread: { median: median(spreads), p90: quantile(spreads, 0.9), max: Math.max(0, ...spreads) },
    worst: worst.slice(0, 6),
  };
}

const pct = (value: number) => `${(value * 100).toFixed(0)}%`;

function cell(summary: MetricSummary | undefined, digits: number) {
  if (!summary) return 'n/a';
  const range =
    summary.min === summary.max ? '' : ` (${formatNumber(summary.min, digits)}-${formatNumber(summary.max, digits)})`;
  return `${formatNumber(summary.median, digits)}${range}`;
}

function verdict(value: number | undefined, a: MetricSummary | undefined, b: MetricSummary | undefined, key: string) {
  if (value === undefined || !a || !b || INFORMATIONAL.has(key)) return '';
  if (a.median === 0 && b.median === 0) return '';
  const floor = METRIC_BY_KEY.get(key)?.minDelta ?? 0;
  if (Math.abs(a.median - b.median) < floor) return '~';
  if (value < 0.9) return 'better';
  if (value > 1.1) return 'worse';
  return '~';
}

export function renderMarkdown(report: Report): string {
  const [first, second] = report.apps;
  const lines: string[] = [];
  const title =
    report.mode === 'aa'
      ? 'Performance comparison: tt vs tt (A/A noise check)'
      : `Performance comparison: ${first.label} vs ${second.label}`;
  lines.push(`# ${title}`, '');
  lines.push(
    `Generated ${report.generatedAt}. ${report.config.runs} runs per app and scenario, interleaved, CPU throttling x${report.config.cpuRate}, trace ${report.config.trace ? 'on' : 'off'}.`,
  );
  lines.push('');
  lines.push('| | |', '| --- | --- |');
  for (const app of report.apps) lines.push(`| ${app.label} | ${app.description} |`);
  const { machine } = report;
  lines.push(`| machine | ${machine.cpu}, ${machine.cores} cores, ${machine.memoryGb} GB, ${machine.platform} |`);
  if (report.config.cpuCalibration) {
    lines.push(`| CPU throttling | ${describeCalibration(report.config.cpuCalibration)} |`);
  }
  lines.push(`| software | node ${machine.node}, Chromium ${machine.chromium} (headless) |`);
  lines.push(`| load (\`uptime\`) before | ${machine.uptimeBefore} |`);
  lines.push(`| load (\`uptime\`) after | ${machine.uptimeAfter} |`);
  lines.push(
    `| 1-min load average at the start of runs | min ${machine.loadAverageDuringRuns.min.toFixed(1)}, median ${machine.loadAverageDuringRuns.median.toFixed(1)}, max ${machine.loadAverageDuringRuns.max.toFixed(1)} |`,
  );
  lines.push('');
  lines.push(
    `Ratio = ${first.label} / ${second.label} of the medians; below 1 means ${first.label} is cheaper. "better" / "worse" mean more than 10% apart, "~" within 10%` +
      (report.mode === 'compare'
        ? ' (see the A/A section of docs/quality-gates.md for what the method resolves)'
        : '') +
      '. Min-max over the runs is in brackets.',
  );
  lines.push('');

  if (report.noise) {
    const { deviation, largeDeviation, runSpread, worst } = report.noise;
    lines.push('## A/A noise of the method', '');
    lines.push(
      `Both sides are the same app (telegram-tt). Over ${deviation.count} comparable metrics, |ratio - 1| has median ${pct(deviation.median)}, p90 ${pct(deviation.p90)}, max ${pct(deviation.max)}; ` +
        `over the ${largeDeviation.count} that are well above their resolution floor (4x the "~" threshold) median ${pct(largeDeviation.median)}, p90 ${pct(largeDeviation.p90)}, max ${pct(largeDeviation.max)}. ` +
        `Run-to-run spread of one side (relative MAD): median ${pct(runSpread.median)}, p90 ${pct(runSpread.p90)}, max ${pct(runSpread.max)}.`,
    );
    lines.push('');
    lines.push('Widest ratios:', '');
    for (const item of worst) lines.push(`- ${item.scenario} / ${item.metric}: ${formatRatio(item.ratio)}`);
    lines.push('');
  }

  for (const scenario of report.scenarios) {
    lines.push(`## ${scenario.title}`, '', scenario.description, '');
    const labels = report.apps.map((app) => app.label);
    for (const label of labels) {
      if (scenario.notApplicable[label]) lines.push(`- **${label}: n/a** - ${scenario.notApplicable[label]}`);
      for (const failure of scenario.failures[label] ?? []) lines.push(`- ${label}: run failed - ${failure}`);
    }
    const a = scenario.summary[first.label];
    const b = scenario.summary[second.label];
    if (!a && !b) {
      lines.push('', '_Not measured._', '');
      continue;
    }
    lines.push('', `| metric | ${first.label} | ${second.label} | ratio | |`, '| --- | ---: | ---: | ---: | :-- |');
    for (const metric of METRICS) {
      if (!a?.[metric.key] && !b?.[metric.key]) continue;
      const unit = metric.unit ? ` ${metric.unit}` : '';
      const value = scenario.ratios[metric.key];
      lines.push(
        `| ${metric.label}${unit} | ${cell(a?.[metric.key], metric.digits)} | ${cell(b?.[metric.key], metric.digits)} | ${value === undefined ? '' : formatRatio(value)} | ${verdict(value, a?.[metric.key], b?.[metric.key], metric.key)} |`,
      );
    }
    lines.push('');
  }

  const present = new Set(
    report.scenarios.flatMap((scenario) => Object.values(scenario.summary).flatMap((summary) => Object.keys(summary))),
  );
  lines.push('## Metrics', '', '| metric | source | "~" below |', '| --- | --- | ---: |');
  for (const metric of METRICS) {
    if (present.has(metric.key)) {
      lines.push(`| ${metric.label} | ${metric.source} | ${metric.minDelta}${metric.unit ? ` ${metric.unit}` : ''} |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}
