// pnpm codemod:typecheck [tt paths…]: does the codemod output of a sample of components typecheck against frameact once
// its imports resolve? The transformed files are written under .cache/codemod/typecheck/src and checked with a tsconfig
// whose `rootDirs` merge three trees: the transformed sample, our src/ (ported modules win), and the telegram-tt
// reference (everything not ported yet, teact-typed). Only diagnostics inside the sample files are reported; the
// reference's own teact errors are expected noise and are counted separately.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { c, findReference, parseArgs, ROOT } from '../gates/lib/common.ts';
import { transformSource } from './transform.ts';

const OUT = join(ROOT, '.cache/codemod/typecheck');

/** Small, list, modal, animated, connected, async wrapper, hook: the representative sample (docs/codemod.md). */
export const DEFAULT_SAMPLE = [
  'src/components/ui/Spinner.tsx',
  'src/components/ui/Loading.tsx',
  'src/components/ui/Link.tsx',
  'src/components/ui/RippleEffect.tsx',
  'src/components/ui/Button.tsx',
  'src/components/ui/Modal.tsx',
  'src/components/ui/Notification.tsx',
  'src/components/common/Notifications.tsx',
  'src/components/common/CustomEmojiSetsModal.tsx',
  'src/components/middle/PremiumRequiredPlaceholder.tsx',
  'src/components/common/CalendarModal.async.tsx',
  'src/hooks/useFlag.ts',
];

interface Diagnostic {
  file: string;
  line: number;
  code: string;
  message: string;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const reference = findReference();
  if (!reference) {
    console.error(c.red('the telegram-tt reference is needed (reference/telegram-tt or $TT_REFERENCE)'));
    process.exit(1);
  }
  const files = args.rest.length ? args.rest : DEFAULT_SAMPLE;

  mkdirSync(OUT, { recursive: true });
  const todosByFile = new Map<string, number>();
  for (const file of files) {
    const source = readFileSync(join(reference, file), 'utf8');
    const { code, report } = transformSource(source, { filePath: file });
    const target = join(OUT, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, code);
    todosByFile.set(file, report.todos.length);
  }

  const base = JSON.parse(readFileSync(join(ROOT, 'tsconfig.json'), 'utf8').replace(/^\s*\/\/.*$/gm, '')) as {
    compilerOptions: Record<string, unknown>;
  };
  const tsconfig = {
    compilerOptions: {
      ...base.compilerOptions,
      rootDirs: ['./src', relative(OUT, join(ROOT, 'src')), relative(OUT, join(reference, 'src'))],
      noEmit: true,
      skipLibCheck: true,
      // the reference is checked only as far as the sample imports it; its own teact errors are filtered below
      noUnusedLocals: false,
    },
    include: ['./src/**/*', relative(OUT, join(ROOT, 'src/@types')) + '/**/*'],
  };
  writeFileSync(join(OUT, 'tsconfig.json'), JSON.stringify(tsconfig, undefined, 2));

  let output = '';
  try {
    output = execFileSync('pnpm', ['exec', 'tsc', '-p', join(OUT, 'tsconfig.json'), '--pretty', 'false'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    output = String((error as { stdout?: string }).stdout ?? '');
  }
  const diagnostics: Diagnostic[] = [];
  for (const line of output.split('\n')) {
    const match = /^(.*?)\((\d+),\d+\): error (TS\d+): (.*)$/.exec(line);
    if (match) diagnostics.push({ file: match[1], line: Number(match[2]), code: match[3], message: match[4] });
  }
  const samplePrefix = relative(ROOT, OUT) + '/';
  const inSample = diagnostics.filter((d) => d.file.startsWith(samplePrefix) || d.file.startsWith(OUT));
  const elsewhere = diagnostics.length - inSample.length;

  console.log(c.bold(`\nSample typecheck (${files.length} files; ${elsewhere} diagnostics in dependencies ignored)\n`));
  for (const file of files) {
    const own = inSample.filter((d) => d.file.endsWith(file));
    const status = own.length ? c.yellow(`${own.length} errors`) : c.green('ok');
    console.log(`${status.padEnd(18)} ${file}  ${c.dim(`TODOs: ${todosByFile.get(file)}`)}`);
    const seen = new Set<string>();
    for (const d of own) {
      const key = `${d.code} ${d.message.slice(0, 100)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (seen.size > (args.flags.has('all') ? 1000 : 6)) {
        console.log(c.dim('    …'));
        break;
      }
      console.log(c.dim(`    L${d.line} ${d.code} ${d.message.slice(0, 150)}`));
    }
  }
  const codes: Record<string, number> = {};
  for (const d of inSample) codes[d.code] = (codes[d.code] ?? 0) + 1;
  console.log(c.bold('\nBy error code (sample files only)'));
  for (const [code, count] of Object.entries(codes).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code.padEnd(8)} ${count}`);
  }
  console.log(c.dim(`\noutput: ${relative(ROOT, OUT)}/`));
}

main();
