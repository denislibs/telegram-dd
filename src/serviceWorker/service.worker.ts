import { DEBUG } from '../config';
import { pause } from '../util/schedulers';
import { respondForDownload } from './download';
import { respondForProgressive } from './progressive';

// Deviation: the push notification, share target and asset cache handlers (`pushNotification.ts`, `share.ts`,
// `assetCache.ts`) belong to the PWA milestone and are not ported yet, so this worker only streams media
// (`./progressive/<hash>`) and big downloads (`./download/<hash>`). TODO(port): restore them with the PWA milestone.

declare const self: ServiceWorkerGlobalScope;

const ACTIVATE_TIMEOUT = 3000;

self.addEventListener('install', (e) => {
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log('ServiceWorker installed');
  }

  // Activate worker immediately
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log('ServiceWorker activated');
  }

  e.waitUntil(
    Promise.race([
      // An attempt to fix freezing UI on iOS
      pause(ACTIVATE_TIMEOUT),
      // Become available to all pages
      self.clients.claim(),
    ]),
  );
});

self.addEventListener('fetch', (e: FetchEvent) => {
  const { url } = e.request;
  const { scope } = self.registration;
  if (!url.startsWith(scope)) {
    return false;
  }

  const { pathname } = new URL(url);

  if (pathname.includes('/progressive/')) {
    e.respondWith(respondForProgressive(e));
    return true;
  }

  if (pathname.includes('/download/')) {
    e.respondWith(respondForDownload(e));
    return true;
  }

  return false;
});
