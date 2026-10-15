// The streaming path of the media slice: the service worker (src/serviceWorker/service.worker.ts, ported with tt's progressive.ts) answers
// `./progressive/<hash>` Range requests of a `<video>` from `callApi('downloadMedia')`. Every other media spec runs WITHOUT the service worker
// (the gates remove `navigator.serviceWorker`, tests/e2e/fixtures.ts) and loads videos as blobs; this one keeps it and proves
// the behaviour on our build: the worker registers and takes control, the `src` is a progressive URL, a Range request is answered with the
// right slice of the file, and playback starts. A behaviour test, not a comparison with tt.
import type { Page } from '@playwright/test';
import { statSync } from 'node:fs';

import { expect, test } from './fixtures';
import { LIST, MOCK_NOISE, openChat, openScenario, scrollListTo, settle } from './middleHelpers';

test.use({
  serviceWorkers: 'allow',
  keepServiceWorker: true,
  strictOptions: { ignoreConsole: MOCK_NOISE },
});

const asset = (name: string) => statSync(`src/lib/gramjs/client/__data__/media/${name}`).size;
const message = (page: Page, id: number) => page.locator(`${LIST} .Message[data-message-id="${id}"]`);

async function openVicWithWorker(page: Page) {
  await openScenario(page, 'media', 3);
  // the worker registers on `load`, activates and claims the page
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20_000 })
    .toBe(true);
  await openChat(page, 'Vic Videos');
  await scrollListTo(page, 'top');
  await settle(page);
}

async function range(page: Page, src: string, header: string) {
  return page.evaluate(
    async ([url, bytes]) => {
      const response = await fetch(url, { headers: { Range: bytes } });
      const body = await response.arrayBuffer();
      return {
        status: response.status,
        contentRange: response.headers.get('Content-Range'),
        contentType: response.headers.get('Content-Type'),
        length: body.byteLength,
      };
    },
    [src, header] as const,
  );
}

test('a video streams through the service worker: progressive src, Range answered from the API, playback starts', async ({
  page,
}) => {
  await openVicWithWorker(page);

  const video = message(page, 1).locator('video');
  await expect(video).toBeVisible();
  const src = await video.evaluate((el: HTMLVideoElement) => el.currentSrc);
  expect(new URL(src).pathname).toContain('/progressive/document201');

  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused && el.currentTime > 0), { timeout: 15_000 })
    .toBe(true);
  expect(await video.evaluate((el: HTMLVideoElement) => el.videoWidth)).toBe(640);

  const first = await range(page, src, 'bytes=0-1023');
  expect(first.status).toBe(206);
  expect(first.length).toBe(1024);
  expect(first.contentRange).toBe(`bytes 0-1023/${asset('video-201.webm')}`);
  expect(first.contentType).toBe('video/webm');
});

test('a Range request on a big video is answered in parts of at most 512 KB, at the right offset', async ({ page }) => {
  await openVicWithWorker(page);
  await message(page, 6).scrollIntoViewIfNeeded();
  const video = message(page, 6).locator('video');
  await expect(video).toBeVisible();
  const src = await video.evaluate((el: HTMLVideoElement) => el.currentSrc);
  expect(new URL(src).pathname).toContain('/progressive/document206');
  const total = asset('video-206.webm');

  const middle = await range(page, src, 'bytes=700000-1400000');
  expect(middle.status).toBe(206);
  // the worker never answers more than one download part at a time
  expect(middle.length).toBe(512 * 1024);
  expect(middle.contentRange).toBe(`bytes 700000-${700000 + 512 * 1024 - 1}/${total}`);

  const tail = await range(page, src, `bytes=${total - 1000}-`);
  expect(tail.status).toBe(206);
  expect(tail.length).toBe(1000);
  expect(tail.contentRange).toBe(`bytes ${total - 1000}-${total - 1}/${total}`);
});
