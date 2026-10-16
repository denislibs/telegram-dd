// Original file (not in telegram-tt). Request handlers of the `media` mock scenario (media slices, docs/plans/2026-10-15-media.md §5).
// The default mock cannot serve real media: `createMockedPhoto` hardcodes two 100x100 sizes and no stripped thumbnail,
// `createMockedDocument` has no attributes and no thumbs, and `upload.GetFile` returns the WHOLE file for every part and ignores
// `offset` / `limit` (the downloader asks for 512 KB parts and writes each at its offset, so any asset above one part is corrupted).
//
// A message of the scenario carries a plain `mediaSpec` (JSON cannot hold the Api classes); this builds the real objects:
//   photo: PhotoStrippedSize + the PhotoSizes 'm' and 'x' at the declared size
//   video: a Document with DocumentAttributeVideo (round / supportsStreaming / nosound), DocumentAttributeAnimated for a GIF,
//          the filename attribute, and the thumbs (stripped + the 'm' poster)
// and answers `upload.GetFile` with `bytes.subarray(offset, offset + limit)` of the asset behind the requested location.
// The history is paged like the server does (offsetId / addOffset / limit / maxId / minId, newest first), as in `messages.ts`.
import type TelegramClient from '../MockClient';

import { toJSNumber } from '../../../../util/numbers';
import Api from '../../tl/api';
import createMockedChannel from '../mockUtils/createMockedChannel';
import createMockedMessage from '../mockUtils/createMockedMessage';
import getIdFromInputPeer from '../mockUtils/getIdFromInputPeer';

// The same constant as scripts/mock/mediaSpec.ts: the poster ('m' thumb) of video N is the document N + 10000.
const THUMB_ID_OFFSET = 10_000;
const VIDEO_MIME = 'video/webm';
const POSTER_MAX_SIDE = 320;

type StrippedSpec = { base64: string; w: number; h: number };
type PhotoSpec = { kind: 'photo'; id: number; w: number; h: number; spoiler?: boolean; stripped: StrippedSpec };
type VideoSpec = {
  kind: 'video';
  id: number;
  w: number;
  h: number;
  duration: number;
  round?: boolean;
  gif?: boolean;
  noSound?: boolean;
  spoiler?: boolean;
  posterW: number;
  posterH: number;
  stripped: StrippedSpec;
};
type ScenarioMessage = { groupedId?: string; mediaSpec?: PhotoSpec | VideoSpec };

function bytesOfAsset(mockClient: TelegramClient, id: number) {
  return mockClient.mockData.documents.find((document) => document.id === id)?.bytes;
}

function fromBase64(base64: string) {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function scaledToSide(w: number, h: number, side: number) {
  const scale = Math.min(1, side / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

function buildPhoto(mockClient: TelegramClient, spec: PhotoSpec, date: number) {
  const size = bytesOfAsset(mockClient, spec.id)?.length ?? 0;
  const small = scaledToSide(spec.w, spec.h, POSTER_MAX_SIDE);

  return new Api.MessageMediaPhoto({
    spoiler: spec.spoiler || undefined,
    photo: new Api.Photo({
      id: BigInt(spec.id),
      accessHash: 1n,
      fileReference: new Uint8Array([0]),
      date,
      sizes: [
        new Api.PhotoStrippedSize({ type: 'i', bytes: fromBase64(spec.stripped.base64) }),
        new Api.PhotoSize({ type: 'm', w: small.w, h: small.h, size }),
        new Api.PhotoSize({ type: 'x', w: spec.w, h: spec.h, size }),
      ],
      dcId: 2,
    }),
  });
}

function buildVideo(mockClient: TelegramClient, spec: VideoSpec, date: number) {
  const size = bytesOfAsset(mockClient, spec.id)?.length ?? 0;
  const posterSize = bytesOfAsset(mockClient, spec.id + THUMB_ID_OFFSET)?.length ?? 0;

  return new Api.MessageMediaDocument({
    spoiler: spec.spoiler || undefined,
    video: spec.round ? undefined : true,
    round: spec.round || undefined,
    document: new Api.Document({
      id: BigInt(spec.id),
      accessHash: 1n,
      fileReference: new Uint8Array([0]),
      date,
      mimeType: VIDEO_MIME,
      size: BigInt(size),
      dcId: 2,
      thumbs: [
        new Api.PhotoStrippedSize({ type: 'i', bytes: fromBase64(spec.stripped.base64) }),
        new Api.PhotoSize({ type: 'm', w: spec.posterW, h: spec.posterH, size: posterSize }),
      ],
      attributes: [
        new Api.DocumentAttributeVideo({
          roundMessage: spec.round || undefined,
          supportsStreaming: true,
          nosound: spec.noSound || undefined,
          duration: spec.duration,
          w: spec.w,
          h: spec.h,
        }),
        ...(spec.gif ? [new Api.DocumentAttributeAnimated()] : []),
        new Api.DocumentAttributeFilename({ fileName: `video-${spec.id}.webm` }),
      ],
    }),
  });
}

function createMessage(mockClient: TelegramClient, peerId: string, id: number): Api.Message {
  const message = createMockedMessage(peerId, id, mockClient.mockData);
  const raw = mockClient.mockData.messages[peerId].find((item) => item.id === id) as ScenarioMessage | undefined;
  if (!raw) return message;

  if (raw.groupedId) message.groupedId = BigInt(raw.groupedId);
  if (raw.mediaSpec) {
    message.media = raw.mediaSpec.kind === 'photo'
      ? buildPhoto(mockClient, raw.mediaSpec, message.date)
      : buildVideo(mockClient, raw.mediaSpec, message.date);
  }

  return message;
}

export default function<A, R>(mockClient: TelegramClient, request: Api.Request<A, R>) {
  if (request instanceof Api.messages.GetDialogs) {
    if (request.folderId || !(request.offsetPeer instanceof Api.InputPeerEmpty)) {
      return new Api.messages.Dialogs({ dialogs: [], users: [], chats: [], messages: [] });
    }

    return new Api.messages.Dialogs({
      dialogs: mockClient.getDialogs(),
      messages: mockClient.mockData.dialogs.active.map(({ id, topMessage }) => createMessage(mockClient, id, topMessage!)),
      chats: mockClient.mockData.channels.map(({ id }) => createMockedChannel(id, mockClient.mockData)),
      users: mockClient.mockData.users.map(({ id }) => mockClient.getUser(id)),
    });
  }

  if (request instanceof Api.messages.GetHistory) {
    const peerId = getIdFromInputPeer(request.peer);
    const all = (mockClient.mockData.messages[peerId] || []).map(({ id }) => id).sort((a, b) => b - a);

    let ids = all;
    if (request.maxId) ids = ids.filter((id) => id < request.maxId);
    if (request.minId) ids = ids.filter((id) => id > request.minId);

    // The first `position` messages are the ones at or after the offset message: a negative addOffset reaches back to them
    const position = request.offsetId ? ids.filter((id) => id >= request.offsetId).length : 0;
    const start = Math.max(0, position + (request.addOffset || 0));
    const page = ids.slice(start, start + request.limit);

    return new Api.messages.MessagesSlice({
      messages: page.map((id) => createMessage(mockClient, peerId, id)),
      count: all.length,
      chats: [],
      users: [],
      topics: [],
    });
  }

  if (request instanceof Api.upload.GetFile) {
    const { location } = request;
    if (!(location instanceof Api.InputPhotoFileLocation || location instanceof Api.InputDocumentFileLocation)) {
      return 'pass';
    }

    // A document location with a thumb size is the poster ('m') of a video; a photo is always the one asset.
    const isThumb = location instanceof Api.InputDocumentFileLocation && Boolean(location.thumbSize);
    const id = toJSNumber(location.id) + (isThumb ? THUMB_ID_OFFSET : 0);
    const bytes = bytesOfAsset(mockClient, id);
    if (!bytes) return 'pass';

    const offset = toJSNumber(request.offset);
    return new Api.upload.File({
      type: new Api.storage.FileUnknown(),
      mtime: 0,
      bytes: bytes.slice(offset, offset + request.limit),
    });
  }

  return 'pass';
}
