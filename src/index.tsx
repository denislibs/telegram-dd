/* eslint-disable simple-import-sort/imports -- Sanitize and claim URL login before other startup modules */
import { getPendingWebLogin } from './util/routing';
import { webLoginHandoffPromise } from './util/webLoginHandoff';
import { handleError } from './util/handleError';
// Evaluated before enableStrict(), as in telegram-tt: this module probes emoji support by briefly appending an element
// to <body> at load time, which stricterdom would flag as a mutation outside an effect.
import './util/browser/windowEnvironment';
import './global/init';

import { requestMutation } from 'frameact';
import { render } from 'frameact/dom';
import { enableStrict } from 'frameact/stricterdom';
import { getActions, getGlobal } from './global';

import { DEBUG } from './config';
import { installStrictViolationRecorder } from './dev/stricterdomRecorder';
import { initGlobalOrDropCache } from './global/safeInit';
import { installControlledInputListeners } from './lib/kit/controlledInputs';
import { selectSharedSettings } from './global/selectors/sharedState';
import { requestGlobal, subscribeToMultitabBroadcastChannel } from './util/browser/multitab';
import { establishMultitabRole, subscribeToMasterChange } from './util/establishMultitabRole';
import { initLocalization } from './util/localization';
import { Bundles, loadBundle } from './util/moduleLoader';
import { MULTITAB_STORAGE_KEY } from './util/multiaccount';
import { getDek, getDekGeneration } from './util/passcode';
import { subscribeToPasscodeChannel } from './util/passcode/channel';
import { initPasscodeNavigation } from './util/passcode/navigation';
import { onBeforeUnload } from './util/schedulers';

import App from './components/App';

import './assets/fonts/roboto.css';
import './styles/index.scss';

if (import.meta.env.DEV) {
  enableStrict();
  // Violations are also collected on `window.__strictViolations` for the e2e gate (tests/e2e/fixtures.ts).
  installStrictViolationRecorder();
}

const initializationPromise = init();

async function init() {
  await webLoginHandoffPromise;
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log('>>> INIT');
  }

  if (!(window as any).isCompatTestPassed) return;

  // TODO(port): checkAndAssignPermanentWebVersion(), listenOtherClients() (PWA milestone)

  subscribeToMultitabBroadcastChannel();
  subscribeToPasscodeChannel(loadPasscodeActions);
  initPasscodeNavigation(getDek, getDekGeneration);
  await requestGlobal(APP_VERSION);
  localStorage.setItem(MULTITAB_STORAGE_KEY, '1');
  onBeforeUnload(() => {
    const global = getGlobal();
    if (Object.keys(global.byTabId).length === 1) {
      localStorage.removeItem(MULTITAB_STORAGE_KEY);
    }
  });

  await initGlobalOrDropCache();
  getActions().init();

  // TODO(port): initAutolock() (passcode milestone)

  getActions().updateShouldEnableDebugLog();
  getActions().updateShouldDebugExportedSenders();

  const global = getGlobal();

  void initLocalization(selectSharedSettings(global).language, true);

  subscribeToMasterChange((isMasterTab) => {
    getActions().switchMultitabRole({ isMasterTab }, { forceSyncOnIOs: true });
  });
  const shouldReestablishMasterToSelf =
    Boolean(getPendingWebLogin()) || getGlobal().auth.state !== 'authorizationStateReady';
  establishMultitabRole(shouldReestablishMasterToSelf);

  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log('>>> START INITIAL RENDER');
  }

  requestMutation(() => {
    // TODO(port): updateWebmanifest(), betterView()
    installControlledInputListeners();
    render(() => <App />, document.getElementById('root')!);
  });

  // telegram-tt loads the rest of the actions with the Main bundle (components/main/Main.tsx imports actions/all), after
  // the first render and without anything waiting for it. Same here: no `await` (the role and the first render do not
  // depend on it, and a chunk that fails to load must not blank the screen). Their store callbacks read the tab state,
  // which `init` has created above. TODO(port): move to Main when it is ported.
  void import('./global/actions/all').catch(handleError);

  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log('>>> FINISH INITIAL RENDER');
  }
}

async function loadPasscodeActions() {
  await Promise.all([loadBundle(Bundles.Main), initializationPromise]);
  return getActions();
}

onBeforeUnload(() => {
  const actions = getActions();
  actions.leaveGroupCall?.({ isPageUnload: true });
  actions.hangUp?.({ isPageUnload: true });
});

// Dev-only smoke test of the ported API layer: open the dev server with `?api`.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('api')) {
  void import('./dev/apiSmoke').then(({ startApiSmoke }) => startApiSmoke());
}
