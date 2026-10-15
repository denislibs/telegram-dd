// Original file (not in telegram-tt). The content of the `media` mock scenario (docs/plans/2026-10-15-media.md §5): which photos and
// videos exist, their declared sizes and what the asset behind each of them is. Shared by generateMediaAssets.ts (the committed
// files in src/lib/gramjs/client/__data__/media) and generateMediaScenario.ts (src/lib/gramjs/client/__mocks__/media.json).

export type PhotoSpec = {
  /** The photo id and the id of its asset in `documents`. */
  id: number;
  /** The declared size of the largest PhotoSize ('x'): what the client lays the box out from. */
  w: number;
  h: number;
  /** The size of the asset when it must differ from the declared one (a hostile declared size). */
  assetW?: number;
  assetH?: number;
  caption?: string;
  out?: boolean;
  spoiler?: boolean;
  /** A message of an album shares a `groupedId`. */
  album?: string;
};

export type VideoSpec = {
  /** The document id of the video; its poster ('m' thumb) is the document `id + THUMB_ID_OFFSET`. */
  id: number;
  w: number;
  h: number;
  duration: number;
  caption?: string;
  round?: boolean;
  gif?: boolean;
  noSound?: boolean;
  spoiler?: boolean;
  /** A noise video of more than two download parts (progressive streaming, chunked `GetFile`). */
  big?: boolean;
  hue: number;
};

export const THUMB_ID_OFFSET = 10_000;
export const VIDEO_MIME = 'video/webm';

// Mia Photos: 24 photos. The history is shown newest at the bottom; the list is in message order (oldest first). The top has
// the 2-album and the clamped sizes (a 20000x10 "photo", a 10:1 and a 1:10 one), the bottom has captions and the 4-album.
export const PHOTOS: PhotoSpec[] = [
  { id: 101, w: 800, h: 600, caption: 'Album of two', album: '9001' },
  { id: 102, w: 600, h: 800, album: '9001' },
  { id: 103, w: 20000, h: 10, assetW: 400, assetH: 1 },
  { id: 104, w: 1600, h: 160 },
  { id: 105, w: 160, h: 1600 },
  { id: 106, w: 800, h: 600, spoiler: true },
  { id: 107, w: 800, h: 600 },
  { id: 108, w: 640, h: 640 },
  { id: 109, w: 600, h: 800, out: true },
  { id: 110, w: 960, h: 540 },
  { id: 111, w: 540, h: 960 },
  { id: 112, w: 720, h: 480 },
  { id: 113, w: 480, h: 720 },
  { id: 114, w: 800, h: 600 },
  { id: 115, w: 640, h: 640 },
  { id: 116, w: 960, h: 540 },
  { id: 117, w: 600, h: 800 },
  { id: 118, w: 800, h: 600, caption: 'Landscape with a caption' },
  { id: 119, w: 600, h: 800, caption: 'Portrait with a caption' },
  { id: 120, w: 640, h: 640, caption: 'Square with a caption', out: true },
  { id: 121, w: 800, h: 600, caption: 'Album of four', album: '9002' },
  { id: 122, w: 600, h: 800, album: '9002' },
  { id: 123, w: 640, h: 640, album: '9002' },
  { id: 124, w: 960, h: 540, album: '9002' },
];

// Vic Videos (two round videos: starting one pauses the other)
export const VIDEOS: VideoSpec[] = [
  { id: 201, w: 640, h: 360, duration: 2, caption: 'A clip', hue: 210 },
  { id: 202, w: 480, h: 270, duration: 2, gif: true, noSound: true, hue: 150 },
  { id: 203, w: 400, h: 400, duration: 2, round: true, hue: 30 },
  { id: 204, w: 640, h: 360, duration: 2, spoiler: true, hue: 330 },
  { id: 205, w: 640, h: 360, duration: 2, noSound: true, caption: 'Without sound', hue: 90 },
  { id: 206, w: 640, h: 360, duration: 3, big: true, caption: 'A big one', hue: 270 },
  { id: 207, w: 400, h: 400, duration: 2, round: true, hue: 60 },
];

/** The path of an asset below `src/lib/gramjs/client/__data__/` (also the `url` of its entry in `documents`). */
export const photoAssetUrl = (id: number) => `media/photo-${id}.jpg`;
export const videoAssetUrl = (id: number) => `media/video-${id}.webm`;
export const posterAssetUrl = (id: number) => `media/poster-${id}.jpg`;
