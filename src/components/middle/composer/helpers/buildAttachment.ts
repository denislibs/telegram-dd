// FOUNDATION STUB: buildAttachment (telegram-tt src/components/middle/composer/helpers/buildAttachment.ts) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
// Deviation: `buildAttachment` and `prepareAttachment` reject (no file is read, resized or probed);
// `prepareAttachmentsToSend` returns the list unchanged; `buildGifAttachment` and `getPreparedPhotoDimensions` are
// tt's own code (they need no file processing).
import type { ApiAttachment, ApiVideo } from '../../../../api/types';

import { GIF_MIME_TYPE } from '../../../../config';

const MAX_STANDARD_QUALITY_IMG_SIZE = 1280; // px
const MAX_HIGH_QUALITY_IMG_SIZE = 2560;

export default function buildAttachment(
  _filename: string,
  _blob: Blob,
  _options?: Partial<ApiAttachment>,
): Promise<ApiAttachment> {
  return Promise.reject(new Error('attachments are not ported yet'));
}

export function prepareAttachment(_attachment: ApiAttachment): Promise<ApiAttachment> {
  return Promise.reject(new Error('attachments are not ported yet'));
}

export function prepareAttachmentsToSend(
  attachments: ApiAttachment[],
  _shouldSendCompressed?: boolean,
): ApiAttachment[] {
  return attachments;
}

export function getPreparedPhotoDimensions(
  width: number,
  height: number,
  mimeType: string,
  shouldSendInHighQuality?: boolean,
) {
  if (mimeType === GIF_MIME_TYPE) return { width, height };

  const maxSize = shouldSendInHighQuality ? MAX_HIGH_QUALITY_IMG_SIZE : MAX_STANDARD_QUALITY_IMG_SIZE;
  const ratio = Math.min(maxSize / Math.max(width, height), 1);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

export function buildGifAttachment(gif: ApiVideo): ApiAttachment {
  const { blobUrl, thumbnail, fileName, mimeType, size, width, height, duration } = gif;

  return {
    gif,
    blobUrl: blobUrl || '',
    previewBlobUrl: thumbnail?.dataUri,
    filename: fileName,
    mimeType,
    size,
    quick: width && height ? { width, height, duration } : undefined,
    uniqueId: `gif-${gif.id}-${Date.now()}`,
  } satisfies ApiAttachment;
}
