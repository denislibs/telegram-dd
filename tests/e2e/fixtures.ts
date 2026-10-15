// The `test` every e2e test imports instead of `@playwright/test`'s: the test fails when its page produced a
// console.error / console.warn, an uncaught error, a failed request to the app origin or a stricterdom violation.
//
//   import { expect, test } from './fixtures';
//   test.use({ strictOptions: { ignoreConsole: [/known noise/] } }); // only with a reason
import { expect, test as base } from '@playwright/test';

import { createStrictMonitor, DEFAULT_STRICT_OPTIONS, type StrictOptions } from './strictMonitor';

// `getMediaFormat` returns `Progressive` for every video when `IS_PROGRESSIVE_SUPPORTED` (`'serviceWorker' in navigator`), and a
// blocked service worker still leaves the property: the app would request `./progressive/<hash>` from the dev server (404). The gates
// remove the property before any script runs, so every media loads as a blob from the mock (decision D1); `progressive.spec.ts`
// runs with `keepServiceWorker` and proves the streaming path on our build.
export const DISABLE_SERVICE_WORKER = () => {
  delete (Navigator.prototype as { serviceWorker?: unknown }).serviceWorker;
};

export const test = base.extend<{ strictOptions: Partial<StrictOptions>; keepServiceWorker: boolean }>({
  strictOptions: [DEFAULT_STRICT_OPTIONS, { option: true }],
  keepServiceWorker: [false, { option: true }],

  context: async ({ context, keepServiceWorker }, use) => {
    if (!keepServiceWorker) await context.addInitScript(DISABLE_SERVICE_WORKER);
    await use(context);
  },

  page: async ({ page, baseURL, strictOptions }, use) => {
    const monitor = createStrictMonitor(page, new URL(baseURL ?? 'http://127.0.0.1').origin, strictOptions);

    await use(page);

    // Let trailing effects and frame phases run so that late violations are recorded before the check.
    if (!page.isClosed()) await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(0))));
    expect(await monitor.problems(), 'strict e2e gate: the page must be clean').toEqual([]);
  },
});

export { expect };
export type { StrictOptions };
