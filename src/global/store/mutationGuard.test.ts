import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The committed global is immutable and the store mirrors `prev → next` by identity: a nested write into an object
// taken from `getGlobal()` (`global.stories.stateHash = …`) never reaches the mirror. oxlint 1.88 has no
// `no-restricted-syntax`, so this test is the rule (porting guide §3.5, architecture §10).
//
// It matches, on any variable named `…global`/`…Global`: an assignment (also compound) to a path two or more levels
// deep, `delete` of such a path, a bracket assignment, and the mutating methods of arrays/maps/sets under such a path.
const NESTED_MUTATION = new RegExp(
  [
    String.raw`\b\w*[gG]lobal(\.\w+){2,}\s*([-+*/%|&^?]{1,3})?=(?![=>])`, // global.a.b = / += / ||= / ??=
    String.raw`\bdelete\s+\w*[gG]lobal(\.\w+){2,}`, // delete global.a.b
    String.raw`\b\w*[gG]lobal(\.\w+)+\[[^\]]+\]\s*([-+*/%|&^?]{1,3})?=(?![=>])`, // global.a[key] =
    String.raw`\b\w*[gG]lobal(\.\w+){2,}\.(push|pop|shift|unshift|splice|sort|reverse|set|add|delete|clear|fill)\(`,
  ].join('|'),
);
const ROOT = resolve(import.meta.dirname, '../../..');

// Lines that match but are safe, with the reason. A line is exempt by `// Deviation` on it (the rewrite is not needed
// there) or by this list (tt's code stays byte-identical).
const SAFE_IN_TT_CODE: Record<string, { line: string; why: string }[]> = {
  'src/util/init.ts': [
    {
      line: "global.auth.state = 'authorizationStateReady'",
      why: '`global` is `cloneDeep(INITIAL_GLOBAL_STATE)` or the freshly loaded cache: not committed yet, setGlobal(global) follows',
    },
  ],
};

describe('no nested mutation of the committed global', () => {
  it('src/global and src/util contain no `global.a.b = …` style mutation', () => {
    const files = globSync(['src/global/**/*.ts', 'src/util/**/*.ts', 'src/util/**/*.tsx'], { cwd: ROOT }).filter(
      (f) => !/\.test\.tsx?$/.test(f) && !f.endsWith('mutationGuard.test.ts'),
    );
    expect(files.length).toBeGreaterThan(100);
    const offenders = files.flatMap((f) => {
      const safe = SAFE_IN_TT_CODE[f] ?? [];
      return readFileSync(resolve(ROOT, f), 'utf8')
        .split('\n')
        .filter(
          (line) =>
            NESTED_MUTATION.test(line) &&
            !line.includes('// Deviation') &&
            !safe.some(({ line: allowed }) => line.includes(allowed)),
        )
        .map((line) => `${f}: ${line.trim()}`);
    });
    expect(offenders).toEqual([]);
  });

  it('every safe-listed line still exists (the list does not rot)', () => {
    for (const [file, entries] of Object.entries(SAFE_IN_TT_CODE)) {
      const source = readFileSync(resolve(ROOT, file), 'utf8');
      for (const { line } of entries) expect(source).toContain(line);
    }
  });

  it('the pattern matches what it should', () => {
    const bad = [
      "global.stories.stateHash = 'h';",
      'global.stories.count += 1;',
      'global.a.b ||= c;',
      'global.chats.byId[id] = chat;',
      'delete global.chats.byId.x;',
      'newGlobal.messages.byChatId.list.push(1);',
    ];
    const good = [
      'global.isCacheApiSupported = true;', // root level: absorbed by the shallow copy
      'if (global.a.b === c) {',
      'const x = global.a.b;',
      'global = { ...global, stories: { ...global.stories, hasNext } };',
      'global.chats.byId.x.map((a) => a);',
      'const fn = (global.a.b) => 1;',
    ];
    for (const line of bad) expect(NESTED_MUTATION.test(line), line).toBe(true);
    for (const line of good) expect(NESTED_MUTATION.test(line), line).toBe(false);
  });
});
