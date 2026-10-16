// `pnpm perf:compare`: telegram-dd (frameact) against telegram-tt (teact) on identical mocked data. See
// docs/quality-gates.md, "Performance vs telegram-tt".
//
//   pnpm perf:compare                                  every scenario, 5 runs per app, CPU x4
//   pnpm perf:compare --scenario cold-start,scroll     chosen scenarios (ids: --list)
//   pnpm perf:compare --runs 9 --cpu 6                 more runs, other throttling
//   pnpm perf:compare --aa                             tt against tt: the noise of the method itself
//   pnpm perf:compare --no-build                       reuse the built apps (builds are cached by their inputs anyway)
//   pnpm perf:compare --no-trace                       skip the CDP trace (no script/style/layout/paint/GC, faster)
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { type AppId, buildDd, buildTt, SCENARIO_HASH, type Served, serveDir } from './apps';
import { calibrateCpu, describeCalibration, parseRate } from './cpuCalibration';
import {
  type AppSummary,
  finishScenario,
  type Machine,
  noiseOf,
  renderMarkdown,
  type Report,
  type ScenarioResult,
} from './report';
import { DEFAULT_CONFIG, preflight, type RunConfig, type RunResult, runScenario } from './runner';
import { type Capabilities, type Need, type Scenario, SCENARIOS } from './scenarios';
import { median } from './stats';

const RESULTS = join(import.meta.dirname, 'results');

const { values: args } = parseArgs({
  options: {
    scenario: { type: 'string', multiple: true },
    runs: { type: 'string', default: '5' },
    cpu: { type: 'string', default: 'auto' },
    aa: { type: 'boolean', default: false },
    'no-build': { type: 'boolean', default: false },
    rebuild: { type: 'boolean', default: false },
    'no-trace': { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    label: { type: 'string' },
    'no-save': { type: 'boolean', default: false },
  },
});

function log(message: string) {
  process.stdout.write(`${message}\n`);
}

const uptime = () => execFileSync('uptime', { encoding: 'utf8' }).trim();

function selectScenarios(): Scenario[] {
  const wanted = (args.scenario ?? []).flatMap((value) => value.split(',')).filter(Boolean);
  if (!wanted.length) return SCENARIOS;
  const unknown = wanted.filter((id) => !SCENARIOS.some((scenario) => scenario.id === id));
  if (unknown.length) {
    throw new Error(
      `unknown scenario ${unknown.join(', ')} (have: ${SCENARIOS.map((scenario) => scenario.id).join(', ')})`,
    );
  }
  return SCENARIOS.filter((scenario) => wanted.includes(scenario.id));
}

interface Side {
  label: string;
  url: string;
  description: string;
  caps?: Capabilities;
}

function missingNeeds(scenario: Scenario, caps: Capabilities): Need[] {
  return scenario.needs.filter((need) => !caps[need]);
}

const NEED_TEXT: Record<Need, string> = {
  shell: 'the logged-in shell (#Main) does not render',
  chatList: 'the chat list is not rendered (not ported yet?)',
  folders: 'no folder tabs are rendered',
  inject: 'window.getActions().apiUpdate is not exposed',
};

async function main() {
  if (args.list) {
    for (const scenario of SCENARIOS) log(`${scenario.id.padEnd(16)} ${scenario.title}`);
    return;
  }

  const runs = Math.max(1, Number(args.runs));
  const config: RunConfig = {
    ...DEFAULT_CONFIG,
    cpuRate: DEFAULT_CONFIG.cpuRate, // replaced by the calibrated (or forced) rate below
    trace: !args['no-trace'],
    headed: args.headed,
  };
  const scenarios = selectScenarios();
  const isAA = args.aa;

  // One calibrated rate for the whole invocation: both apps get the same throttling, so the ratios stay valid.
  const calibration = await (async () => {
    const browser = await chromium.launch();
    try {
      return await calibrateCpu(await browser.newContext(), parseRate(args.cpu));
    } finally {
      await browser.close();
    }
  })();
  config.cpuRate = calibration.rate;
  log(describeCalibration(calibration));
  if (calibration.belowTarget) {
    log(
      'WARNING: this machine is below the target device even without throttling: the absolute numbers are not comparable.',
    );
  }

  // Build and serve. In an A/A run both sides are the same tt build behind the same server.
  const served: Served[] = [];
  const sides: Side[] = [];
  const force = args.rebuild;
  const skip = args['no-build'];
  const build = async (id: AppId) => {
    const built = id === 'tt' ? await buildTt({ force, skip }) : await buildDd({ force, skip });
    log(`${id}: ${built.description}`);
    const server = await serveDir(built.dir);
    served.push(server);
    return { built, server };
  };
  const tt = await build('tt');
  if (isAA) {
    sides.push({ label: 'tt-a', url: tt.server.url, description: tt.built.description });
    sides.push({ label: 'tt-b', url: tt.server.url, description: tt.built.description });
  } else {
    const dd = await build('dd');
    sides.push({ label: 'dd', url: dd.server.url, description: dd.built.description });
    sides.push({ label: 'tt', url: tt.server.url, description: tt.built.description });
  }
  const [first, second] = sides;

  const machine: Machine = {
    cpu: cpus()[0]?.model ?? 'unknown',
    cores: cpus().length,
    memoryGb: Math.round(totalmem() / 2 ** 30),
    platform: `${platform()} ${release()}`,
    node: process.version,
    chromium: await chromium.launch().then(async (browser) => {
      const version = browser.version();
      await browser.close();
      return version;
    }),
    uptimeBefore: uptime(),
    uptimeAfter: '',
    loadAverageDuringRuns: { min: 0, median: 0, max: 0 },
  };
  log(`machine: ${machine.cpu}; ${machine.uptimeBefore}`);

  try {
    // What each app can do (our chat list may not exist yet): found once per distinct app.
    const capsByUrl = new Map<string, Capabilities>();
    for (const side of sides) {
      if (!capsByUrl.has(side.url)) {
        capsByUrl.set(side.url, await preflight(side.url + SCENARIO_HASH, config));
      }
      side.caps = capsByUrl.get(side.url);
      log(`${side.label}: ${JSON.stringify(side.caps)}`);
    }

    const results: ScenarioResult[] = scenarios.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      description: scenario.description,
      notApplicable: {},
      runs: {},
      failures: {},
      summary: {},
      ratios: {},
    }));
    results.forEach((result, index) => {
      for (const side of sides) {
        const missing = missingNeeds(scenarios[index], side.caps!);
        if (missing.length) result.notApplicable[side.label] = missing.map((need) => NEED_TEXT[need]).join('; ');
      }
    });

    const loads: number[] = [];
    // Interleaved: run 1 of every scenario for both apps, then run 2, ...; the app order alternates so neither is always
    // the one that runs on a warmer / busier machine.
    for (let run = 0; run < runs; run++) {
      for (const [index, scenario] of scenarios.entries()) {
        const order = (run + index) % 2 === 0 ? sides : [...sides].reverse();
        for (const side of order) {
          const result = results[index];
          if (result.notApplicable[side.label]) continue;
          process.stdout.write(`run ${run + 1}/${runs} ${scenario.id} ${side.label} ... `);
          let outcome: RunResult | undefined;
          for (let attempt = 0; attempt < 2 && !outcome; attempt++) {
            try {
              outcome = await runScenario(
                side.url + (scenario.mockScenario ? `#?mockScenario=${scenario.mockScenario}` : SCENARIO_HASH),
                scenario,
                config,
              );
            } catch (error) {
              const text = error instanceof Error ? error.message.split('\n')[0] : String(error);
              (result.failures[side.label] ??= []).push(text);
              process.stdout.write(`failed (${text}); `);
            }
          }
          if (outcome) {
            (result.runs[side.label] ??= []).push(outcome);
            loads.push(outcome.load1);
            const m = outcome.metrics;
            log(
              `ok (long tasks ${m.longTaskCount}, TBT ${Math.round(m.tbtMs)} ms, script ${Math.round(m.scriptMs ?? 0)} ms)`,
            );
          } else {
            log('no result');
          }
        }
      }
    }

    for (const result of results) finishScenario(result, first.label, second.label);
    machine.uptimeAfter = uptime();
    machine.loadAverageDuringRuns = loads.length
      ? { min: Math.min(...loads), median: median(loads), max: Math.max(...loads) }
      : { min: loadavg()[0], median: loadavg()[0], max: loadavg()[0] };

    const apps: AppSummary[] = sides.map(({ label, description }) => ({ label, description }));
    const report: Report = {
      generatedAt: new Date().toISOString(),
      mode: isAA ? 'aa' : 'compare',
      config: {
        runs,
        cpuRate: config.cpuRate,
        cpuCalibration: calibration,
        trace: config.trace,
        scenarios: scenarios.map((scenario) => scenario.id),
      },
      machine,
      apps,
      scenarios: results,
      noise: isAA ? noiseOf(results, first.label, second.label) : undefined,
    };

    const markdown = renderMarkdown(report);
    log(`\n${markdown}`);
    if (!args['no-save']) {
      mkdirSync(RESULTS, { recursive: true });
      const stamp = report.generatedAt.slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
      const name = args.label ?? `${isAA ? 'aa' : 'dd-vs-tt'}-${stamp}`;
      for (const [extension, body] of [
        ['md', markdown],
        ['json', JSON.stringify(report, undefined, 2)],
      ] as const) {
        writeFileSync(join(RESULTS, `${name}.${extension}`), body);
        writeFileSync(join(RESULTS, `latest-${isAA ? 'aa' : 'dd-vs-tt'}.${extension}`), body);
      }
      log(`saved tests/perfcmp/results/${name}.{md,json}`);
    }
  } finally {
    await Promise.all(served.map((server) => server.close()));
  }
}

main().catch((error) => {
  process.stderr.write(`[perfcmp] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exit(1);
});
