// Dev-only smoke test of the ported API layer: starts tt's GramJS API worker exactly as telegram-tt's
// `initApi` action does (global/actions/api/initial.ts), logging every update. Enabled by `?api` in the URL on the
// dev server (see src/index.tsx). Needs TG_TELEGRAM_API_ID / TG_TELEGRAM_API_HASH in .env.local.
import type { ApiUpdate } from '../api/types';

import { TELEGRAM_API_HASH, TELEGRAM_API_ID } from '../config';
import { IS_WEBM_SUPPORTED, MAX_BUFFER_SIZE, PLATFORM_ENV } from '../util/browser/windowEnvironment';
import { initApi } from '../api/gramjs';

export function startApiSmoke() {
  if (!TELEGRAM_API_ID || !TELEGRAM_API_HASH) {
    // eslint-disable-next-line no-console
    console.warn('[api] TG_TELEGRAM_API_ID / TG_TELEGRAM_API_HASH are not set: copy .env.example to .env.local.');
    return Promise.resolve();
  }

  // eslint-disable-next-line no-console
  console.log('[api] starting the GramJS worker…');

  return initApi(onUpdate, {
    userAgent: navigator.userAgent,
    platform: PLATFORM_ENV,
    isWebmSupported: IS_WEBM_SUPPORTED,
    maxBufferSize: MAX_BUFFER_SIZE,
    langCode: 'en',
    accountIds: [],
  }).then(
    // eslint-disable-next-line no-console
    () => console.log('[api] worker initialized'),
    // eslint-disable-next-line no-console
    (error) => console.error('[api] init failed', error),
  );
}

function onUpdate(update: ApiUpdate) {
  // eslint-disable-next-line no-console
  console.log('[api] update', update['@type'], update);
}
