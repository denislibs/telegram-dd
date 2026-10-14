import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config.ts';

export default defineConfig((configEnv) =>
  mergeConfig(viteConfig(configEnv), {
    define: {
      APP_REVISION: JSON.stringify('vitest-test'),
      APP_VERSION: JSON.stringify('0.0.1'),
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['src/dev/vitestSetup.ts'],
      // tests/{e2e,a11y,perf,visual} are Playwright specs (docs/quality-gates.md), run by `pnpm test:*`, not by vitest.
      // tests/perfcmp holds the unit tests of the performance-comparison harness (trace analysis, statistics).
      exclude: [
        ...configDefaults.exclude,
        'reference/**',
        'src/vendor/**',
        '.worktrees/**',
        '.cache/**',
        'tests/e2e/**',
        'tests/a11y/**',
        'tests/perf/**',
        'tests/visual/**',
      ],
    },
  }),
);
