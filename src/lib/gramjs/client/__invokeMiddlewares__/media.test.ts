// Original test (not in telegram-tt): the request handlers of the `media` mock scenario. The default mock answered every
// `upload.GetFile` part with the WHOLE file, so any asset above one 512 KB part was corrupted by the downloader.
import { describe, expect, it } from 'vitest';

import type TelegramClient from '../MockClient';

import Api from '../../tl/api';
import media from './media';

const SIZE = 3 * 1024 * 1024 + 123;
const bytes = Uint8Array.from({ length: SIZE }, (_, i) => (i * 31 + (i >> 8)) & 0xff);

function mockClient() {
  const mockData = {
    users: [{ id: '21', firstName: 'Mia' }],
    chats: [],
    channels: [],
    dialogs: { active: [{ id: '21', topMessage: 3 }], archived: [] },
    messages: {
      '21': [
        { id: 1, message: 'one', entities: [] },
        { id: 2, message: 'two', entities: [] },
        {
          id: 3,
          message: '',
          entities: [],
          groupedId: '9',
          mediaSpec: { kind: 'photo', id: 301, w: 800, h: 600, stripped: { base64: 'AR4o', w: 40, h: 30 } },
        },
        {
          id: 4,
          message: '',
          entities: [],
          mediaSpec: {
            kind: 'video',
            id: 401,
            w: 640,
            h: 360,
            duration: 2,
            gif: true,
            noSound: true,
            posterW: 320,
            posterH: 180,
            stripped: { base64: 'AR4o', w: 40, h: 30 },
          },
        },
      ],
    },
    availableReactions: [],
    documents: [
      { id: 301, url: 'x', mimeType: 'image/jpeg', bytes },
      { id: 401, url: 'y', mimeType: 'video/webm', bytes: new Uint8Array(1000) },
      { id: 10401, url: 'z', mimeType: 'image/jpeg', bytes: new Uint8Array(50) },
    ],
    dialogFilters: [],
    topPeers: [],
  };
  return { mockData, getDialogs: () => [], getUser: () => undefined } as unknown as TelegramClient;
}

function download(client: TelegramClient, location: Api.TypeInputFileLocation, partSize: number) {
  const parts: Uint8Array[] = [];
  for (let offset = 0; ; offset += partSize) {
    const result = (media(
      client,
      new Api.upload.GetFile({ location, offset: BigInt(offset), limit: partSize }),
    )) as Api.upload.File;
    parts.push(result.bytes);
    if (result.bytes.length < partSize) break;
  }
  return parts;
}

describe('media middleware: upload.GetFile', () => {
  const photoLocation = new Api.InputPhotoFileLocation({
    id: 301n,
    accessHash: 1n,
    fileReference: new Uint8Array([0]),
    thumbSize: 'x',
  });

  it('answers each part with the slice at its offset, so 512 KB parts reassemble a big file', () => {
    const parts = download(mockClient(), photoLocation, 512 * 1024);

    expect(parts).toHaveLength(7);
    expect(parts[0].length).toBe(512 * 1024);
    expect(parts[6].length).toBe(SIZE - 6 * 512 * 1024);
    const whole = new Uint8Array(SIZE);
    parts.forEach((part, index) => whole.set(part, index * 512 * 1024));
    expect(Buffer.from(whole).equals(Buffer.from(bytes))).toBe(true);
  });

  it('answers a request past the end with no bytes', () => {
    const result = (media(
      mockClient(),
      new Api.upload.GetFile({ location: photoLocation, offset: BigInt(SIZE + 10), limit: 4096 }),
    )) as Api.upload.File;
    expect(result.bytes.length).toBe(0);
  });

  it('serves the poster of a video for a document thumb size and the video otherwise', () => {
    const client = mockClient();
    const documentLocation = (thumbSize: string) =>
      new Api.InputDocumentFileLocation({
        id: 401n,
        accessHash: 1n,
        fileReference: new Uint8Array([0]),
        thumbSize,
      });

    expect((download(client, documentLocation('m'), 4096))[0].length).toBe(50);
    expect((download(client, documentLocation(''), 4096))[0].length).toBe(1000);
  });

  it('passes a location it does not know', () => {
    const location = new Api.InputDocumentFileLocation({
      id: 999n,
      accessHash: 1n,
      fileReference: new Uint8Array([0]),
      thumbSize: '',
    });
    expect(media(mockClient(), new Api.upload.GetFile({ location, offset: 0n, limit: 4096 }))).toBe('pass');
  });
});

describe('media middleware: history', () => {
  const history = (extra: Partial<ConstructorParameters<typeof Api.messages.GetHistory>[0]> = {}) => {
    const result = (media(
      mockClient(),
      new Api.messages.GetHistory({
        peer: new Api.InputPeerUser({ userId: 21n, accessHash: 1n }),
        offsetId: 0,
        offsetDate: 0,
        addOffset: 0,
        limit: 2,
        maxId: 0,
        minId: 0,
        hash: 0n,
        ...extra,
      }),
    )) as Api.messages.MessagesSlice;
    return result.messages as Api.Message[];
  };

  it('pages the history newest first', () => {
    expect((history()).map((message) => message.id)).toEqual([4, 3]);
    expect((history({ offsetId: 3 })).map((message) => message.id)).toEqual([2, 1]);
  });

  it('builds a photo at the declared size with a stripped thumbnail and an album id', () => {
    const message = (history()).find((item) => item.id === 3)!;
    const photo = (message.media as Api.MessageMediaPhoto).photo as Api.Photo;

    expect(message.groupedId).toBe(9n);
    expect(photo.sizes.map((size) => size.className)).toEqual(['PhotoStrippedSize', 'PhotoSize', 'PhotoSize']);
    const full = photo.sizes[2] as Api.PhotoSize;
    expect([full.type, full.w, full.h, full.size]).toEqual(['x', 800, 600, SIZE]);
    const small = photo.sizes[1] as Api.PhotoSize;
    expect([small.w, small.h]).toEqual([320, 240]);
  });

  it('builds a GIF document with the video and animated attributes and a poster thumb', () => {
    const message = (history()).find((item) => item.id === 4)!;
    const document = (message.media as Api.MessageMediaDocument).document as Api.Document;

    expect(document.mimeType).toBe('video/webm');
    expect(document.attributes.map((attribute) => attribute.className)).toEqual([
      'DocumentAttributeVideo',
      'DocumentAttributeAnimated',
      'DocumentAttributeFilename',
    ]);
    const attribute = document.attributes[0] as Api.DocumentAttributeVideo;
    expect([attribute.w, attribute.h, attribute.duration, attribute.supportsStreaming, attribute.nosound]).toEqual([
      640, 360, 2, true, true,
    ]);
    expect(document.size).toBe(1000n);
    expect((document.thumbs![1] as Api.PhotoSize).size).toBe(50);
  });
});
