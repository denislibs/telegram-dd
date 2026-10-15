import { createMemo } from 'frameact';
import { getActions, getGlobal, withGlobal } from '../../../global';

import type { ApiMediaExtendedPreview, ApiMessage, ApiPhoto, ApiVideo } from '../../../api/types';
import type { GlobalState, TabState } from '../../../global/types';
import type { IAlbum, ThemeKey } from '../../../types';

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
import { getMessageKey } from '../../../util/keys/messageKey';
import { AlbumRectPart, calculateAlbumLayout } from './helpers/calculateAlbumLayout';
import withSelectControl from './hocs/withSelectControl';

import AlbumItem from './AlbumItem';
import Photo from './Photo';
import Video from './Video';

import './Album.scss';

const PhotoWithSelect = withSelectControl(Photo);
const VideoWithSelect = withSelectControl(Video);

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

const Album = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { cancelUploadMedia } = getActions();

  const {
    content: { paidMedia },
  } = props.album.mainMessage;

  const mediaCount = createMemo(() => props.album.isPaidMedia ? paidMedia!.extendedMedia.length : props.album.messages.length);

  const handlePaidMediaClick = (index: number) => {
    props.onMediaClick(props.album.mainMessage.id, index);
  };

  const handleAlbumMessageClick = (messageId: number) => {
    props.onMediaClick(messageId);
  };

  const handleCancelUpload = (messageId: number) => {
    cancelUploadMedia({ chatId: props.album.mainMessage.chatId, messageId });
  };

  const messages = createMemo(() => {
    if (props.album.isPaidMedia) {
      return props.album.mainMessage.content.paidMedia!.extendedMedia.map(() => props.album.mainMessage);
    }

    return props.album.messages;
  });

  const albumLayout = createMemo(() => {
    const ratios = getAlbumMedia(props.album).map((media) => {
      const { width, height } = getMediaDimensions(media);
      return width / height;
    });

    return calculateAlbumLayout(ratios);
  });

  function renderAlbumMessage(message: ApiMessage, index: number) {
    const renderingPaidMedia = props.album.isPaidMedia ? message.content.paidMedia?.extendedMedia[index] : undefined;
    const paidPhotoOrPreview =
      renderingPaidMedia && 'mediaType' in renderingPaidMedia ? renderingPaidMedia : renderingPaidMedia?.photo;
    const paidVideoOrPreview =
      renderingPaidMedia && 'mediaType' in renderingPaidMedia ? renderingPaidMedia : renderingPaidMedia?.video;
    const photo = paidPhotoOrPreview || getMessagePhoto(message);
    const video = paidVideoOrPreview || getMessageContent(message).video;

    const fileUpload = props.uploadsByKey[getMessageKey(message)];
    const uploadProgress = fileUpload?.progress;
    const layoutItem = albumLayout().items[index];
    const { sides } = layoutItem;

    // Ignoring global updates is a known drawback here
    const canAutoLoad = selectCanAutoLoadMedia(getGlobal(), message);
    const canAutoPlay = selectCanAutoPlayMedia(getGlobal(), message);
    let mediaElement;

    if (photo) {
      const shouldAffectAppendix =
        props.hasCustomAppendix &&
        (props.isOwn ? index === mediaCount() - 1 : Boolean(sides & AlbumRectPart.Left && sides & AlbumRectPart.Bottom));

      mediaElement = (
        <PhotoWithSelect
          id={`album-media-${getMessageHtmlId(message.id, props.album.isPaidMedia ? index : undefined)}`}
          photo={photo}
          isOwn={props.isOwn}
          observeIntersection={props.observeIntersection}
          canAutoLoad={canAutoLoad}
          shouldAffectAppendix={shouldAffectAppendix}
          uploadProgress={uploadProgress}
          layout="fill"
          isProtected={props.isProtected}
          clickArg={props.album.isPaidMedia ? index : message.id}
          onClick={props.album.isPaidMedia ? handlePaidMediaClick : handleAlbumMessageClick}
          onCancelUpload={handleCancelUpload}
          isDownloading={photo.mediaType !== 'extendedMediaPreview' && getIsDownloading(props.activeDownloads, photo)}
          theme={props.theme}
          noSelectControls={props.album.isPaidMedia}
        />
      );
    } else if (video) {
      mediaElement = (
        <VideoWithSelect
          id={`album-media-${getMessageHtmlId(message.id, props.album.isPaidMedia ? index : undefined)}`}
          video={video}
          observeIntersectionForLoading={props.observeIntersection}
          canAutoLoad={canAutoLoad}
          canAutoPlay={canAutoPlay}
          uploadProgress={uploadProgress}
          layout="fill"
          isProtected={props.isProtected}
          clickArg={props.album.isPaidMedia ? index : message.id}
          onClick={props.album.isPaidMedia ? handlePaidMediaClick : handleAlbumMessageClick}
          onCancelUpload={handleCancelUpload}
          isDownloading={video.mediaType !== 'extendedMediaPreview' && getIsDownloading(props.activeDownloads, video)}
          noSelectControls={props.album.isPaidMedia}
        />
      );
    }

    if (!mediaElement) return undefined;

    return (
      // TODO(codemod): key= on a single element remounted it: wrap in <Show when={key} keyed>{(key) => …}</Show> (the callback MUST take an argument, a zero-argument child is a plain child and never remounts; a falsy key such as 0 renders nothing: use when={{ id: key }})
      <AlbumItem key={props.album.isPaidMedia ? index : message.id} item={layoutItem} className="album-item">
        {mediaElement}
      </AlbumItem>
    );
  }

  return (
    <div class="Album" style={`--album-aspect-ratio: ${albumLayout().aspectRatio}`}>
      {messages().map(renderAlbumMessage)}
    </div>
  );
};

type AlbumMedia = ApiPhoto | ApiVideo | ApiMediaExtendedPreview;

function getAlbumMedia(album: IAlbum) {
  const media = album.isPaidMedia
    ? album.mainMessage.content.paidMedia!.extendedMedia.map((item) =>
        'mediaType' in item ? item : item.photo || item.video,
      )
    : album.messages.map((message) => getMessagePhoto(message) || getMessageContent(message).video);

  return media.filter((item): item is AlbumMedia => Boolean(item));
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
