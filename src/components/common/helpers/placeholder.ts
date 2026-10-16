// Original file (not in telegram-tt). Sizing helpers of the FOUNDATION STUB placeholders of the message list: the numbers
// that come from the server (media dimensions, durations, counts) are clamped, so a hostile value cannot produce a
// giant, NaN or Infinity box.
import type { ApiDimensions } from '../../../api/types';

import buildStyle from '../../../util/buildStyle';

export const PLACEHOLDER_MAX_MEDIA_PX = 8192;
export const PLACEHOLDER_MIN_ASPECT_RATIO = 0.1;
export const PLACEHOLDER_MAX_ASPECT_RATIO = 10;

/** A placeholder surface: a flat tint, nothing loaded and nothing shown from the server. */
export const PLACEHOLDER_SURFACE = 'background: var(--color-interactive-element-hover)';
export const PLACEHOLDER_RADIUS = 'border-radius: var(--border-radius-messages-small)';

export function clampNumber(value: unknown, min: number, max: number, fallback = min) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function clampCount(value: unknown, max: number) {
  return Math.floor(clampNumber(value, 0, max, 0));
}

/** The width, the height and the aspect ratio of a media box, each finite and bounded. */
export function getMediaPlaceholderSize(dimensions?: Partial<ApiDimensions>) {
  const width = clampNumber(dimensions?.width, 1, PLACEHOLDER_MAX_MEDIA_PX, 1);
  const height = clampNumber(dimensions?.height, 1, PLACEHOLDER_MAX_MEDIA_PX, 1);
  const aspectRatio = clampNumber(width / height, PLACEHOLDER_MIN_ASPECT_RATIO, PLACEHOLDER_MAX_ASPECT_RATIO, 1);

  return { width, height, aspectRatio };
}

/**
 * The shared clamp of untrusted media dimensions (Photo, Video, Album, the web page preview, the viewer): finite, at least
 * 1 px, at most `PLACEHOLDER_MAX_MEDIA_PX`, aspect ratio within `PLACEHOLDER_MIN/MAX_ASPECT_RATIO`. A legitimate size is
 * returned unchanged, so a box is the same as tt's.
 */
export const clampMediaDimensions = getMediaPlaceholderSize;

/** The custom properties tt's `media.module.scss` `.frame` reads. */
export function buildMediaFrameStyle(size: { width: number; aspectRatio: number }) {
  return buildStyle(
    `--media-width: ${size.width}px`,
    `--media-aspect-ratio: ${size.aspectRatio}`,
    PLACEHOLDER_SURFACE,
    PLACEHOLDER_RADIUS,
  );
}
