import type { BrowserContext, Page } from '@playwright/test';

// A fixed instant (the date of the tt baseline): `Date.now()` / `new Date()` return it in both apps.
export const FIXED_TIME = new Date('2026-10-12T12:00:00.000Z');

/** Context options that make both browsers render the same pixels: locale, timezone, DPR, colours, motion. */
export const deterministicContextOptions = (viewport: { width: number; height: number }) => ({
  viewport,
  deviceScaleFactor: 1,
  locale: 'en-US',
  timezoneId: 'UTC',
  colorScheme: 'light' as const,
  reducedMotion: 'reduce' as const,
  serviceWorkers: 'block' as const,
});

/** Page-level determinism: fixed clock, seeded Math.random, no animations / transitions / carets. */
export async function makeDeterministic(context: BrowserContext) {
  await context.addInitScript(() => {
    // mulberry32: the same sequence on every load
    let seed = 0x2f6e2b1;
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
}

export async function freezeClock(page: Page) {
  await page.clock.setFixedTime(FIXED_TIME);
}

const FREEZE_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
`;

/** Called right before the screenshot, after the screen is ready. */
export async function settle(page: Page) {
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
