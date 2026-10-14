// The `test` every e2e test imports instead of `@playwright/test`'s: the test fails when its page produced a
// console.error / console.warn, an uncaught error, a failed request to the app origin or a stricterdom violation.
//
//   import { expect, test } from './fixtures';
//   test.use({ strictOptions: { ignoreConsole: [/known noise/] } }); // only with a reason
import { expect, test as base } from '@playwright/test';

import { createStrictMonitor, DEFAULT_STRICT_OPTIONS, type StrictOptions } from './strictMonitor';

export const test = base.extend<{ strictOptions: Partial<StrictOptions> }>({
  strictOptions: [DEFAULT_STRICT_OPTIONS, { option: true }],

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
