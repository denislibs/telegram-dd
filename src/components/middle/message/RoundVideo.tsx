import { createEffect, createMemo, createSignal, onDestroy } from 'frameact';
import { Show } from 'frameact/dom';
import { getActions } from '../../../global';

import type { ApiMessage } from '../../../api/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';
import { ApiMediaFormat } from '../../../api/types';

import { createMediaTransition, createShowTransition } from '../../../lib/kit';
import { getMediaFormat, getVideoMediaHash, hasMessageTtl } from '../../../global/helpers';
import { stopCurrentAudio } from '../../../util/audioPlayback/playbackController';
import buildClassName from '../../../util/buildClassName';
import { formatMediaDuration } from '../../../util/dates/oldDateFormat';
import { depsOf } from '../../../util/effectDeps';
import safePlay from '../../../util/safePlay';
import { ROUND_VIDEO_DIMENSIONS_PX } from '../../common/helpers/mediaDimensions';

import useThumbnail from '../../../hooks/media/useThumbnail';
import { useThrottledSignal } from '../../../hooks/useAsyncResolvers';
import useFlag from '../../../hooks/useFlag';
import { useIsIntersecting } from '../../../hooks/useIntersectionObserver';
import useMediaWithLoadProgress from '../../../hooks/useMediaWithLoadProgress';
import useBlurredMediaThumbRef from './hooks/useBlurredMediaThumbRef';

import Icon from '../../common/icons/Icon';
import MediaSpoiler from '../../common/MediaSpoiler';
import Button from '../../ui/Button';
import OptimizedVideo from '../../ui/OptimizedVideo';
import ProgressSpinner from '../../ui/ProgressSpinner';
import MediaBadge from './MediaBadge';

import './RoundVideo.scss';
import styles from './media.module.scss';

type OwnProps = {
  message: ApiMessage;
  className?: string;
  canAutoLoad?: boolean;
  isDownloading?: boolean;
  origin?: 'oneTimeModal';
  observeIntersection?: ObserveFn;
  onStop?: NoneToVoidFunction;
  onReadMedia?: NoneToVoidFunction;
  onHideTranscription?: (isHidden: boolean) => void;
  isTranscriptionError?: boolean;
  canTranscribe?: boolean;
  isTranscribed?: boolean;
  isTranscriptionHidden?: boolean;
  isTranscribing?: boolean;
};

const PROGRESS_CENTER = ROUND_VIDEO_DIMENSIONS_PX / 2;
const PROGRESS_MARGIN = 6;
const PROGRESS_CIRCUMFERENCE = (PROGRESS_CENTER - PROGRESS_MARGIN) * 2 * Math.PI;
const PROGRESS_THROTTLE = 16; // Min period needed for `playerEl.currentTime` to update
// Deviation (untrusted): the duration is server data; the badge shows at most 99:59:59.
const MAX_SHOWN_DURATION_S = 99 * 3600 + 59 * 60 + 59;
// Deviation: `defaultMuted` (the `muted` attribute, which iOS needs for autoplay) is not in frameact's JSX types of `<video>`.
const DEFAULT_MUTED = { defaultmuted: true };

let stopPrevious: NoneToVoidFunction | undefined;

const RoundVideo = (props: OwnProps) => {
  let ref!: HTMLDivElement;
  // Deviation: the `<video>` exists only with the media; the ref is cleared when the component is destroyed (as tt's was).
  let playerRef: HTMLVideoElement | undefined;

  const { cancelMediaDownload, openOneTimeMediaModal, transcribeAudio } = getActions();

  const isIntersecting = useIsIntersecting(
    () => ref,
    () => props.observeIntersection,
  );

  const video = createMemo(() => props.message.content.video!);
  const isMediaUnread = createMemo(() => props.message.isMediaUnread);

  const [isLoadAllowed, setIsLoadAllowed] = createSignal(props.canAutoLoad);
  const shouldLoad = createMemo(() => Boolean(isLoadAllowed() && isIntersecting()));
  const { mediaData, loadProgress } = useMediaWithLoadProgress(
    () => getVideoMediaHash(video(), 'inline'),
    () => !shouldLoad(),
    () => getMediaFormat(video(), 'inline'),
  );
  const fullMediaData = createMemo(() => video().blobUrl || mediaData());

  const { loadProgress: downloadProgress } = useMediaWithLoadProgress(
    () => getVideoMediaHash(video(), 'download'),
    () => !props.isDownloading,
    ApiMediaFormat.BlobUrl,
  );

  const [isPlayerReady, markPlayerReady] = useFlag();
  const hasTtl = createMemo(() => hasMessageTtl(props.message));
  const isInOneTimeModal = createMemo(() => props.origin === 'oneTimeModal');
  const shouldRenderSpoiler = createMemo(() => hasTtl() && !isInOneTimeModal());
  const thumbDataUri = useThumbnail(() => props.message);
  const hasThumb = createMemo(() => Boolean(thumbDataUri()));
  const noThumb = createMemo(() => !hasThumb() || isPlayerReady() || shouldRenderSpoiler());
  const thumbRef = useBlurredMediaThumbRef(video, noThumb);
  // Deviation: tt passed the canvas ref object to `useMediaTransition({ ref })`; here the transition's `ref` is applied to the
  // canvas next to the blur hook's ref (see the canvas below).
  const { ref: thumbTransitionRef } = createMediaTransition({ hasMediaData: () => !noThumb() });

  const isTransferring = createMemo(() => Boolean((isLoadAllowed() && !isPlayerReady()) || props.isDownloading));

  // Deviation: tt's `noMountTransition: usePreviousDeprecated(isLoadAllowed) === false` only counted at the first run of the
  // transition, where there is no previous value, so it was always false; it is omitted.
  const { ref: spinnerRef, shouldRender: shouldRenderSpinner } = createShowTransition({
    isOpen: isTransferring,
  });

  const [isActivated, setIsActivated] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);

  const [getProgress, setProgress] = createSignal(0);
  const getThrottledProgress = useThrottledSignal(getProgress, PROGRESS_THROTTLE);

  // Deviation: teact re-ran this effect on every change of the throttled progress signal (its dependency), which keeps the
  // ring in step with `currentTime` between the `timeupdate` events; the compute reads that value here.
  createEffect(
    depsOf(() => [isActivated(), getThrottledProgress()] as const),
    ([isActivated2]) => {
      if (!isActivated2 || !playerRef) {
        return;
      }

      setProgress(getPlaybackRatio(playerRef));
    },
  );

  // Deviation: tt wrote `stroke-dashoffset` in a layout effect through a ref; the circle exists only while activated, so
  // here it is a reactive attribute of the circle. The ratio is finite and within [0, 1] (untrusted media duration).
  const strokeDashOffset = () => PROGRESS_CIRCUMFERENCE - clampRatio(getThrottledProgress()) * PROGRESS_CIRCUMFERENCE;

  const shouldPlay = createMemo(() => Boolean(fullMediaData() && isIntersecting()));

  const stopPlaying = () => {
    if (!playerRef) {
      return;
    }

    setIsActivated(false);
    setProgress(0);
    safePlay(playerRef);
  };

  const capturePlaying = () => {
    stopPrevious?.();
    stopPrevious = stopPlaying;
  };

  // Deviation: `stopPrevious` is a module singleton; a destroyed component must neither be asked to play again nor kept alive by it.
  onDestroy(() => {
    playerRef = undefined;
    if (stopPrevious === stopPlaying) {
      stopPrevious = undefined;
    }
  });

  const togglePlaying = () => {
    const playerEl = playerRef;
    // Deviation: tt asserted the player; the one-time modal effect can run before the media is there.
    if (!playerEl) return;

    if (isActivated()) {
      if (playerEl.paused) {
        safePlay(playerEl);
        stopCurrentAudio();
      } else {
        playerEl.pause();
      }
    } else {
      capturePlaying();
      // Pause is a workaround for iOS Safari – otherwise it stops video after several frames
      playerEl.pause();
      playerEl.currentTime = 0;
      safePlay(playerEl);
      stopCurrentAudio();
      setIsActivated(true);
    }
  };

  createEffect(
    () => isInOneTimeModal(),
    (isInOneTimeModal2) => {
      if (!isInOneTimeModal2) {
        return;
      }
      togglePlaying();
    },
  );

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('.transcribe-button')) {
      return;
    }

    if (!fullMediaData()) {
      setIsLoadAllowed((isAllowed) => !isAllowed);

      return;
    }

    if (props.isDownloading) {
      cancelMediaDownload({ media: video() });
      return;
    }

    if (hasTtl() && !isInOneTimeModal()) {
      openOneTimeMediaModal({ message: props.message });
      props.onReadMedia?.();
      return;
    }

    togglePlaying();
  };

  createEffect(
    depsOf(() => [isActivated(), isMediaUnread(), props.onReadMedia] as const),
    ([isActivated2, isMediaUnread2, onReadMedia2]) => {
      if (onReadMedia2 && isMediaUnread2 && isActivated2) {
        onReadMedia2();
      }
    },
  );

  // Deviation: handlers of the spread attributes of `OptimizedVideo` are stable functions that check `isActivated` (tt passed
  // `undefined` while the video was not activated).
  const handleTimeUpdate = (e: Event) => {
    if (!isActivated()) return;

    const playerEl = e.currentTarget as HTMLVideoElement;
    setProgress(getPlaybackRatio(playerEl));
    // Deviation (untrusted): the media element reports whatever its stream says.
    setCurrentTime(Number.isFinite(playerEl.currentTime) ? Math.floor(playerEl.currentTime) : 0);
  };

  const handleEnded = () => {
    if (!isActivated()) return;

    (props.onStop ?? stopPlaying)();
  };

  const handleTranscribe = () => {
    transcribeAudio({ chatId: props.message.chatId, messageId: props.message.id });
  };

  function renderPlayWrapper() {
    return (
      <div class="play-wrapper">
        <Button
          color="dark"
          round
          size="smaller"
          className="play"
          nonInteractive
          iconName="play"
          iconClassName="play-icon"
        />
        <Icon name="view-once" className="view-once-icon" />
      </div>
    );
  }

  const handleButtonClick = () => {
    if ((props.isTranscribed || props.isTranscriptionError) && props.onHideTranscription) {
      props.onHideTranscription(!props.isTranscriptionHidden);
    } else if (!props.isTranscribing) {
      handleTranscribe();
    }
  };

  // Deviation (untrusted): finite, not negative and bounded.
  const shownDuration = () => {
    if (isActivated()) return currentTime();

    const duration = video().duration;
    return Number.isFinite(duration) ? Math.min(Math.max(duration, 0), MAX_SHOWN_DURATION_S) : 0;
  };

  // Deviation: tt read `playerRef.current.paused` on every render; here a time update (`currentTime`) is what re-reads it.
  const shouldShowMutedIcon = () => {
    currentTime();
    return !isActivated() || Boolean(playerRef?.paused);
  };

  return (
    <div
      ref={ref}
      class={buildClassName('RoundVideo', 'media-inner', isInOneTimeModal() && 'non-interactive', props.className)}
      onClick={handleClick}
    >
      <Show when={fullMediaData()}>
        <div class="video-wrapper">
          <Show when={shouldRenderSpoiler()}>
            <MediaSpoiler
              isVisible
              thumbDataUri={thumbDataUri()}
              width={ROUND_VIDEO_DIMENSIONS_PX}
              height={ROUND_VIDEO_DIMENSIONS_PX}
              className="media-spoiler"
            />
          </Show>
          <OptimizedVideo
            canPlay={shouldPlay()}
            ref={(el) => {
              playerRef = el;
            }}
            src={fullMediaData()}
            class="full-media"
            width={ROUND_VIDEO_DIMENSIONS_PX}
            height={ROUND_VIDEO_DIMENSIONS_PX}
            autoplay={!shouldRenderSpoiler()}
            disablepictureinpicture
            muted={!isActivated()}
            {...DEFAULT_MUTED}
            loop={!isActivated()}
            playsinline
            isPriority
            onEnded={handleEnded}
            onTimeUpdate={handleTimeUpdate}
            onReady={markPlayerReady}
          />
        </div>
      </Show>
      <Show when={!shouldRenderSpoiler()}>
        <canvas
          ref={(el) => {
            thumbRef(el);
            thumbTransitionRef(el);
          }}
          class="thumbnail"
          style={`width: ${ROUND_VIDEO_DIMENSIONS_PX}px; height: ${ROUND_VIDEO_DIMENSIONS_PX}px`}
        />
      </Show>
      <div class="progress">
        <Show when={isActivated()}>
          <svg width={ROUND_VIDEO_DIMENSIONS_PX} height={ROUND_VIDEO_DIMENSIONS_PX}>
            <circle
              cx={PROGRESS_CENTER}
              cy={PROGRESS_CENTER}
              r={PROGRESS_CENTER - PROGRESS_MARGIN}
              class="progress-circle"
              transform={`rotate(-90, ${PROGRESS_CENTER}, ${PROGRESS_CENTER})`}
              stroke-dasharray={String(PROGRESS_CIRCUMFERENCE)}
              stroke-dashoffset={String(strokeDashOffset())}
            />
          </svg>
        </Show>
      </div>
      <Show when={shouldRenderSpinner()}>
        <div ref={spinnerRef} class={buildClassName('media-loading', styles.loading)}>
          <ProgressSpinner progress={clampRatio(props.isDownloading ? downloadProgress() : loadProgress())} />
        </div>
      </Show>
      <Show when={shouldRenderSpoiler() && !shouldRenderSpinner()}>{renderPlayWrapper()}</Show>
      <Show when={!fullMediaData() && !isLoadAllowed()}>
        <Icon name="download" className={buildClassName(styles.controlButton, styles.downloadButton)} />
      </Show>
      <Show when={!isInOneTimeModal()}>
        <MediaBadge className={buildClassName('message-media-duration', isMediaUnread() && 'unread')}>
          {formatMediaDuration(shownDuration())}
          <Show when={shouldShowMutedIcon()}>
            <Icon name="muted" className="muted-icon" />
          </Show>
        </MediaBadge>
      </Show>
      <Show when={props.canTranscribe}>
        <Button onClick={handleButtonClick} className="transcribe-button">
          {props.isTranscribed || props.isTranscriptionError ? <Icon name="down" /> : <Icon name="transcribe" />}
          <Show when={props.isTranscribing}>
            <svg viewBox="0 0 32 24" class="loading-svg">
              <rect
                class="loading-rect"
                fill="transparent"
                width="32"
                height="24"
                stroke-width="3"
                stroke-linejoin="round"
                rx="6"
                ry="6"
                stroke="white"
                stroke-dashoffset="1"
                stroke-dasharray="32,68"
              />
            </svg>
          </Show>
        </Button>
      </Show>
    </div>
  );
};

// Deviation (untrusted): `currentTime / duration` is NaN or Infinity for a stream without a duration.
function getPlaybackRatio(playerEl: HTMLVideoElement) {
  return clampRatio(playerEl.currentTime / playerEl.duration);
}

function clampRatio(value: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

export default RoundVideo;
