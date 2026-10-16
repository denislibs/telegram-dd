// Original file (not in telegram-tt). Generates the binary assets of the `media` mock scenario into
// src/lib/gramjs/client/__data__/media/ (committed; run it again only when scripts/mock/mediaSpec.ts changes):
//
//   pnpm exec tsx scripts/mock/generateMediaAssets.ts      # needs `ffmpeg` with libvpx-vp9 and libopus on the PATH
//
//   photo-<id>.jpg   a gradient with a hue per id and `index` white marks (the id label of the plan), at the declared size
//   poster-<id>.jpg  the 320 px wide 'm' thumbnail of a video
//   video-<id>.webm  2-3 s of solid colour, VP9 (+ Opus unless the video has no sound). Playwright's Chromium has no H.264 /
//                    AAC, so the test videos are WebM (decision D2); the big one is noise (more than two 512 KB download parts)
//   manifest.json    byte sizes and the stripped thumbnails (base64) that the scenario generator embeds
//
// The stripped thumbnails are what Telegram sends as `PhotoStrippedSize`: the scan data of a baseline 4:2:0 JPEG of at most 40 px
// with the standard Huffman tables (src/lib/gramjs/Utils.ts `strippedPhotoToJpg` puts the fixed header and footer back). The
// encoder here uses ffmpeg's own quantisation tables, so the brightness differs from what the header's tables would give; the
// image is still a valid JPEG, which is all the gates need (both apps decode the same bytes). Every stripped thumbnail is decoded
// again by ffmpeg after the header is put back, so a malformed one fails the script.
//
// ImageMagick is not needed: the images come from ffmpeg's `geq` / `drawbox` filters (the build of ffmpeg has no `drawtext`).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { photoAssetUrl, PHOTOS, posterAssetUrl, videoAssetUrl, VIDEOS } from './mediaSpec.ts';

// The fixed JPEG header of `strippedPhotoToJpg` (src/lib/gramjs/Utils.ts) is read from its source: importing the module would pull
// the whole GramJS type graph into the script project's typecheck.
const JPEG_HEADER = Buffer.from(
  /JPEG_HEADER = bufferFromHex\('([0-9a-f]+)'\)/.exec(
    readFileSync(resolve(import.meta.dirname, '../../src/lib/gramjs/Utils.ts'), 'utf8'),
  )![1],
  'hex',
);

/** What the client does with a stripped thumbnail (`strippedPhotoToJpg`): the fixed header, the scan data, the footer. */
function strippedPhotoToJpg(stripped: Buffer) {
  const header = Buffer.from(JPEG_HEADER);
  header[164] = stripped[1];
  header[166] = stripped[2];
  return Buffer.concat([header, stripped.subarray(3), Buffer.from([0xff, 0xd9])]);
}

const OUT = resolve(import.meta.dirname, '../../src/lib/gramjs/client/__data__');

export type StrippedThumb = { base64: string; w: number; h: number };
export type Manifest = {
  photos: Record<number, { bytes: number; stripped: StrippedThumb }>;
  videos: Record<number, { bytes: number; posterBytes: number; stripped: StrippedThumb }>;
};

function ffmpeg(...args: string[]) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-threads', '1', ...args], { stdio: 'inherit' });
}

/** A gradient with a hue per `seed` and `marks` white squares, as one JPEG of the given size. */
function gradientJpeg(file: string, w: number, h: number, seed: number, marks: number, quality = 8) {
  const hue = (seed * 0.7).toFixed(3);
  const geq = `geq=lum='60+110*(0.5*X/W+0.5*Y/H)':cb='128+90*cos(${hue})':cr='128+90*sin(${hue})'`;
  const boxes =
    w >= 200 && h >= 100
      ? Array.from({ length: Math.min(marks, 24) }, (_, i) => `drawbox=x=${8 + 18 * i}:y=8:w=12:h=12:c=white:t=fill`)
      : [];
  ffmpeg(
    '-f',
    'lavfi',
    '-i',
    `color=c=black:s=${w}x${h}:r=1:d=1`,
    '-vf',
    [geq, ...boxes, 'format=yuvj420p'].join(','),
    '-frames:v',
    '1',
    '-c:v',
    'mjpeg',
    '-q:v',
    String(quality),
    '-huffman',
    'default',
    file,
  );
}

/** The scan data of a baseline JPEG: what follows the SOS header, without the EOI. */
function scanData(jpeg: Buffer) {
  let i = 2;
  while (i + 4 <= jpeg.length) {
    if (jpeg[i] !== 0xff) throw new Error('not a JPEG marker');
    const marker = jpeg[i + 1];
    const length = jpeg.readUInt16BE(i + 2);
    if (marker === 0xda) return jpeg.subarray(i + 2 + length, jpeg.length - 2);
    i += 2 + length;
  }
  throw new Error('no SOS marker');
}

/** Telegram's stripped thumbnail of an image, and a check that the client side (header + scan + footer) decodes. */
function strippedThumb(source: string, tmp: string, w: number, h: number): StrippedThumb {
  const scale = 40 / Math.max(w, h);
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const thumbFile = `${tmp}/thumb.jpg`;
  ffmpeg(
    '-i',
    source,
    '-vf',
    `scale=${tw}:${th}:flags=bicubic,format=yuvj420p`,
    '-frames:v',
    '1',
    '-c:v',
    'mjpeg',
    '-q:v',
    '10',
    '-huffman',
    'default',
    thumbFile,
  );
  const stripped = Buffer.concat([Buffer.from([1, th, tw]), scanData(readFileSync(thumbFile))]);

  // What the client does with it (the fixed header and footer are put back).
  const checkFile = `${tmp}/check.jpg`;
  writeFileSync(checkFile, strippedPhotoToJpg(stripped));
  ffmpeg('-i', checkFile, '-f', 'null', '-');

  return { base64: stripped.toString('base64'), w: tw, h: th };
}

function encodeVideo(file: string, spec: (typeof VIDEOS)[number]) {
  const { w, h, duration, hue, noSound, big, gif } = spec;
  const source = big
    ? ['-f', 'lavfi', '-i', `nullsrc=s=${w}x${h}:r=25:d=${duration},geq=lum='random(1)*255':cb=128:cr=128`]
    : ['-f', 'lavfi', '-i', `color=c=0x${hslToHex(hue)}:s=${w}x${h}:r=15:d=${duration}`];
  const audio =
    noSound || gif
      ? []
      : ['-f', 'lavfi', '-i', `anullsrc=r=48000:cl=mono`, '-t', String(duration), '-c:a', 'libopus', '-b:a', '16k'];
  const codec = big
    ? ['-b:v', '2000k', '-minrate', '2000k', '-maxrate', '2000k', '-deadline', 'realtime', '-cpu-used', '8']
    : ['-b:v', '0', '-crf', '50', '-deadline', 'good', '-cpu-used', '4'];
  ffmpeg(
    ...source,
    ...audio,
    '-c:v',
    'libvpx-vp9',
    ...codec,
    '-threads',
    '1',
    '-row-mt',
    '0',
    '-pix_fmt',
    'yuv420p',
    '-g',
    '15',
    '-fflags',
    '+bitexact',
    '-flags',
    '+bitexact',
    '-map_metadata',
    '-1',
    file,
  );
}

function hslToHex(hue: number) {
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (0.55 - 0.3 * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [channel(0), channel(8), channel(4)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

mkdirSync(resolve(OUT, 'media'), { recursive: true });
const tmp = resolve(OUT, 'media/.tmp');
mkdirSync(tmp, { recursive: true });

const manifest: Manifest = { photos: {}, videos: {} };

PHOTOS.forEach((photo, index) => {
  const file = resolve(OUT, photoAssetUrl(photo.id));
  const w = photo.assetW ?? photo.w;
  const h = photo.assetH ?? photo.h;
  gradientJpeg(file, w, h, photo.id, index + 1);
  manifest.photos[photo.id] = { bytes: readFileSync(file).length, stripped: strippedThumb(file, tmp, w, h) };
});

VIDEOS.forEach((spec) => {
  const file = resolve(OUT, videoAssetUrl(spec.id));
  encodeVideo(file, spec);
  const poster = resolve(OUT, posterAssetUrl(spec.id));
  gradientJpeg(poster, 320, Math.round((320 * spec.h) / spec.w), spec.id, 0);
  manifest.videos[spec.id] = {
    bytes: readFileSync(file).length,
    posterBytes: readFileSync(poster).length,
    stripped: strippedThumb(poster, tmp, 320, Math.round((320 * spec.h) / spec.w)),
  };
});

execFileSync('rm', ['-r', tmp]);
writeFileSync(resolve(OUT, 'media/manifest.json'), `${JSON.stringify(manifest, undefined, 2)}\n`);
process.stdout.write(`wrote ${PHOTOS.length} photos and ${VIDEOS.length} videos into ${OUT}/media\n`);
