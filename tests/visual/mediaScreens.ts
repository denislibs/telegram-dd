// Original file (not in telegram-tt). The visual screens of the media slice (5a-1): photos, an album, spoilers and videos in the
// `media` scenario (src/lib/gramjs/client/__mocks__/media.json, served by __invokeMiddlewares__/media.ts to BOTH apps; the tt copy gets
// the scenario, the middleware and the assets through scripts/visual/tt-media-files.mjs). The harness removes `navigator.serviceWorker`
// from both apps (tests/visual/determinism.ts), so every media is a blob from the mock. Kept apart from screens.ts, which the
// unmerged composer branch edits (plan risk R1); compare.spec.ts runs both lists.
import type { Page } from '@playwright/test';

import type { VisualScreen } from './screens';

const TT_MAIN_READY = ['#LeftColumn .chat-list .ListItem', '#LeftColumn .SearchInput .Spinner'];
// tt's search spinner is never pixel-stable; the composer is not ported on this branch (our footer is an inert block of its size)
const MASK = ['#LeftColumn .SearchInput .Spinner', '#MiddleColumn .middle-column-footer'];
// a video frame is not pixel-stable (playback timing): the box is masked, the chrome around it (badges, buttons) is compared
const VIDEO_MASK = [...MASK, '#MiddleColumn .MessageList video'];

async function openChat(page: Page, name: string) {
  await page.locator('#LeftColumn .chat-list .ListItem.Chat').filter({ hasText: name }).click();
  await page.locator('#MiddleColumn .MiddleHeader').getByText(name).waitFor();
  await page.locator('#MiddleColumn .MessageList .message-list-item').first().waitFor();
  await page.waitForTimeout(1500);
}

// every full image of the list is decoded and no spinner is left: the "screen is ready" contract of the media screens
async function waitForMedia(page: Page, withVideos = false) {
  await page.waitForFunction(
    (videos) => {
      const list = document.querySelector('#MiddleColumn .MessageList');
      // (a covered video never starts, so its spinner stays: tt does the same; photos have none once loaded)
      if (!list || (!videos && list.querySelector('.ProgressSpinner, .media-loading'))) return false;
      const images = [...list.querySelectorAll<HTMLImageElement>('img.full-media')];
      const videoEls = videos ? [...list.querySelectorAll<HTMLVideoElement>('video')] : [];
      return (
        images.every((img) => img.complete && img.naturalWidth > 0) && videoEls.every((video) => video.readyState >= 2)
      );
    },
    withVideos,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(800);
}

async function scrollTop(page: Page) {
  await page.evaluate(() => {
    (document.querySelector('#MiddleColumn .MessageList') as HTMLElement).scrollTop = 0;
  });
  await page.waitForTimeout(1500);
}

const mediaScreen = (
  name: string,
  chat: string,
  steps: (page: Page) => Promise<void>,
  mask = MASK,
  withVideos = false,
): VisualScreen => {
  const prepare = async (page: Page) => {
    await openChat(page, chat);
    await steps(page);
    await waitForMedia(page, withVideos);
  };
  return {
    name,
    ported: true,
    scenario: 'media',
    reference: { app: 'tt', path: '/', ready: TT_MAIN_READY, prepare },
    candidate: { app: 'ours', path: '/', ready: TT_MAIN_READY, prepare },
    mask,
    threshold: 0,
  };
};

export const mediaScreens: VisualScreen[] = [
  // the bottom of "Mia Photos": single photos with captions and the album of four
  mediaScreen('media-photos', 'Mia Photos', async () => {}),
  // the top: the album of two and the clamped sizes (a 20000x10 "photo", 10:1 and 1:10)
  mediaScreen('media-photos-top', 'Mia Photos', scrollTop),
  // a spoiler photo (covered) in view
  mediaScreen('media-spoiler', 'Mia Photos', async (page) => {
    await scrollTop(page);
    await page.locator('#MiddleColumn .MessageList .Message[data-message-id="7"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
  }),
  // "Vic Videos" from its first video: the clip, the GIF, a round video, the covered video (the video boxes are masked)
  mediaScreen('media-videos', 'Vic Videos', scrollTop, VIDEO_MASK, true),
];
