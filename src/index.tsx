// Evaluated before enableStrict(), as in telegram-tt: this module probes emoji support by briefly appending an element
// to <body> at load time, which stricterdom would flag as a mutation outside an effect.
import './util/browser/windowEnvironment';

import { render } from 'frameact/dom';
import { enableStrict } from 'frameact/stricterdom';

import { installStrictViolationRecorder } from './dev/stricterdomRecorder';

import App from './components/App';

if (import.meta.env.DEV) {
  enableStrict();
  // Violations are also collected on `window.__strictViolations` for the e2e gate (tests/e2e/fixtures.ts).
  installStrictViolationRecorder();
}

render(() => <App />, document.getElementById('root')!);

// Dev-only smoke test of the ported API layer: open the dev server with `?api`.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('api')) {
  void import('./dev/apiSmoke').then(({ startApiSmoke }) => startApiSmoke());
}
