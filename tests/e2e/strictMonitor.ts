import type { Page } from '@playwright/test';

// Console noise that is not ours and cannot be fixed in the app (headless Chromium without a GPU, devtools hints).
// Add to this list only with a reason: every entry hides a class of problems from the gate.
export const DEFAULT_IGNORED_CONSOLE = [
  /GL Driver Message/, // headless Chromium software WebGL ("GPU stall due to ReadPixels")
  /\[vite\]/, // HMR client chatter
];

export interface StrictOptions {
  /** Console messages (error / warning) that are allowed in this test. */
  ignoreConsole: (string | RegExp)[];
  /** Failed or >= 400 requests to the app origin that are allowed (matched against `METHOD url`). */
  ignoreRequests: (string | RegExp)[];
}

export const DEFAULT_STRICT_OPTIONS: StrictOptions = { ignoreConsole: [], ignoreRequests: [] };

interface StrictViolation {
  kind: string;
  detail: string;
  phase: string;
  path: string | null;
  message: string;
}

function matches(value: string, patterns: (string | RegExp)[]) {
  return patterns.some((pattern) => (typeof pattern === 'string' ? value.includes(pattern) : pattern.test(value)));
}

/**
 * Watches a page for everything the strict e2e gate forbids:
 *  - console.error / console.warn,
 *  - uncaught page errors (exceptions and unhandled rejections),
 *  - failed requests and HTTP >= 400 responses from the app origin,
 *  - stricterdom violations (recorded on `window.__strictViolations` by src/dev/stricterdomRecorder.ts).
 * `problems()` returns human-readable lines; an empty array means the page was clean.
 */
export function createStrictMonitor(page: Page, appOrigin: string, options: Partial<StrictOptions> = {}) {
  const ignoreConsole = [...DEFAULT_IGNORED_CONSOLE, ...(options.ignoreConsole ?? [])];
  const ignoreRequests = options.ignoreRequests ?? [];
  const problems: string[] = [];
  const isAppUrl = (url: string) => url.startsWith(appOrigin);

  page.on('console', (message) => {
    const type = message.type();
    if (type !== 'error' && type !== 'warning') return;
    const text = message.text();
    // stricterdom errors are reported through the recorder below, with their phase and effect path
    if (text.includes('[frameact/stricterdom]') || text.includes('StrictViolationError')) return;
    if (matches(text, ignoreConsole)) return;
    const { url, lineNumber } = message.location();
    problems.push(`console.${type === 'warning' ? 'warn' : 'error'}: ${text}${url ? ` (${url}:${lineNumber})` : ''}`);
  });

  page.on('pageerror', (error) => {
    problems.push(`uncaught page error: ${error.stack ?? error.message}`);
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown';
    // A request cancelled by a navigation / reload is not a failure of the app.
    if (!isAppUrl(request.url()) || failure === 'net::ERR_ABORTED') return;
    const label = `${request.method()} ${request.url()}`;
    if (matches(label, ignoreRequests)) return;
    problems.push(`request failed: ${label} (${failure})`);
  });

  page.on('response', (response) => {
    if (!isAppUrl(response.url()) || response.status() < 400) return;
    const label = `${response.request().method()} ${response.url()}`;
    if (matches(label, ignoreRequests)) return;
    problems.push(`request failed: ${label} (HTTP ${response.status()})`);
  });

  async function readStrictViolations(): Promise<string[]> {
    if (page.isClosed() || !isAppUrl(page.url())) return [];
    const violations = await page
      .evaluate(() => (window as Window & { __strictViolations?: StrictViolation[] }).__strictViolations ?? undefined)
      .catch(() => undefined);
    if (!violations) {
      return [
        'stricterdom recorder is not installed (window.__strictViolations is missing): ' +
          'is the page served by the vite dev server with src/dev/stricterdomRecorder.ts imported in src/index.tsx?',
      ];
    }
    return violations.map((v) => `stricterdom ${v.kind} violation [${v.phase}]: ${v.message}`);
  }

  return {
    /** Everything recorded so far, including the stricterdom violations read from the page. */
    async problems(): Promise<string[]> {
      return [...problems, ...(await readStrictViolations())];
    },
  };
}
