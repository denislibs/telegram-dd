// Original test (not in telegram-tt): the grammars of highlight.js that the build can load on demand.
import { describe, expect, it } from 'vitest';

import { LANGUAGE_MODULES } from './highlightCode';

describe('the grammars of highlight.js', () => {
  it('are the `es/languages/<name>.js` files, each once (not also as the deprecated `<name>.js.js`)', () => {
    const paths = Object.keys(LANGUAGE_MODULES);
    expect(paths.length).toBeGreaterThan(100);
    expect(paths.some((path) => path.endsWith('.js.js'))).toBe(false);
    expect(paths.some((path) => path.endsWith('/es/languages/javascript.js'))).toBe(true);
  });
});
