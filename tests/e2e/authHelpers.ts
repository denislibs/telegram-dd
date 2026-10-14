import { expect, type Page } from '@playwright/test';

// Helpers for specs that play the server side of the login against the mocked client (see auth.spec.ts).
export type AuthState =
  | 'authorizationStateWaitPhoneNumber'
  | 'authorizationStateWaitCode'
  | 'authorizationStateWaitPassword'
  | 'authorizationStateWaitRegistration'
  | 'authorizationStateWaitQrCode'
  | 'authorizationStateReady';

export type TestWindow = {
  getActions: () => { apiUpdate: (update: Record<string, unknown>) => void };
  getGlobal: () => { auth: Record<string, unknown> };
};

type ServerWindow = TestWindow & {
  __server?: { state: string; fields: Record<string, unknown> };
  __serverTimer?: number;
};

// The server keeps answering with its current state: a late whole-global write of the mocked sync (see waitForQuietSync)
// that sets the state back is answered again, as the real API worker would. Only the state is replayed.
export async function serverSays(page: Page, authorizationState: AuthState, extra: Record<string, unknown> = {}) {
  await page.evaluate(
    ({ state, fields }) => {
      const w = window as unknown as ServerWindow;
      const send = () => {
        const server = w.__server!;
        w.getActions().apiUpdate({
          '@type': 'updateAuthorizationState',
          authorizationState: server.state,
          ...server.fields,
        });
      };
      w.__server = { state, fields };
      send();
      w.__serverTimer ??= window.setInterval(() => {
        if (w.getGlobal().auth.state !== w.__server!.state) send();
      }, 100);
    },
    { state: authorizationState, fields: extra },
  );
}

export async function readAuth(page: Page) {
  return page.evaluate(() => {
    const { auth } = (window as unknown as TestWindow).getGlobal();
    return { state: auth.state, isLoading: auth.isLoading, errorKey: auth.errorKey };
  });
}

// The mocked API worker answers `authorizationStateReady` and `updateApiReady` shortly after it started, and the app
// then runs its sync (DEBUG logs `>>> START SYNC`, a few times). The sync handlers write whole-global snapshots taken
// before their awaits, which would silently undo an auth step the test played in the middle of them. So the test waits
// until the sync has been quiet for a moment before it starts playing the server.
function waitForQuietSync(page: Page, quietMs = 1000, giveUpMs = 4000) {
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A build without DEBUG logs (the production build of the perf gates) never prints it: wait a fixed time instead.
    const giveUp = setTimeout(resolve, giveUpMs);
    page.on('console', (message) => {
      if (!message.text().includes('>>> START SYNC')) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        clearTimeout(giveUp);
        resolve();
      }, quietMs);
    });
  });
}

export async function openApp(page: Page, path = '/') {
  const quiet = waitForQuietSync(page);
  await page.goto(path);
  await expect(page.locator('#Main')).toBeVisible();
  await quiet;
}
