import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { extraFiles } from '../../scripts/visual/tt-patches.mjs';

// Both apps must serve the same deterministic data: our MockClient scenarios are a verbatim port of tt's.
// If this fails, a scenario was edited in one place only and every screen diff is suspect.
const ROOT = resolve(import.meta.dirname, '../..');
const SCENARIOS = 'src/lib/gramjs/client/__mocks__';
const reference = [
  process.env.TT_REFERENCE,
  resolve(ROOT, 'reference/telegram-tt'),
  resolve(ROOT, '../../reference/telegram-tt'),
].find((path) => path && existsSync(resolve(path, SCENARIOS)));

const hash = (path: string) => createHash('sha1').update(readFileSync(path)).digest('hex');

test('mock scenarios are identical in our app and in telegram-tt', () => {
  test.skip(!reference, 'reference/telegram-tt is not available');
  const files = readdirSync(resolve(ROOT, SCENARIOS)).filter((file) => file.endsWith('.json'));
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    // A scenario of ours that telegram-tt does not have is added to the COPY of tt (scripts/visual/tt-patches.mjs
    // `extraFiles`), never to `reference/`: it must be listed there, and the copy must hold the same bytes when it exists.
    if (!existsSync(resolve(reference!, SCENARIOS, file))) {
      const relative = `${SCENARIOS}/${file}`;
      expect(extraFiles, `${file} is not in telegram-tt: add it to extraFiles`).toContain(relative);
      const copy = resolve(ROOT, '.cache/tt-run', relative);
      if (existsSync(copy)) expect(hash(copy), `${file} in the tt copy`).toBe(hash(resolve(ROOT, relative)));
      continue;
    }
    expect(hash(resolve(ROOT, SCENARIOS, file)), file).toBe(hash(resolve(reference!, SCENARIOS, file)));
  }
});
