import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASELINE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'baseline.json');

/** An accepted (known, tracked) violation of one screen. */
export interface AcceptedViolation {
  /** axe rule id, e.g. `color-contrast`. */
  rule: string;
  /** CSS selector axe reports for the offending element (the first of its `target`). */
  target: string;
  /** Why it is accepted and what removes it. Required: a baseline entry without a reason is a hidden bug. */
  reason: string;
}

export type A11yBaseline = Record<string, AcceptedViolation[]>;

export interface ExpectAccessibleOptions {
  /** Baseline key, one per screen / state (default: the test title). */
  screen?: string;
  /** Overrides the file baseline (self-tests). */
  baseline?: A11yBaseline;
}

// WCAG 2.0 / 2.1 A + AA: what the app is held to. Best-practice rules are opt-in per screen if ever needed.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

function readBaseline(): A11yBaseline {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as A11yBaseline;
  } catch {
    return {};
  }
}

const keyOf = (item: { rule: string; target: string }) => `${item.rule} @ ${item.target}`;

/**
 * Runs axe-core on the page (or on `selector`) and fails on every violation that is not in the screen's baseline entry
 * (tests/a11y/baseline.json). It also fails on baseline entries that no longer occur, so the baseline only shrinks.
 * `A11Y_UPDATE_BASELINE=1 pnpm test:a11y` rewrites the screen's entry from the current violations (fill in the reasons).
 */
export async function expectAccessible(page: Page, selector?: string, options: ExpectAccessibleOptions = {}) {
  const screen = options.screen ?? test.info().title;
  const builder = new AxeBuilder({ page }).withTags(TAGS);
  if (selector) builder.include(selector);
  const { violations } = await builder.analyze();

  const found = violations.flatMap((violation) =>
    violation.nodes.map((node) => ({
      rule: violation.id,
      target: String(node.target[0]),
      impact: violation.impact ?? 'unknown',
      help: violation.help,
      helpUrl: violation.helpUrl,
    })),
  );

  const fileBaseline = readBaseline();
  if (process.env.A11Y_UPDATE_BASELINE === '1' && !options.baseline) {
    const previous = fileBaseline[screen] ?? [];
    const next = found.map(
      ({ rule, target }) =>
        previous.find((item) => keyOf(item) === keyOf({ rule, target })) ?? { rule, target, reason: 'TODO: explain' },
    );
    if (next.length) fileBaseline[screen] = next;
    else delete fileBaseline[screen];
    writeFileSync(BASELINE_PATH, `${JSON.stringify(fileBaseline, undefined, 2)}\n`);
    return;
  }

  const accepted = (options.baseline ?? fileBaseline)[screen] ?? [];
  const acceptedKeys = new Set(accepted.map(keyOf));
  const foundKeys = new Set(found.map(keyOf));

  const unexpected = found.filter((item) => !acceptedKeys.has(keyOf(item)));
  const stale = accepted.filter((item) => !foundKeys.has(keyOf(item)));

  expect(
    unexpected.map((item) => `[${item.impact}] ${item.rule} @ ${item.target}: ${item.help} (${item.helpUrl})`),
    `new accessibility violations on "${screen}" (fix them, or accept them in tests/a11y/baseline.json with a reason)`,
  ).toEqual([]);
  expect(
    stale.map((item) => keyOf(item)),
    `baseline entries of "${screen}" that no longer occur: remove them from tests/a11y/baseline.json`,
  ).toEqual([]);
}
