import type { Accessor } from 'frameact';
import { createMemo } from 'frameact';
import { For } from 'frameact/dom';
import { getActions, getGlobal, withGlobal } from '../../../global';

import type { ApiMediaExtendedPreview, ApiMessage, ApiPhoto, ApiVideo } from '../../../api/types';
import type { GlobalState, TabState } from '../../../global/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';
import type { IAlbum, ThemeKey } from '../../../types';
import type { IAlbumLayoutItem } from './helpers/calculateAlbumLayout';

import {
  getIsDownloading,
  getMediaDimensions,
  getMessageContent,
  getMessageHtmlId,
  getMessagePhoto,
} from '../../../global/helpers';
import {
  selectActiveDownloads,
  selectCanAutoLoadMedia,
  selectCanAutoPlayMedia,
  selectTheme,
} from '../../../global/selectors';
import { areArraysShallowEqual } from '../../../util/areShallowEqual';
import { getMessageKey } from '../../../util/keys/messageKey';
import { clampMediaDimensions } from '../../common/helpers/placeholder';
import { AlbumRectPart, calculateAlbumLayout } from './helpers/calculateAlbumLayout';
import withSelectControl from './hocs/withSelectControl';

import AlbumItem from './AlbumItem';
import Photo from './Photo';
import Video from './Video';

import './Album.scss';

const PhotoWithSelect = withSelectControl(Photo);
const VideoWithSelect = withSelectControl(Video);

// Deviation (untrusted): the number of parts of an album is controlled by the sender (any number of grouped messages, or
// of declared paid media), and every part is a connected media component. Telegram limits an album to 10, so more are never
// rendered (the cap is applied before the layout and before any row is created).
const MAX_ALBUM_ITEMS = 10;

// Deviation: a part that is gone (removed while its row is still being disposed) gets a full-size box instead of a read of
// `undefined` (tt rendered the list in one pass and could not see the gap).
const FALLBACK_LAYOUT_ITEM: IAlbumLayoutItem = {
  rect: { x: 0, y: 0, width: 1, height: 1 },
  sides: AlbumRectPart.Top | AlbumRectPart.Right | AlbumRectPart.Bottom | AlbumRectPart.Left,
};

type OwnProps = {
  album: IAlbum;
  observeIntersection: ObserveFn;
  hasCustomAppendix?: boolean;
  isOwn: boolean;
  isProtected?: boolean;
  onMediaClick: (messageId: number, index?: number) => void;
};

type StateProps = {
  theme: ThemeKey;
  uploadsByKey: GlobalState['fileUploads']['byMessageKey'];
  activeDownloads: TabState['activeDownloads'];
};

type AlbumMedia = ApiPhoto | ApiVideo | ApiMediaExtendedPreview;

// A part of the album as it is rendered: `key` is the identity of its row (the message id, or the position for paid media,
// where every part belongs to the main message), `index` its position among the rendered parts.
type AlbumPart = {
  key: number;
  index: number;
  message: ApiMessage;
  photo?: ApiPhoto | ApiMediaExtendedPreview;
  video?: ApiVideo | ApiMediaExtendedPreview;
  ratio: number;
};

const Album = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { cancelUploadMedia } = getActions();

  const handlePaidMediaClick = (index: number) => {
    props.onMediaClick(props.album.mainMessage.id, index);
  };

  const handleAlbumMessageClick = (messageId: number) => {
    props.onMediaClick(messageId);
  };

  const handleCancelUpload = (messageId: number) => {
    cancelUploadMedia({ chatId: props.album.mainMessage.chatId, messageId });
  };

  // Deviation: tt's `messages` (the message of each part), the photo / video of each part (in `renderAlbumMessage`) and the
  // media of the layout (`getAlbumMedia`) are built once here. A part without a photo or a video is dropped before the
  // layout, so the index of a part is its index in the layout (tt indexed `albumLayout.items` by the message position and
  // read `undefined` for a message without media).
  const parts = createMemo(() => buildAlbumParts(props.album));

  // Deviation: the layout is calculated once per set of ratios: an album that changed in no ratio (a view counter, a
  // reaction, a part that was replaced by an equal one) keeps it.
  const ratios = createMemo(() => parts().map((part) => part.ratio), { equals: areArraysShallowEqual });
  const albumLayout = createMemo(() => calculateAlbumLayout(ratios()));

  function renderAlbumMessage(part: Accessor<AlbumPart>) {
    const message = () => part().message;
    const index = () => part().index;
    const layoutItem = createMemo(() => albumLayout().items[index()] ?? FALLBACK_LAYOUT_ITEM);
    const kind = createMemo(() => (part().photo ? 'photo' : part().video ? 'video' : undefined));

    // Ignoring global updates is a known drawback here
    const canAutoLoad = createMemo(() => selectCanAutoLoadMedia(getGlobal(), message()));
    const canAutoPlay = createMemo(() => selectCanAutoPlayMedia(getGlobal(), message()));

    const id = () => `album-media-${getMessageHtmlId(message().id, props.album.isPaidMedia ? index() : undefined)}`;
    const clickArg = () => (props.album.isPaidMedia ? index() : message().id);
    const uploadProgress = () => props.uploadsByKey[getMessageKey(message())]?.progress;

    return (
      <AlbumItem item={layoutItem()} className="album-item">
        {kind() === 'photo' ? (
          <PhotoWithSelect
            id={id()}
            photo={part().photo!}
            isOwn={props.isOwn}
            observeIntersection={props.observeIntersection}
            canAutoLoad={canAutoLoad()}
            shouldAffectAppendix={
              props.hasCustomAppendix &&
              (props.isOwn
                ? index() === parts().length - 1
                : Boolean(layoutItem().sides & AlbumRectPart.Left && layoutItem().sides & AlbumRectPart.Bottom))
            }
            uploadProgress={uploadProgress()}
            layout="fill"
            isProtected={props.isProtected}
            clickArg={clickArg()}
            onClick={props.album.isPaidMedia ? handlePaidMediaClick : handleAlbumMessageClick}
            onCancelUpload={handleCancelUpload}
            isDownloading={getIsMediaDownloading(props.activeDownloads, part().photo)}
            theme={props.theme}
            noSelectControls={props.album.isPaidMedia}
          />
        ) : kind() === 'video' ? (
          <VideoWithSelect
            id={id()}
            video={part().video!}
            observeIntersectionForLoading={props.observeIntersection}
            canAutoLoad={canAutoLoad()}
            canAutoPlay={canAutoPlay()}
            uploadProgress={uploadProgress()}
            layout="fill"
            isProtected={props.isProtected}
            clickArg={clickArg()}
            onClick={props.album.isPaidMedia ? handlePaidMediaClick : handleAlbumMessageClick}
            onCancelUpload={handleCancelUpload}
            isDownloading={getIsMediaDownloading(props.activeDownloads, part().video)}
            noSelectControls={props.album.isPaidMedia}
          />
        ) : undefined}
      </AlbumItem>
    );
  }

  return (
    <div class="Album" style={`--album-aspect-ratio: ${albumLayout().aspectRatio}`}>
      <For each={parts()} keyed={(part) => part.key}>
        {(part) => renderAlbumMessage(part)}
      </For>
    </div>
  );
};

function buildAlbumParts(album: IAlbum): AlbumPart[] {
  const parts: AlbumPart[] = [];

  if (album.isPaidMedia) {
    const { mainMessage } = album;
    // Deviation (untrusted): `paidMedia` is read with a guard (tt asserted it).
    const extendedMedia = mainMessage.content.paidMedia?.extendedMedia ?? [];

    extendedMedia.slice(0, MAX_ALBUM_ITEMS).forEach((renderingPaidMedia) => {
      const paidPhotoOrPreview = 'mediaType' in renderingPaidMedia ? renderingPaidMedia : renderingPaidMedia.photo;
      const paidVideoOrPreview = 'mediaType' in renderingPaidMedia ? renderingPaidMedia : renderingPaidMedia.video;
      const photo = paidPhotoOrPreview || getMessagePhoto(mainMessage);
      const video = paidVideoOrPreview || getMessageContent(mainMessage).video;
      pushAlbumPart(parts, mainMessage, photo, video, true);
    });

    return parts;
  }

  album.messages.slice(0, MAX_ALBUM_ITEMS).forEach((message) => {
    pushAlbumPart(parts, message, getMessagePhoto(message), getMessageContent(message).video, false);
  });

  return parts;
}

function pushAlbumPart(
  parts: AlbumPart[],
  message: ApiMessage,
  photo: AlbumPart['photo'],
  video: AlbumPart['video'],
  isPaidMedia: boolean,
) {
  const media: AlbumMedia | undefined = photo || video;
  if (!media) return;

  const index = parts.length;
  // Deviation (untrusted): the ratio comes from the clamped dimensions, never from the raw sizes of the server.
  const { aspectRatio } = clampMediaDimensions(getMediaDimensions(media));

  parts.push({
    key: isPaidMedia ? index : message.id,
    index,
    message,
    photo,
    video,
    ratio: aspectRatio,
  });
}

function getIsMediaDownloading(activeDownloads: TabState['activeDownloads'], media?: AlbumMedia) {
  return Boolean(media && media.mediaType !== 'extendedMediaPreview' && getIsDownloading(activeDownloads, media));
}

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  const theme = selectTheme(global);
  const activeDownloads = selectActiveDownloads(global);

  return {
    theme,
    uploadsByKey: global.fileUploads.byMessageKey,
    activeDownloads,
  };
};

export default Album;
