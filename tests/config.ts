// Ports and URLs shared by the Playwright configs and the visual harness.
export const DEV_PORT = Number(process.env.E2E_DEV_PORT || 1240); // our app: vite dev server (stricterdom on)
export const PREVIEW_PORT = Number(process.env.E2E_PREVIEW_PORT || 1241); // our app: production build (perf gates)
export const TT_PORT = Number(process.env.TT_PORT || 1235); // telegram-tt reference copy (scripts/visual/tt-run.mjs)

export const DEV_URL = `http://127.0.0.1:${DEV_PORT}`;
export const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}`;
export const TT_URL = `http://127.0.0.1:${TT_PORT}`;

// Environment of every browser-gate build of our app. APP_ENV=test + APP_MOCKED_CLIENT=1 swap the GramJS client for
// the in-repo MockClient (same scenarios as telegram-tt: src/lib/gramjs/client/__mocks__/*.json), so no Telegram
// backend is needed. The api id / hash are dummies: nothing is sent to Telegram.
export const E2E_ENV = {
  APP_ENV: 'test',
  APP_MOCKED_CLIENT: '1',
  TG_TELEGRAM_API_ID: '1',
  TG_TELEGRAM_API_HASH: 'e2e-dummy-hash',
};
