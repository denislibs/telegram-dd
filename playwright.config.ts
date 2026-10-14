// Browser gates that run against our vite dev server (stricterdom on): strict e2e and a11y.
// Perf gates (production build): playwright.perf.config.ts. Visual vs telegram-tt: playwright.visual.config.ts.
import { defineConfig, devices } from '@playwright/test';

import { DEV_PORT, DEV_URL, E2E_ENV } from './tests/config';

export default defineConfig({
  timeout: 30_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  fullyParallel: true,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results/e2e',
  use: {
    baseURL: DEV_URL,
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
    ...devices['Desktop Chrome'],
  },
  projects: [
    { name: 'e2e', testDir: 'tests/e2e' },
    { name: 'a11y', testDir: 'tests/a11y' },
  ],
  webServer: {
    command: `pnpm exec vite --mode development --port ${DEV_PORT} --host 127.0.0.1`,
    url: DEV_URL,
    env: E2E_ENV,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
