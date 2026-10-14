// Clones the telegram-tt reference at the baseline commit recorded in NOTICE.md (for CI and fresh checkouts).
//
//   pnpm gates:reference
//
// Does nothing when a reference clone already exists (it never touches an existing one).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { c, findReference, git, readBaseCommit, ROOT } from './lib/common.ts';

const existing = findReference();
if (existing) {
  const head = git(existing, ['rev-parse', 'HEAD']).trim();
  console.log(`reference present: ${existing} @ ${head.slice(0, 7)}`);
  process.exit(0);
}

const base = readBaseCommit();
const dir = join(ROOT, 'reference/telegram-tt');
mkdirSync(dir, { recursive: true });
console.log(c.dim(`cloning Ajaxy/telegram-tt @ ${base.slice(0, 7)} into ${dir}`));
git(dir, ['init', '--quiet']);
git(dir, ['remote', 'add', 'origin', 'https://github.com/Ajaxy/telegram-tt.git']);
git(dir, ['fetch', '--quiet', '--depth', '1', 'origin', base]);
git(dir, ['checkout', '--quiet', '--detach', 'FETCH_HEAD']);
console.log(`reference ready: ${dir} @ ${base.slice(0, 7)}`);
