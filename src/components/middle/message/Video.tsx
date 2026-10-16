import { createEffect, createMemo, createSignal, untrack } from 'frameact';
import { Show } from 'frameact/dom';
import { getActions, withGlobal } from '../../../global';

import type { ApiMediaExtendedPreview, ApiVideo } from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';

import { createMediaTransition, createShowTransition } from '../../../lib/kit';
import {
  getMediaDimensions,
  getMediaFormat,
  getMediaThumbUri,
  getMediaTransferState,
  getVideoMediaHash,
} from '../../../global/helpers';
import { areRecordsShallowEqual } from '../../../util/areShallowEqual';
import buildClassName from '../../../util/buildClassName';
import buildStyle from '../../../util/buildStyle';
import { formatMediaDuration } from '../../../util/dates/oldDateFormat';
import * as mediaLoader from '../../../util/mediaLoader';
import { clampMediaDimensions } from '../../common/helpers/placeholder';

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

// Deviation (untrusted): the duration is server data; the badge shows at most 99:59:59.
const MAX_SHOWN_DURATION_S = 99 * 3600 + 59 * 60 + 59;

// Deviation: `defaultMuted` (the `muted` attribute, which iOS needs for autoplay) is not in frameact's JSX types of `<video>`.
const DEFAULT_MUTED = { defaultmuted: true };

const Video = <T,>(ownProps: OwnProps<T>) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { cancelMediaDownload, updateContentSettings, openAgeVerificationModal } = getActions();
  let ref!: HTMLDivElement;
  // Deviation: the `<video>` is created conditionally (`isInline`), so its ref is a signal (`useUnsupportedMedia` and `duration` read it).
  const [videoEl, setVideoEl] = createSignal<HTMLVideoElement | undefined>(undefined);
  const [isNsfwModalOpen, openNsfwModal, closeNsfwModal] = useFlag();
  const [shouldAlwaysShowNsfw, setShouldAlwaysShowNsfw] = createSignal(false);

  // Deviation: the union is narrowed once, here (a memo cannot narrow like tt's `isPaidPreview` constant did).
  const regularVideo = createMemo(() => (props.video.mediaType === 'extendedMediaPreview' ? undefined : props.video));
  const isPaidPreview = createMemo(() => !regularVideo());
  // Deviation (untrusted): finite and bounded, so the frame, the spoiler canvas and the aspect ratio stay sane.
  const dimensions = createMemo(() => clampMediaDimensions(getMediaDimensions(props.video)));
  const width = () => dimensions().width;
  const height = () => dimensions().height;

  const localBlobUrl = createMemo(() => regularVideo()?.blobUrl);

  const shouldShowSpoiler = createMemo(() =>
    Boolean(isPaidPreview() || regularVideo()?.isSpoiler || props.isMediaNsfw),
  );
  const [isSpoilerShown, showSpoiler, hideSpoiler] = useFlag(shouldShowSpoiler());

  createEffect(
    () => shouldShowSpoiler(),
    (shouldShowSpoiler2) => {
      if (shouldShowSpoiler2) {
        showSpoiler();
      } else {
        hideSpoiler();
      }
    },
  );

  // Deviation: `MediaSpoiler` (a transition, a blur canvas, a language hook) is created only once the spoiler was shown, and
  // stays after that so that its reveal animation can run.
  let wasSpoilerShown = untrack(isSpoilerShown);
  const shouldMountSpoiler = createMemo(() => {
    if (isSpoilerShown()) {
      wasSpoilerShown = true;
    }
    return wasSpoilerShown;
  });

  const handleNsfwConfirm = () => {
    closeNsfwModal();
    hideSpoiler();

    if (shouldAlwaysShowNsfw()) {
      updateContentSettings({ isSensitiveEnabled: true });
    }
  };

  const isIntersectingForLoading = useIsIntersecting(
    () => ref,
    () => props.observeIntersectionForLoading,
  );
  const isIntersectingForPlayingRaw = useIsIntersecting(
    () => ref,
    () => props.observeIntersectionForPlaying,
  );
  const isIntersectingForPlaying = createMemo(() => isIntersectingForPlayingRaw() && isIntersectingForLoading());
  let wasIntersectedRef = untrack(isIntersectingForLoading);
  // Deviation: tt updated this ref on every render; here a memo keeps it sticky (it never goes back to false) for `isInline`.
  const wasIntersected = createMemo(() => {
    if (isIntersectingForPlaying() && !wasIntersectedRef) {
      wasIntersectedRef = true;
    }
    return wasIntersectedRef;
  });

  const [isLoadAllowed, setIsLoadAllowed] = createSignal(props.canAutoLoad);
  const shouldLoad = createMemo(() => Boolean(isLoadAllowed() && isIntersectingForLoading() && !isPaidPreview()));
  // Initial value only, as in tt (`useState`): a later change of `canAutoPlay` does not start a paused video.
  const [isPlayAllowed, setIsPlayAllowed] = createSignal(Boolean(props.canAutoPlay && !isSpoilerShown()));

  const fullMediaHash = createMemo(() => {
    const video = regularVideo();
    return video ? getVideoMediaHash(video, 'inline') : undefined;
  });
  // Deviation: initial value only, as in tt (`useState`): whether the media was in the memory cache when the message appeared.
  const initialFullMediaHash = fullMediaHash();
  const isFullMediaPreloaded = Boolean(initialFullMediaHash && mediaLoader.getFromMemory(initialFullMediaHash));
  const { mediaData, loadProgress } = useMediaWithLoadProgress(
    fullMediaHash,
    () => !shouldLoad(),
    () => {
      const video = regularVideo();
      return video ? getMediaFormat(video, 'inline') : undefined;
    },
  );
  const fullMediaData = createMemo(() => localBlobUrl() || mediaData());
  const [isPlayerReady, markPlayerReady] = useFlag();

  const thumbDataUri = createMemo(() => getMediaThumbUri(props.video));
  const hasThumb = createMemo(() => Boolean(thumbDataUri()));
  const withBlurredBackground = createMemo(() => (props.layout ?? 'intrinsic') !== 'fill');

  const isInline = createMemo(() => Boolean(fullMediaData() && wasIntersected()));

  const isUnsupported = useUnsupportedMedia(videoEl, true, () => !isInline());

  const previewMediaHash = createMemo(() => {
    const video = regularVideo();
    return video ? getVideoMediaHash(video, 'preview') : undefined;
  });
  // Deviation: initial value only, as in tt (`useState`).
  const initialPreviewMediaHash = previewMediaHash();
  const isPreviewPreloaded = Boolean(initialPreviewMediaHash && mediaLoader.getFromMemory(initialPreviewMediaHash));
  const canLoadPreview = isIntersectingForLoading;
  const previewBlobUrl = useMedia(previewMediaHash, () => !canLoadPreview());
  const { ref: previewRef } = createMediaTransition({
    hasMediaData: () => Boolean((hasThumb() || previewBlobUrl()) && !(isPlayerReady() && !isUnsupported())),
  });

  const noThumb = createMemo(() => Boolean(!hasThumb() || previewBlobUrl() || isPlayerReady()));
  const thumbRef = useBlurredMediaThumbRef(() => props.video, noThumb);
  // Deviation: tt passed the canvas ref object to `useMediaTransition({ ref })`; here the transition's `ref` is applied to the
  // canvas next to the blur hook's ref (see the canvas below).
  const { ref: thumbTransitionRef } = createMediaTransition({ hasMediaData: () => !noThumb() });
  const blurredBackgroundRef = useBlurredMediaThumbRef(
    () => props.video,
    () => !withBlurredBackground(),
  );

  const { loadProgress: downloadProgress } = useMediaWithLoadProgress(
    () => {
      const video = regularVideo();
      return video ? getVideoMediaHash(video, 'download') : undefined;
    },
    () => !props.isDownloading,
    () => {
      const video = regularVideo();
      return video ? getMediaFormat(video, 'download') : undefined;
    },
  );

  const transferState = createMemo(
    () =>
      getMediaTransferState(
        props.uploadProgress || (props.isDownloading ? downloadProgress() : loadProgress()),
        (shouldLoad() && !isPlayerReady() && !isFullMediaPreloaded) || props.isDownloading,
        props.uploadProgress !== undefined,
      ),
    { equals: areRecordsShallowEqual },
  );
  const isUploading = () => transferState().isUploading;
  const isTransferring = () => transferState().isTransferring;
  // Deviation (untrusted): the progress shown is finite and within [0, 1].
  const transferProgress = () => clampProgress(transferState().transferProgress);

  // Deviation: tt's `noMountTransition: usePreviousDeprecated(isLoadAllowed) === false` only counted at the first run of the
  // transition, where there is no previous value, so it was always false; it is omitted.
  const { ref: spinnerRef, shouldRender: shouldRenderSpinner } = createShowTransition({
    isOpen: () => isTransferring() && !isUnsupported(),
  });
  const { ref: playButtonRef, shouldRender: shouldRenderPlayButton } = createShowTransition({
    isOpen: () => Boolean((isLoadAllowed() || fullMediaData()) && !isPlayAllowed() && !shouldRenderSpinner()),
  });
  const { ref: transferProgressRef, shouldRender: shouldRenderTransferProgress } = createShowTransition({
    isOpen: () => isTransferring() && (!isUnsupported() || props.isDownloading),
  });

  const [playProgress, setPlayProgress] = createSignal<number>(0);
  const handleTimeUpdate = (e: Event) => {
    const { currentTime } = e.currentTarget as HTMLVideoElement;
    // Deviation (untrusted): the media element reports whatever its stream says.
    setPlayProgress(Number.isFinite(currentTime) ? Math.max(0, currentTime - 1) : 0);
  };

  // Deviation: tt read `videoRef.current?.duration` on every render; here the memo reads `playProgress`, so it is read again
  // on every time update (the metadata arrives before the first one).
  const duration = createMemo(() => {
    playProgress();
    const elementDuration = videoEl()?.duration;
    const value = (Number.isFinite(elementDuration) && !isUnsupported() ? elementDuration : props.video.duration) || 0;
    // Deviation (untrusted): finite, not negative and bounded.
    return Number.isFinite(value) ? Math.min(Math.max(value, 0), MAX_SHOWN_DURATION_S) : 0;
  });

  // Deviation (untrusted): tt divided by the duration as is; with 0 that is Infinity or NaN in the style.
  const lastPlaybackPercent = () => {
    const percent = duration() > 0 ? Math.floor(((props.lastPlaybackTimestamp || 0) / duration()) * 100) : 0;
    return Number.isFinite(percent) ? Math.min(Math.max(percent, 0), 100) : 0;
  };

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
      cancelMediaDownload({ media: regularVideo()! });
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

    if (isFromSpinner && shouldLoad() && !isPlayerReady() && !isFullMediaPreloaded) {
      setIsLoadAllowed(false);
      e.stopPropagation();
      return;
    }

    props.onClick?.(props.clickArg!, e);
  };

  const handleClickOnSpinner = (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
    handleClick(e, true);
  };

  const componentClassName = createMemo(() =>
    buildClassName(
      'media-inner dark',
      mediaStyles.frame,
      mediaStyles[props.layout ?? 'intrinsic'],
      !isUploading() && 'interactive',
      props.className,
    ),
  );

  const style = createMemo(() =>
    buildStyle(`--media-width: ${width()}px`, `--media-aspect-ratio: ${dimensions().aspectRatio}`),
  );

  return (
    <div
      ref={ref}
      id={props.id}
      class={componentClassName()}
      style={style()}
      // Deviation: a handler is bound once; tt did not attach one while uploading.
      onClick={(e) => {
        if (!isUploading()) handleClick(e);
      }}
    >
      <Show when={withBlurredBackground()}>
        <canvas ref={blurredBackgroundRef} class="thumbnail blurred-bg" />
      </Show>
      <Show when={isInline()}>
        <OptimizedVideo
          ref={(el) => setVideoEl(el)}
          src={fullMediaData()}
          class="full-media"
          canPlay={isPlayAllowed() && isIntersectingForPlaying() && !isUnsupported()}
          {...DEFAULT_MUTED}
          muted
          loop
          playsinline
          disablepictureinpicture
          draggable={props.isProtected ? 'false' : 'true'}
          onTimeUpdate={handleTimeUpdate}
          onReady={markPlayerReady}
        />
      </Show>
      <Show when={previewBlobUrl()}>
        <img
          ref={previewRef}
          src={previewBlobUrl()}
          class="thumbnail"
          alt=""
          draggable={props.isProtected ? 'false' : 'true'}
        />
      </Show>
      <Show when={hasThumb() && !isPreviewPreloaded}>
        <canvas
          ref={(el) => {
            thumbRef(el);
            thumbTransitionRef(el);
          }}
          class="thumbnail"
        />
      </Show>
      <Show when={props.isProtected}>
        <span class="protector" />
      </Show>
      {/* Deviation: tt always rendered the play button (closed it is `display: none`); here it exists while shown or closing. */}
      <Show when={shouldRenderPlayButton()}>
        <Icon
          ref={playButtonRef}
          name="play"
          className={buildClassName(mediaStyles.controlButton, mediaStyles.playButton)}
        />
      </Show>
      <Show when={shouldMountSpoiler()}>
        <MediaSpoiler
          isVisible={isSpoilerShown()}
          withAnimation={props.noSpoilerReveal ? undefined : true}
          thumbDataUri={thumbDataUri()}
          isNsfw={props.isMediaNsfw}
          width={width()}
          height={height()}
          className="media-spoiler"
        />
      </Show>
      <Show when={shouldRenderSpinner()}>
        <div ref={spinnerRef} class={buildClassName('media-loading', mediaStyles.loading)}>
          <ProgressSpinner progress={transferProgress()} onClick={handleClickOnSpinner} />
        </div>
      </Show>
      <Show when={!isLoadAllowed() && !fullMediaData()}>
        <Icon name="download" className={buildClassName(mediaStyles.controlButton, mediaStyles.downloadButton)} />
      </Show>
      <Show
        when={shouldRenderTransferProgress()}
        fallback={
          <MediaBadge className="message-media-duration">
            {!isPaidPreview() && regularVideo()?.isGif
              ? 'GIF'
              : formatMediaDuration(Math.max(duration() - playProgress(), 0))}
            <Show when={isUnsupported()}>
              <Icon name="message-failed" className={styles.playbackFailed} />
            </Show>
          </MediaBadge>
        }
      >
        <MediaBadge ref={transferProgressRef} className="message-transfer-progress">
          {isUploading() || props.isDownloading ? `${Math.round(transferProgress() * 100)}%` : '...'}
        </MediaBadge>
      </Show>
      <Show when={props.lastPlaybackTimestamp}>
        <div class="message-media-last-progress" style={`--_progress: ${lastPlaybackPercent()}%`} />
      </Show>
      <Show when={props.isMediaNsfw}>
        <SensitiveContentConfirmModal
          isOpen={isNsfwModalOpen()}
          onClose={closeNsfwModal}
          shouldAlwaysShow={shouldAlwaysShowNsfw()}
          onAlwaysShowChanged={(value) => setShouldAlwaysShowNsfw(value)}
          confirmHandler={handleNsfwConfirm}
        />
      </Show>
    </div>
  );
};

function clampProgress(value: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  const appConfig = global.appConfig;
  const needsAgeVerification = appConfig.needAgeVideoVerification;

  return {
    needsAgeVerification,
  };
};

export default Video;
