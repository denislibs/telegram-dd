// Screen registry of the visual-comparison gate (docs/quality-gates.md). One entry per screen / state; the runner
// (compare.spec.ts) opens `reference` (always the telegram-tt copy) and `candidate` (our app) with the same mock
// scenario, screenshots both and diffs them.
//
// Adding a ported screen: copy a `ported: false` entry, point `candidate.path` at the route / state that shows it in
// our app, set `ported: true`, run `pnpm test:visual`, look at tests/visual/__diff__/<name>.diff.png.

export type VisualApp = 'tt' | 'ours';

export interface VisualTarget {
  app: VisualApp;
  /** Path + query (+ hash) opened on that app's origin. The mock scenario is appended to the hash (see below). */
  path: string;
  /** Selectors that must be visible before the screenshot: the "screen is ready" contract. */
  ready: string[];
  /** Extra steps after `ready` (open a chat, click a tab, ...). Keep both targets' steps equivalent. */
  prepare?: (page: import('@playwright/test').Page) => Promise<void>;
}

export interface VisualScreen {
  /** Unique, file-name safe: used for `__diff__/<name>.*.png`. */
  name: string;
  /** false: the screen is not ported yet, the entry is skipped (kept as the to-do list of the port). */
  ported: boolean;
  /** Mock scenario: src/lib/gramjs/client/__mocks__/<scenario>.json (default: `default`). */
  scenario?: string;
  reference: VisualTarget;
  candidate: VisualTarget;
  /** Capture only this element (default: the whole viewport). Resolved on each app separately. */
  selector?: string;
  /** Elements painted over before diffing, for state that is nondeterministic or irrelevant (a sync spinner, a clock). */
  mask?: string[];
  viewport?: { width: number; height: number };
  /** Max share of differing pixels (0..1) for the screen to pass. 0 = pixel-perfect. */
  threshold: number;
  /** pixelmatch per-pixel colour distance (0..1, default 0.1): raise for anti-aliasing / font-rendering noise. */
  pixelThreshold?: number;
  /**
   * 'match' (default): the screens must be (almost) identical. 'differ': the diff must be ABOVE the threshold; only
   * for harness self-checks that prove the runner can see a difference.
   */
  expect?: 'match' | 'differ';
}

export const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
export const DEFAULT_SCENARIO = 'default';

// The mocked backend never answers some sync requests, so tt's search field settles on a spinner a second after the
// chat list appears: wait for it too, or the screenshot races the icon swap.
// It is also masked: a spinner is the one thing that is never pixel-identical between two loads.
const TT_MAIN_READY = ['#LeftColumn .chat-list .ListItem', '#LeftColumn .SearchInput .Spinner'];
const TT_MAIN_MASK = ['#LeftColumn .SearchInput .Spinner'];

export const screens: VisualScreen[] = [
  // --- harness self-checks (real, run today) ------------------------------------------------------------------
  {
    // The same tt screen twice: proves the harness is deterministic (clock, random, animations, fonts, data).
    name: 'harness-tt-vs-tt',
    ported: true,
    reference: { app: 'tt', path: '/', ready: TT_MAIN_READY },
    candidate: { app: 'tt', path: '/', ready: TT_MAIN_READY },
    mask: TT_MAIN_MASK,
    threshold: 0,
  },
  {
    // tt's main screen vs our current placeholder: the runner must report a big diff.
    name: 'harness-detects-difference',
    ported: true,
    reference: { app: 'tt', path: '/', ready: TT_MAIN_READY },
    candidate: { app: 'ours', path: '/', ready: ['#Main'] },
    mask: TT_MAIN_MASK,
    threshold: 0.02,
    expect: 'differ',
  },

  // --- the port's to-do list (skipped until `ported: true`) -----------------------------------------------------
  {
    name: 'main-chat-list',
    ported: false,
    reference: { app: 'tt', path: '/', ready: TT_MAIN_READY },
    candidate: { app: 'ours', path: '/', ready: TT_MAIN_READY },
    selector: '#LeftColumn',
    mask: TT_MAIN_MASK,
    threshold: 0.001,
  },
  {
    name: 'main-menu',
    ported: false,
    reference: {
      app: 'tt',
      path: '/',
      ready: TT_MAIN_READY,
      prepare: (page) => page.getByRole('button', { name: 'Open menu' }).click(),
    },
    candidate: {
      app: 'ours',
      path: '/',
      ready: TT_MAIN_READY,
      prepare: (page) => page.getByRole('button', { name: 'Open menu' }).click(),
    },
    mask: TT_MAIN_MASK,
    threshold: 0.001,
  },
  {
    name: 'chat-with-history',
    ported: false,
    scenario: 'history',
    reference: { app: 'tt', path: '/', ready: TT_MAIN_READY },
    candidate: { app: 'ours', path: '/', ready: TT_MAIN_READY },
    mask: TT_MAIN_MASK,
    threshold: 0.002,
  },
];
