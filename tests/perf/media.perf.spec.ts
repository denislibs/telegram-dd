import { expect, type Page, test } from '@playwright/test';

import { openApp } from '../e2e/authHelpers';
import { expectNoLeak } from './leaks';
import { expectNoLongTasks } from './longTasks';

// Photos, albums and videos in the message list (media slice 5a-1), on the production build (playwright.perf.config.ts). The
// production build of the mocked client bundles the `media` scenario and its request middleware (plugins/mockClientAssets.ts), so the
// chats here have real photos and videos, served part by part like the server does. `navigator.serviceWorker` is removed (decision D1
// of docs/plans/2026-10-15-media.md): every media is a blob URL from the mock, as in `pnpm perf:compare`.

const ROW = '#LeftColumn .chat-list .ListItem.Chat';
const LIST = '#MiddleColumn .MessageList';

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    delete (Navigator.prototype as { serviceWorker?: unknown }).serviceWorker;
    // main-thread blob URLs: the loader keeps one per media for the session (a cache, never revoked: tt parity), so a media that
    // was loaded once must not create another one
    const counters = { created: 0, revoked: 0 };
    (window as unknown as { __blobs: typeof counters }).__blobs = counters;
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (object) => {
      counters.created++;
      return create(object);
    };
    URL.revokeObjectURL = (url) => {
      counters.revoked++;
      revoke(url);
    };
  });
});

async function openMedia(page: Page) {
  await openApp(page, '/#?mockScenario=media');
  await expect(page.locator(ROW)).toHaveCount(3);
  await page.waitForTimeout(1000);
}

async function openChat(page: Page, name: string) {
  await page.locator(ROW).filter({ hasText: name }).click();
  await page.locator(`${LIST} .message-list-item`).first().waitFor();
}

const blobs = (page: Page) =>
  page.evaluate(() => (window as unknown as { __blobs: { created: number; revoked: number } }).__blobs);

// The documented thresholds of the message list gates (tests/perf/messages.perf.spec.ts, docs/quality-gates.md).
const LEAK = {
  runs: 50,
  maxGrowthKb: 512,
  warmupRuns: 70,
  settleMs: 1500,
  maxNodeGrowth: 400,
  maxListenerGrowth: 60,
} as const;

test.describe('media chats: leaks', () => {
  test.describe.configure({ timeout: 600_000 });

  test('opening and closing a chat of photos (thumbnails, images, albums, workers) does not leak', async ({ page }) => {
    await openMedia(page);

    const cycle = async () => {
      await openChat(page, 'Mia Photos');
      await page.locator(`${LIST} img.full-media`).first().waitFor();
      await page.waitForTimeout(250);
      await page.mouse.move(800, 400);
      await page.mouse.wheel(0, -900);
      await page.waitForTimeout(150);
      await page.keyboard.press('Escape');
      await page.locator(LIST).waitFor({ state: 'detached' });
      await page.waitForTimeout(250);
    };

    const result = await expectNoLeak(page, cycle, LEAK);
    test.info().annotations.push({
      type: 'heap',
      description: `${result.growthKb.toFixed(0)} KB, ${result.nodeGrowth} nodes, ${result.listenerGrowth} listeners over ${LEAK.runs} open/close cycles`,
    });
  });

  test('opening and closing a chat of videos leaves no video element and no new blob', async ({ page }) => {
    await openMedia(page);

    const cycle = async () => {
      await openChat(page, 'Vic Videos');
      // the videos are the oldest messages: wheel up until the history has paged them in (a scrollTop set before the observers
      // are ready would not trigger the page-in and the cycle would wait for ever)
      await page.mouse.move(800, 400);
      await expect
        .poll(
          async () => {
            await page.mouse.wheel(0, -1500);
            return page.locator(`${LIST} video`).count();
          },
          { timeout: 20_000, intervals: [150] },
        )
        .toBeGreaterThan(0);
      await page.waitForTimeout(250);
      await page.keyboard.press('Escape');
      await page.locator(LIST).waitFor({ state: 'detached', timeout: 20_000 });
      // the <video> elements are released with the list (the cleanup of the player empties `src`), none is retained
      await expect.poll(() => page.locator('video').count()).toBe(0);
      await page.waitForTimeout(150);
    };

    // The heap of a chat of videos grows 390-400 KB over 50 cycles (3 runs on an idle machine; second half 204-217 KB, 0 nodes, 0 listeners:
    // nothing is retained, the heap size is the media pipeline and V8 code) and was 645 KB once while another job loaded the machine:
    // the limit is 2x the clean growth, the node and listener counters keep the retention check strict.
    const result = await expectNoLeak(page, cycle, { ...LEAK, maxGrowthKb: 800 });
    test.info().annotations.push({
      type: 'heap',
      description: `${result.growthKb.toFixed(0)} KB, ${result.nodeGrowth} nodes, ${result.listenerGrowth} listeners over ${LEAK.runs} open/close cycles of Vic Videos`,
    });
  });

  test('a media that is already loaded creates no new blob URL when its chat is opened again', async ({ page }) => {
    await openMedia(page);

    const cycle = async () => {
      for (const name of ['Mia Photos', 'Vic Videos']) {
        await openChat(page, name);
        await page.mouse.move(800, 400);
        for (let i = 0; i < 6; i++) {
          await page.mouse.wheel(0, -1500);
          await page.waitForTimeout(100);
        }
        await page.waitForTimeout(600);
        await page.keyboard.press('Escape');
        await page.locator(LIST).waitFor({ state: 'detached', timeout: 20_000 });
      }
    };

    // the first cycles load whatever the viewport reaches; once every media of the scenario has been loaded by a cycle, the cache serves it
    for (let i = 0; i < 6; i++) await cycle();
    const before = await blobs(page);
    for (let i = 0; i < 10; i++) await cycle();
    const after = await blobs(page);

    expect(after.created - before.created, 'blob URLs created by 10 more cycles').toBe(0);
    expect(after.revoked - before.revoked, 'blob URLs revoked by 10 more cycles').toBe(0);
  });
});

test.describe('media chats: long tasks under calibrated CPU throttling', () => {
  // The caps are telegram-tt's own worst task on the same run (`pnpm perf:compare --scenario open-media-chat`) plus 3%, see
  // docs/reports/slice-media-5a1.md. MEDIA_OPEN_CAP_MS is that number: tt's worst task 225 ms (113-225 over 9 runs) plus 3%, 232 ms.
  const MEDIA_OPEN_CAP_MS = Number(process.env.MEDIA_OPEN_CAP_MS || 232);

  test("opening a chat of photos and scrolling its history stays under telegram-tt's worst task", async ({ page }) => {
    await openMedia(page);
    // the first open of any chat compiles the column's code (cold JIT): another chat is opened first
    await openChat(page, 'Vic Videos');
    await page.waitForTimeout(800);

    await expectNoLongTasks(
      page,
      async () => {
        await openChat(page, 'Mia Photos');
        await page.waitForTimeout(800);
        await page.mouse.move(800, 400);
        for (let i = 0; i < 40; i++) {
          await page.mouse.wheel(0, -400);
          await page.waitForTimeout(80);
        }
        await page.waitForTimeout(500);
      },
      { maxMs: MEDIA_OPEN_CAP_MS },
    );
  });

  test('autoplay videos scrolling in and out of view do not block the main thread', async ({ page }) => {
    await openMedia(page);
    await openChat(page, 'Mia Photos');
    await page.waitForTimeout(800);

    await expectNoLongTasks(
      page,
      async () => {
        await openChat(page, 'Vic Videos');
        await page.waitForTimeout(800);
        await page.mouse.move(800, 400);
        for (let round = 0; round < 3; round++) {
          for (let i = 0; i < 25; i++) {
            await page.mouse.wheel(0, -400);
            await page.waitForTimeout(60);
          }
          for (let i = 0; i < 25; i++) {
            await page.mouse.wheel(0, 400);
            await page.waitForTimeout(60);
          }
        }
        await page.waitForTimeout(400);
      },
      { maxMs: MEDIA_OPEN_CAP_MS },
    );
  });
});
