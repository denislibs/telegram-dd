import { createEffect, createMemo, createSignal, previous } from 'frameact';
import { getActions, withGlobal } from '../../../global';
import { createMediaTransition, createShowTransition } from '../../../lib/kit';
import type { GlobalState } from '../../../global/types';

import type { ApiMediaExtendedPreview, ApiVideo } from '../../../api/types';

import {
  getMediaDimensions,
  getMediaFormat,
  getMediaThumbUri,
  getMediaTransferState,
  getVideoMediaHash,
} from '../../../global/helpers';
import buildClassName from '../../../util/buildClassName';
import buildStyle from '../../../util/buildStyle';
import { formatMediaDuration } from '../../../util/dates/oldDateFormat';
import * as mediaLoader from '../../../util/mediaLoader';

import useUnsupportedMedia from '../../../hooks/media/useUnsupportedMedia';
import useFlag from '../../../hooks/useFlag';
import { useIsIntersecting } from '../../../hooks/useIntersectionObserver';
import useMedia from '../../../hooks/useMedia';
import useMediaWithLoadProgress from '../../../hooks/useMediaWithLoadProgress';
import useBlurredMediaThumbRef from './hooks/useBlurredMediaThumbRef';

import Icon from '../../common/icons/Icon';
import MediaSpoiler from '../../common/MediaSpoiler';
import SensitiveContentConfirmModal from '../../common/SensitiveContentConfirmModal';
import OptimizedVideo from '../../ui/OptimizedVideo';
import ProgressSpinner from '../../ui/ProgressSpinner';
import MediaBadge from './MediaBadge';

import mediaStyles from './media.module.scss';
import styles from './Video.module.scss';

export type OwnProps<T> = {
  id?: string;
  video: ApiVideo | ApiMediaExtendedPreview;
  lastPlaybackTimestamp?: number;
  canAutoLoad?: boolean;
  canAutoPlay?: boolean;
  uploadProgress?: number;
  layout?: 'intrinsic' | 'fill';
  noSpoilerReveal?: boolean;
  isDownloading?: boolean;
  isProtected?: boolean;
  className?: string;
  clickArg?: T;
  isMediaNsfw?: boolean;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  onClick?: (arg: T, e: React.MouseEvent<HTMLElement>) => void;
  onCancelUpload?: (arg: T) => void;
};

type StateProps = {
  needsAgeVerification?: boolean;
};

const Video = <T,>(ownProps: OwnProps<T>) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { cancelMediaDownload, updateContentSettings, openAgeVerificationModal } = getActions();
  let ref!: HTMLDivElement;
  let videoRef!: HTMLVideoElement;
  const [isNsfwModalOpen, openNsfwModal, closeNsfwModal] = useFlag();
  const [shouldAlwaysShowNsfw, setShouldAlwaysShowNsfw] = createSignal(false);

  const isPaidPreview = createMemo(() => props.video.mediaType === 'extendedMediaPreview');
  const getMediaDimensionsResult = createMemo(() => getMediaDimensions(props.video));
  const width = () => getMediaDimensionsResult().width;
  const height = () => getMediaDimensionsResult().height;

  const localBlobUrl = createMemo(() => !isPaidPreview() ? props.video.blobUrl : undefined);

  const shouldShowSpoiler = createMemo(() => isPaidPreview() || props.video.isSpoiler || props.isMediaNsfw);
  const [isSpoilerShown, showSpoiler, hideSpoiler] = useFlag(shouldShowSpoiler());

  createEffect(() => shouldShowSpoiler(), (shouldShowSpoiler2) => {
    if (shouldShowSpoiler2) {
      showSpoiler();
    } else {
      hideSpoiler();
    }
  });

  const handleNsfwConfirm = () => {
    closeNsfwModal();
    hideSpoiler();

    if (shouldAlwaysShowNsfw()) {
      updateContentSettings({ isSensitiveEnabled: true });
    }
  };

  const isIntersectingForLoading = useIsIntersecting(() => ref, () => props.observeIntersectionForLoading);
  const isIntersectingForPlaying = createMemo(() => useIsIntersecting(() => ref, () => props.observeIntersectionForPlaying) && isIntersectingForLoading);
  let wasIntersectedRef = isIntersectingForLoading;
  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (isIntersectingForPlaying() && !wasIntersectedRef) {
    wasIntersectedRef = true;
  }

  const [isLoadAllowed, setIsLoadAllowed] = createSignal(props.canAutoLoad);
  const shouldLoad = createMemo(() => Boolean(isLoadAllowed() && isIntersectingForLoading && !isPaidPreview()));
  const [isPlayAllowed, setIsPlayAllowed] = createSignal(Boolean(props.canAutoPlay && !isSpoilerShown()));

  const fullMediaHash = createMemo(() => !isPaidPreview() ? getVideoMediaHash(props.video, 'inline') : undefined);
  const [isFullMediaPreloaded] = createSignal(Boolean(fullMediaHash() && mediaLoader.getFromMemory(fullMediaHash())));
  const mediaWithLoadProgressResult = createMemo(() => useMediaWithLoadProgress(
    () => fullMediaHash(),
    () => !shouldLoad(),
    () => !isPaidPreview() ? getMediaFormat(props.video, 'inline') : undefined,
  ));
  const mediaData = () => mediaWithLoadProgressResult().mediaData;
  const loadProgress = () => mediaWithLoadProgressResult().loadProgress;
  const fullMediaData = createMemo(() => localBlobUrl() || mediaData());
  const [isPlayerReady, markPlayerReady] = useFlag();

  const thumbDataUri = createMemo(() => getMediaThumbUri(props.video));
  const hasThumb = createMemo(() => Boolean(thumbDataUri()));
  const withBlurredBackground = createMemo(() => (props.layout === undefined ? 'intrinsic' : props.layout) !== 'fill');

  const isInline = createMemo(() => fullMediaData() && wasIntersectedRef);

  const isUnsupported = useUnsupportedMedia(() => videoRef, true, () => !isInline());

  const previewMediaHash = createMemo(() => !isPaidPreview() ? getVideoMediaHash(props.video, 'preview') : undefined);
  const [isPreviewPreloaded] = createSignal(Boolean(previewMediaHash() && mediaLoader.getFromMemory(previewMediaHash())));
  const canLoadPreview = isIntersectingForLoading;
  const previewBlobUrl = useMedia(() => previewMediaHash(), !canLoadPreview);
  const shouldHidePreview = createMemo(() => isPlayerReady() && !isUnsupported);
  const { ref: previewRef } = createMediaTransition({
    hasMediaData: () => Boolean((hasThumb() || previewBlobUrl) && !shouldHidePreview()),
  });

  const noThumb = createMemo(() => Boolean(!hasThumb() || previewBlobUrl || isPlayerReady()));
  const thumbRef = useBlurredMediaThumbRef(() => props.video, () => noThumb());
  // TODO(codemod): ref option: hand the result `ref` to the element (ref={t.ref}) instead
  createMediaTransition({ ref: thumbRef, hasMediaData: () => !noThumb() });
  const blurredBackgroundRef = useBlurredMediaThumbRef(() => props.video, () => !withBlurredBackground());

  const mediaWithLoadProgressResult2 = createMemo(() => useMediaWithLoadProgress(
    () => !isPaidPreview() ? getVideoMediaHash(props.video, 'download') : undefined,
    () => !props.isDownloading,
    () => !isPaidPreview() ? getMediaFormat(props.video, 'download') : undefined,
  ));
  const downloadProgress = () => mediaWithLoadProgressResult2().loadProgress;

  const getMediaTransferStateResult = createMemo(() => getMediaTransferState(
    props.uploadProgress || (props.isDownloading ? downloadProgress() : loadProgress()),
    (shouldLoad() && !isPlayerReady() && !isFullMediaPreloaded()) || props.isDownloading,
    props.uploadProgress !== undefined,
  ));
  const isUploading = () => getMediaTransferStateResult().isUploading;
  const isTransferring = () => getMediaTransferStateResult().isTransferring;
  const transferProgress = () => getMediaTransferStateResult().transferProgress;

  const wasLoadDisabled = createMemo(() => previous(() => isLoadAllowed()) === false);
  const { ref: spinnerRef, shouldRender: shouldRenderSpinner } = createShowTransition({
    isOpen: () => isTransferring() && !isUnsupported,
    noMountTransition: wasLoadDisabled(),
  });
  const { ref: playButtonRef } = createShowTransition({
    isOpen: () => Boolean((isLoadAllowed() || fullMediaData()) && !isPlayAllowed() && !shouldRenderSpinner()),
  });
  const { ref: transferProgressRef, shouldRender: shouldRenderTransferProgress } = createShowTransition({
    isOpen: () => isTransferring() && (!isUnsupported || props.isDownloading),
    noMountTransition: wasLoadDisabled(),
  });

  const [playProgress, setPlayProgress] = createSignal<number>(0);
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setPlayProgress(Math.max(0, e.currentTarget.currentTime - 1));
  };

  const duration =
    createMemo(() => (Number.isFinite(videoRef?.duration) && !isUnsupported ? videoRef?.duration : props.video.duration) || 0);

  const handleClick = (e: React.MouseEvent<HTMLElement, MouseEvent>, isFromSpinner?: boolean) => {
    if (isUploading()) {
      props.onCancelUpload?.(props.clickArg!);
      return;
    }

    if (isSpoilerShown() && props.noSpoilerReveal) {
      props.onClick?.(props.clickArg!, e);
      return;
    }

    if (!isPaidPreview() && props.isDownloading) {
      cancelMediaDownload({ media: props.video });
      return;
    }

    if (!fullMediaData()) {
      setIsLoadAllowed((isAllowed) => !isAllowed);
      return;
    }

    if (fullMediaData() && !isPlayAllowed()) {
      setIsPlayAllowed(true);
    }

    if (isSpoilerShown()) {
      if (props.isMediaNsfw) {
        if (props.needsAgeVerification) {
          openAgeVerificationModal();
          return;
        }
        openNsfwModal();
        return;
      }
      hideSpoiler();
      return;
    }

    if (isFromSpinner && shouldLoad() && !isPlayerReady() && !isFullMediaPreloaded()) {
      setIsLoadAllowed(false);
      e.stopPropagation();
      return;
    }

    props.onClick?.(props.clickArg!, e);
  };

  const handleClickOnSpinner = (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
    handleClick(e, true);
  };

  const componentClassName = createMemo(() => buildClassName(
    'media-inner dark',
    mediaStyles.frame,
    mediaStyles[(props.layout === undefined ? 'intrinsic' : props.layout)],
    !isUploading() && 'interactive',
    props.className,
  ));

  const style = createMemo(() => buildStyle(`--media-width: ${width()}px`, `--media-aspect-ratio: ${width() / height()}`));

  return (
    <div
      ref={ref}
      id={props.id}
      class={componentClassName()}
      style={style()}
      onClick={isUploading() ? undefined : (e) => handleClick(e)}
    >
      {withBlurredBackground() && <canvas ref={blurredBackgroundRef} class="thumbnail blurred-bg" />}
      {isInline() && (
        <OptimizedVideo
          ref={videoRef}
          src={fullMediaData()}
          className="full-media"
          canPlay={isPlayAllowed() && isIntersectingForPlaying() && !isUnsupported}
          defaultMuted
          muted
          loop
          playsInline
          disablePictureInPicture
          draggable={!props.isProtected}
          onTimeUpdate={handleTimeUpdate}
          onReady={markPlayerReady}
        />
      )}
      {previewBlobUrl && (
        <img ref={previewRef} src={previewBlobUrl} class="thumbnail" alt="" draggable={!props.isProtected} />
      )}
      {hasThumb() && !isPreviewPreloaded() && <canvas ref={thumbRef} class="thumbnail" />}
      {props.isProtected && <span class="protector" />}
      <Icon
        ref={playButtonRef}
        name="play"
        className={buildClassName(mediaStyles.controlButton, mediaStyles.playButton)}
      />
      <MediaSpoiler
        isVisible={isSpoilerShown()}
        withAnimation={props.noSpoilerReveal ? undefined : true}
        thumbDataUri={thumbDataUri()}
        isNsfw={props.isMediaNsfw}
        width={width()}
        height={height()}
        className="media-spoiler"
      />
      {shouldRenderSpinner() && (
        <div ref={spinnerRef} class={buildClassName('media-loading', mediaStyles.loading)}>
          <ProgressSpinner progress={transferProgress()} onClick={handleClickOnSpinner} />
        </div>
      )}
      {!isLoadAllowed() && !fullMediaData() && (
        <Icon name="download" className={buildClassName(mediaStyles.controlButton, mediaStyles.downloadButton)} />
      )}
      {shouldRenderTransferProgress() ? (
        <MediaBadge ref={transferProgressRef} className="message-transfer-progress">
          {isUploading() || props.isDownloading ? `${Math.round(transferProgress() * 100)}%` : '...'}
        </MediaBadge>
      ) : (
        <MediaBadge className="message-media-duration">
          {!isPaidPreview() && props.video.isGif ? 'GIF' : formatMediaDuration(Math.max(duration() - playProgress(), 0))}
          {isUnsupported && <Icon name="message-failed" className={styles.playbackFailed} />}
        </MediaBadge>
      )}
      {Boolean(props.lastPlaybackTimestamp) && (
        <div
          class="message-media-last-progress"
          style={`--_progress: ${Math.floor((props.lastPlaybackTimestamp / duration()) * 100)}%`}
        />
      )}
      <SensitiveContentConfirmModal
        isOpen={isNsfwModalOpen()}
        onClose={closeNsfwModal}
        shouldAlwaysShow={shouldAlwaysShowNsfw()}
        onAlwaysShowChanged={setShouldAlwaysShowNsfw}
        confirmHandler={handleNsfwConfirm}
      />
    </div>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
    const appConfig = global.appConfig;
    const needsAgeVerification = appConfig.needAgeVideoVerification;

    return {
      needsAgeVerification,
    };
  };

export default Video;
