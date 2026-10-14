import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The committed global is immutable and the store mirrors `prev → next` by identity: a nested write into an object
// taken from `getGlobal()` (`global.stories.stateHash = …`) never reaches the mirror. oxlint 1.88 has no
// `no-restricted-syntax`, so this test is the rule (porting guide §3.5, architecture §10).
const NESTED_MUTATION = /\bglobal(\.\w+){2,}\s*=(?!=)/;
const ROOT = resolve(import.meta.dirname, '../../..');

describe('no nested mutation of the committed global', () => {
  it('src/global and src/util contain no `global.a.b = …` assignment', () => {
    const files = globSync(['src/global/**/*.ts', 'src/util/**/*.ts'], { cwd: ROOT }).filter(
      (f) => !/\.test\.tsx?$/.test(f) && !f.endsWith('mutationGuard.test.ts'),
    );
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((f) => {
      const source = readFileSync(resolve(ROOT, f), 'utf8');
      return source.split('\n').some((line) => NESTED_MUTATION.test(line) && !line.includes('// Deviation'));
    });
    expect(offenders).toEqual([]);
  });

  it('the pattern matches what it should', () => {
    expect(NESTED_MUTATION.test("global.stories.stateHash = 'h';")).toBe(true);
    expect(NESTED_MUTATION.test('global.isCacheApiSupported = true;')).toBe(false); // root level: absorbed by the copy
    expect(NESTED_MUTATION.test('if (global.a.b === c) {')).toBe(false);
  });
});
