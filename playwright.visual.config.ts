// Visual comparison with telegram-tt: runs our app and a patched COPY of the reference (.cache/tt-run, made by
// scripts/visual/tt-run.mjs from reference/telegram-tt, which is never modified) side by side, with the same mock
// data, and diffs screenshots per screen (tests/visual/screens.ts). Diffs land in tests/visual/__diff__/.
import { defineConfig, devices } from '@playwright/test';

import { DEV_PORT, DEV_URL, E2E_ENV, TT_PORT, TT_URL } from './tests/config';

export default defineConfig({
  testDir: 'tests/visual',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-visual' }]] : 'list',
  outputDir: 'test-results/visual',
  use: {
    baseURL: DEV_URL,
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: `pnpm exec vite --mode development --port ${DEV_PORT} --host 127.0.0.1`,
      url: DEV_URL,
      env: E2E_ENV,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Copies reference/telegram-tt on first use and runs `npm install` there: slow once, cached in .cache/tt-run.
      command: 'node scripts/visual/tt-run.mjs serve',
      url: TT_URL,
      env: { TT_PORT: String(TT_PORT) },
      stderr: 'ignore', // tt forwards its browser console errors to the dev-server log; they are not ours
      reuseExistingServer: !process.env.CI,
      timeout: 600_000,
    },
  ],
});
