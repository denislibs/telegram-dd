// Dev-only: records every stricterdom violation on `window.__strictViolations`, next to the usual console.error.
// The strict e2e fixture (tests/e2e/fixtures.ts) reads that list after every test and fails on a non-empty one:
// a mutation violation is reported at a phase boundary where a throw would only be caught and logged, so the
// handler is the one reliable channel (see the stricterdom section of src/vendor/frameact/README.md).
import { setHandler } from 'frameact/stricterdom';

export interface RecordedStrictViolation {
  kind: 'measure' | 'mutation';
  detail: string;
  phase: string;
  path: string | null;
  message: string;
}

declare global {
  interface Window {
    __strictViolations?: RecordedStrictViolation[];
  }
}

export function installStrictViolationRecorder() {
  const violations: RecordedStrictViolation[] = [];
  window.__strictViolations = violations;

  setHandler((error) => {
    violations.push({
      kind: error.kind,
      detail: error.detail,
      phase: error.phase,
      path: error.path,
      message: error.message,
    });
    // Keep the dev-console behaviour of the default handler.
    // eslint-disable-next-line no-console
    console.error(error);
  });
}
