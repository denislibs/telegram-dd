import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
    expect(hash(resolve(ROOT, SCENARIOS, file)), file).toBe(hash(resolve(reference!, SCENARIOS, file)));
  }
});
