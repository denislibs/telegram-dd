// All script gates in one go.
//
//   pnpm gates                       # diff, upstream (report), tests, licenses, then build + size
//   pnpm gates --no-build            # size uses the existing dist/ (skipped when there is none)
//   pnpm gates --only diff,tests     # a subset (names: diff, upstream, tests, licenses, size)
//   pnpm gates --strict              # upstream drift fails too
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { c, GATES_DIR, parseArgs, ROOT, table } from './lib/common.ts';

type Gate = { name: string; script: string; args?: string[]; informational?: boolean };

const args = parseArgs(process.argv.slice(2), ['only']);
const only = args.values.get('only')?.split(',');
const strict = args.flags.has('strict');

const gates: Gate[] = [
  { name: 'diff', script: 'diff.ts' },
  { name: 'upstream', script: 'upstream.ts', args: strict ? ['--strict'] : [], informational: !strict },
  { name: 'tests', script: 'tests.ts' },
  { name: 'licenses', script: 'licenses.ts' },
  { name: 'size', script: 'size.ts' },
];

const run = (command: string, commandArgs: string[]): number =>
  spawnSync(command, commandArgs, { cwd: ROOT, stdio: 'inherit' }).status ?? 1;
const runGate = (gate: Gate): number =>
  run(process.execPath, ['--import', 'tsx', join(GATES_DIR, gate.script), ...(gate.args ?? [])]);

const summary: string[][] = [['gate', 'result', 'time']];
let failed = 0;
for (const gate of gates) {
  if (only && !only.includes(gate.name)) {
    continue;
  }
  console.log(`\n${c.cyan('==')} ${c.bold(`gates:${gate.name}`)}`);
  const started = Date.now();
  let status: number;
  if (gate.name !== 'size') {
    status = runGate(gate);
  } else if (!args.flags.has('no-build') && run('pnpm', ['build']) !== 0) {
    status = 1;
  } else if (!existsSync(join(ROOT, 'dist'))) {
    console.log(c.yellow('skipped: no dist/ (run `pnpm build`, or drop --no-build)'));
    summary.push([gate.name, c.yellow('skipped'), '']);
    continue;
  } else {
    status = runGate(gate);
  }
  const seconds = `${((Date.now() - started) / 1000).toFixed(1)}s`;
  if (status === 0) {
    summary.push([gate.name, gate.informational ? c.green('reported') : c.green('pass'), seconds]);
  } else {
    failed++;
    summary.push([gate.name, c.red(status === 2 ? 'ERROR' : 'FAIL'), seconds]);
  }
}

console.log(`\n${c.bold('Script gates')}\n${table(summary)}`);
process.exit(failed ? 1 : 0);
