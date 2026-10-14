// Self-test of the helper: proves that it really fails on violations and honours the baseline.
import { expect, test } from '@playwright/test';

import { expectAccessible } from './axe';

const BROKEN = '<main><h1>Broken</h1><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><button></button></main>';

test.beforeEach(async ({ page }) => {
  await page.setContent(
    `<!doctype html><html lang="en"><head><title>Broken</title></head><body>${BROKEN}</body></html>`,
  );
});

test('fails on violations that are not in the baseline', async ({ page }) => {
  await expect(expectAccessible(page, undefined, { screen: 'broken', baseline: {} })).rejects.toThrow(/image-alt/);
});

test('passes when the violations are accepted in the baseline', async ({ page }) => {
  await expectAccessible(page, undefined, {
    screen: 'broken',
    baseline: {
      broken: [
        { rule: 'image-alt', target: 'img', reason: 'self-test' },
        { rule: 'button-name', target: 'button', reason: 'self-test' },
      ],
    },
  });
});

test('fails when a baseline entry is stale', async ({ page }) => {
  await expect(
    expectAccessible(page, undefined, {
      screen: 'broken',
      baseline: {
        broken: [
          { rule: 'image-alt', target: 'img', reason: 'self-test' },
          { rule: 'button-name', target: 'button', reason: 'self-test' },
          { rule: 'label', target: 'input', reason: 'no such element' },
        ],
      },
    }),
  ).rejects.toThrow(/no longer occur/);
});

test('can be scoped to a selector', async ({ page }) => {
  await expectAccessible(page, 'h1', { screen: 'broken h1', baseline: {} });
});
