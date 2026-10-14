// Not in telegram-tt: the start must survive a corrupted cache (appsec review, findings 2 and 6). tt's `loadCache` is
// guarded in cache.ts (`// Deviation: hardening`); this covers what only shows when the loaded cache is written into the
// store: a cycle or an absurd depth that the mirror walk refuses (`setGlobal` is atomic, so the global stays as it was).
// The cache is only a head start (the server replaces it), so it is dropped and the start repeats without it.
import { handleError } from '../util/handleError';
import { initGlobal } from '../util/init';
import { dropCorruptedCache } from './cache';

export async function initGlobalOrDropCache() {
  try {
    await initGlobal();
  } catch (error) {
    handleError(error as Error);
    await dropCorruptedCache();
    await initGlobal();
  }
}
