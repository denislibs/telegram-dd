// Perf gates (leaks, long tasks under CPU throttling) run against a PRODUCTION build served by `vite preview`:
// no stricterdom, no HMR, minified code, i.e. what users run. Tests run serially so they do not steal CPU from each other.
import { defineConfig, devices } from '@playwright/test';

import { E2E_ENV, PREVIEW_PORT, PREVIEW_URL } from './tests/config';

export default defineConfig({
  testDir: 'tests/perf',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-perf' }]] : 'list',
  outputDir: 'test-results/perf',
  use: {
    baseURL: PREVIEW_URL,
    serviceWorkers: 'block',
    // the dates of the mocked scenarios are written in UTC: the same day separators and times on every machine and in CI
    locale: 'en-US',
    timezoneId: 'UTC',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command:
      `pnpm exec vite build --outDir .cache/dist-e2e --emptyOutDir && ` +
      `pnpm exec vite preview --outDir .cache/dist-e2e --port ${PREVIEW_PORT} --host 127.0.0.1 --strictPort`,
    url: PREVIEW_URL,
    env: E2E_ENV,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
