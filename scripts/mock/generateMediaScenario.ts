// Original file (not in telegram-tt). Generates src/lib/gramjs/client/__mocks__/media.json: the `media` mock scenario of the media
// slices (docs/plans/2026-10-15-media.md §5). `pnpm exec tsx scripts/mock/generateMediaScenario.ts` (after generateMediaAssets.ts:
// it reads the manifest of the assets).
//
//   user 21 "Mia Photos": 24 photos, oldest first: a 2-album, a 20000x10 "photo", a 10:1 and a 1:10 one (the aspect-ratio clamps),
//                         a spoiler photo, singles of several ratios, three with a caption, two outgoing, and a 4-album at the bottom
//   user 22 "Vic Videos": a clip, a GIF, a round video, a spoiler video, a video without sound and a 1.6 MB one (more than three
//                         512 KB download parts), then a tail of 40 text messages so that the videos can be scrolled off screen
//
// A mock message is built from JSON, which cannot hold the Api classes: a message carries a plain `mediaSpec` and
// `__invokeMiddlewares__/media.ts` builds the real photo (PhotoSizes at the declared size, a stripped thumbnail), the video
// document (DocumentAttributeVideo / Animated, thumbs) and answers `upload.GetFile` with the right slice of the asset.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Manifest } from './generateMediaAssets.ts';

import {
  photoAssetUrl,
  PHOTOS,
  posterAssetUrl,
  THUMB_ID_OFFSET,
  VIDEO_MIME,
  videoAssetUrl,
  VIDEOS,
} from './mediaSpec.ts';

const BASE_DATE = 1_700_000_000; // 2023-11-14T22:13:20Z
const ROOT = resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(
  readFileSync(resolve(ROOT, 'src/lib/gramjs/client/__data__/media/manifest.json'), 'utf8'),
) as Manifest;

const MIA = '21';
const VIC = '22';

const mia: unknown[] = [{ id: 1, date: BASE_DATE, message: 'Photos from the trip', out: false, entities: [] }];
PHOTOS.forEach((photo, index) => {
  mia.push({
    id: 2 + index,
    date: BASE_DATE + 60 * (index + 1),
    message: photo.caption ?? '',
    out: Boolean(photo.out),
    entities: [],
    ...(photo.album ? { groupedId: photo.album } : undefined),
    mediaSpec: {
      kind: 'photo',
      id: photo.id,
      w: photo.w,
      h: photo.h,
      spoiler: photo.spoiler,
      stripped: manifest.photos[photo.id].stripped,
    },
  });
});

const vic: unknown[] = [];
VIDEOS.forEach((video, index) => {
  vic.push({
    id: 1 + index,
    date: BASE_DATE + 60 * (index + 1),
    message: video.caption ?? '',
    out: false,
    entities: [],
    mediaSpec: {
      kind: 'video',
      id: video.id,
      w: video.w,
      h: video.h,
      duration: video.duration,
      round: video.round,
      gif: video.gif,
      noSound: video.noSound,
      spoiler: video.spoiler,
      posterW: 320,
      posterH: Math.round((320 * video.h) / video.w),
      stripped: manifest.videos[video.id].stripped,
    },
  });
});
for (let i = 1; i <= 40; i++) {
  vic.push({
    id: 100 + i,
    date: BASE_DATE + 3600 + 60 * i,
    message: `Vic message ${i}`,
    out: i % 5 === 0,
    entities: [],
  });
}

const documents = [
  ...PHOTOS.map((photo) => ({ id: photo.id, url: photoAssetUrl(photo.id), mimeType: 'image/jpeg' })),
  ...VIDEOS.flatMap((video) => [
    { id: video.id, url: videoAssetUrl(video.id), mimeType: VIDEO_MIME },
    { id: video.id + THUMB_ID_OFFSET, url: posterAssetUrl(video.id), mimeType: 'image/jpeg' },
  ]),
];

const lastId = (list: unknown[]) => (list[list.length - 1] as { id: number }).id;

const json = {
  users: [
    { id: '1', self: true, firstName: 'Me', lastName: 'Myself' },
    { id: MIA, firstName: 'Mia', lastName: 'Photos' },
    { id: VIC, firstName: 'Vic', lastName: 'Videos' },
  ],
  chats: [],
  channels: [],
  dialogs: {
    active: [
      { id: VIC, topMessage: lastId(vic), readInboxMaxId: lastId(vic), unreadCount: 0 },
      { id: MIA, topMessage: lastId(mia), readInboxMaxId: lastId(mia), unreadCount: 0 },
    ],
    archived: [],
  },
  messages: { [MIA]: mia, [VIC]: vic },
  availableReactions: [],
  documents,
  dialogFilters: [],
  topPeers: [],
};

writeFileSync(resolve(ROOT, 'src/lib/gramjs/client/__mocks__/media.json'), `${JSON.stringify(json, undefined, 2)}\n`);
