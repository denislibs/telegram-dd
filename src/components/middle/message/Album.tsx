// FOUNDATION STUB: Album (telegram-tt src/components/middle/message/Album.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import { createMemo } from 'frameact';

import type { ApiMediaExtendedPreview, ApiPhoto, ApiVideo } from '../../../api/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';
import type { IAlbum } from '../../../types';

import { getMediaDimensions, getMessageContent, getMessagePhoto } from '../../../global/helpers';
import { getMediaPlaceholderSize, PLACEHOLDER_SURFACE } from '../../common/helpers/placeholder';
import { calculateAlbumLayout } from './helpers/calculateAlbumLayout';

import './Album.scss';

export type OwnProps = {
  album: IAlbum;
  observeIntersection: ObserveFn;
  hasCustomAppendix?: boolean;
  isOwn: boolean;
  isProtected?: boolean;
  onMediaClick: (messageId: number, index?: number) => void;
};

// Telegram allows 10 items in an album: the layout of a longer (hostile) list is not computed.
const MAX_ALBUM_ITEMS = 10;

type AlbumMedia = ApiPhoto | ApiVideo | ApiMediaExtendedPreview;

function getAlbumMedia(album: IAlbum) {
  const media = album.isPaidMedia
    ? album.mainMessage.content.paidMedia!.extendedMedia.map((item) =>
        'mediaType' in item ? item : item.photo || item.video,
      )
    : album.messages.map((message) => getMessagePhoto(message) || getMessageContent(message).video);

  return media.filter((item): item is AlbumMedia => Boolean(item)).slice(0, MAX_ALBUM_ITEMS);
}

// TODO(port): the real Album (the items with Photo / Video, selection, uploads, downloads).
const Album = (props: OwnProps) => {
  const albumLayout = createMemo(() =>
    calculateAlbumLayout(
      getAlbumMedia(props.album).map((media) => getMediaPlaceholderSize(getMediaDimensions(media)).aspectRatio),
    ),
  );

  return (
    <div
      role="img"
      aria-label="Album, not supported yet"
      class="Album"
      style={`--album-aspect-ratio: ${albumLayout().aspectRatio}; ${PLACEHOLDER_SURFACE}`}
    />
  );
};

export default Album;
