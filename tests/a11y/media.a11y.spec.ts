import { test } from '../e2e/fixtures';
import { MOCK_NOISE, openChat, openScenario, scrollListTo, settle } from '../e2e/middleHelpers';
import { expectAccessible } from './axe';

// Photos, albums, videos and round videos in the message list (media slice 5a-1), `media` scenario of the mocked client.
test.use({ strictOptions: { ignoreConsole: MOCK_NOISE } });

test('media: a chat of photos and albums', async ({ page }) => {
  await openScenario(page, 'media', 3);
  await openChat(page, 'Mia Photos');
  await page.locator('#MiddleColumn img.full-media').first().waitFor();
  await page.waitForTimeout(1500); // the thumbnails fade out, the images fade in
  await expectAccessible(page, '#MiddleColumn');
});

test('media: a chat of videos, a GIF and round videos', async ({ page }) => {
  await openScenario(page, 'media', 3);
  await openChat(page, 'Vic Videos');
  await scrollListTo(page, 'top');
  await settle(page);
  await page.locator('#MiddleColumn video').first().waitFor();
  await page.waitForTimeout(1500);
  await expectAccessible(page, '#MiddleColumn');
});

test('media: a video with autoplay off (the play button)', async ({ page }) => {
  await openScenario(page, 'media', 3);
  await page.evaluate(() => {
    (window as unknown as { getActions: () => { updatePerformanceSettings: (o: object) => void } })
      .getActions()
      .updatePerformanceSettings({ autoplayVideos: false });
  });
  await openChat(page, 'Vic Videos');
  await scrollListTo(page, 'top');
  await settle(page);
  await page.locator('#MiddleColumn .icon-play').first().waitFor();
  await expectAccessible(page, '#MiddleColumn');
});
