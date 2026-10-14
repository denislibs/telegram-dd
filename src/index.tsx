// Evaluated before enableStrict(), as in telegram-tt: this module probes emoji support by briefly appending an element
// to <body> at load time, which stricterdom would flag as a mutation outside an effect.
import './util/browser/windowEnvironment';

import { render } from 'frameact/dom';
import { enableStrict } from 'frameact/stricterdom';

import App from './components/App';

if (import.meta.env.DEV) enableStrict();

render(() => <App />, document.getElementById('root')!);

// Dev-only smoke test of the ported API layer: open the dev server with `?api`.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('api')) {
  void import('./dev/apiSmoke').then(({ startApiSmoke }) => startApiSmoke());
}
