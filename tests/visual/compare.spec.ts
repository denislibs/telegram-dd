import { expect, type Page, test } from '@playwright/test';

import { DEV_URL, TT_URL } from '../config';
import { deterministicContextOptions, freezeClock, makeDeterministic, settle } from './determinism';
import { diffScreenshots } from './diff';
import { DEFAULT_SCENARIO, DEFAULT_VIEWPORT, screens, type VisualScreen, type VisualTarget } from './screens';

const ORIGINS = { tt: TT_URL, ours: DEV_URL };

/** Opens one side of a comparison and returns its screenshot. */
async function capture(page: Page, screen: VisualScreen, target: VisualTarget) {
  const scenario = screen.scenario ?? DEFAULT_SCENARIO;
  // Both apps read the mock scenario from the URL hash (`#?mockScenario=<name>`), as telegram-tt does.
  const url = new URL(target.path, ORIGINS[target.app]);
  url.hash = `?mockScenario=${scenario}`;

  await freezeClock(page);
  await page.goto(url.href);
  for (const selector of target.ready) {
    await expect(page.locator(selector).first(), `${target.app}: "${selector}" is ready`).toBeVisible();
  }
  await target.prepare?.(page);
  await settle(page);

  const mask = (screen.mask ?? []).map((selector) => page.locator(selector));
  const subject = screen.selector ? page.locator(screen.selector).first() : page;
  return subject.screenshot({ animations: 'disabled', caret: 'hide', mask, maskColor: '#ff00ff' });
}

for (const screen of screens) {
  const run = screen.ported ? test : test.skip;

  run(`${screen.name} (${screen.reference.app} vs ${screen.candidate.app})`, async ({ browser }, testInfo) => {
    const options = deterministicContextOptions(screen.viewport ?? DEFAULT_VIEWPORT);
    const shots: Buffer[] = [];

    // Separate contexts: no shared storage / caches / service state between the two apps.
    for (const target of [screen.reference, screen.candidate]) {
      const context = await browser.newContext(options);
      await makeDeterministic(context);
      try {
        shots.push(await capture(await context.newPage(), screen, target));
      } finally {
        await context.close();
      }
    }

    const result = diffScreenshots(screen.name, shots[0], shots[1], screen.pixelThreshold);
    for (const [label, path] of Object.entries(result.files)) {
      await testInfo.attach(`${screen.name}.${label}`, { path, contentType: 'image/png' });
    }
    const percent = (result.ratio * 100).toFixed(3);
    const summary = `${result.diffPixels} px differ (${percent}% of ${result.width}x${result.height}); threshold ${screen.threshold * 100}%`;
    testInfo.annotations.push({ type: 'diff', description: summary });

    if (screen.expect === 'differ') {
      expect(result.ratio, `expected a visible difference: ${summary}`).toBeGreaterThan(screen.threshold);
    } else {
      expect(result.ratio, `${summary}; see ${result.files.diff}`).toBeLessThanOrEqual(screen.threshold);
    }
  });
}
