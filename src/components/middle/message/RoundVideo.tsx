import { createEffect, createMemo, createMutationEffect, createSignal, previous } from 'frameact';
import { getActions } from '../../../global';
import { createMediaTransition, createShowTransition } from '../../../lib/kit';
import { depsOf } from '../../../util/effectDeps';

import type { ApiMessage } from '../../../api/types';
import { ApiMediaFormat } from '../../../api/types';

import { getMediaFormat, getVideoMediaHash, hasMessageTtl } from '../../../global/helpers';
import { stopCurrentAudio } from '../../../util/audioPlayback/playbackController';
import buildClassName from '../../../util/buildClassName';
import { formatMediaDuration } from '../../../util/dates/oldDateFormat';
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

let stopPrevious: NoneToVoidFunction;

const RoundVideo = (props: OwnProps) => {
  let ref!: HTMLDivElement;
  let playerRef!: HTMLVideoElement;
  let circleRef!: SVGCircleElement;

  const { cancelMediaDownload, openOneTimeMediaModal, transcribeAudio } = getActions();

  const isIntersecting = useIsIntersecting(() => ref, () => props.observeIntersection);

  const video = createMemo(() => props.message.content.video!);
  const isMediaUnread = createMemo(() => props.message.isMediaUnread);

  const [isLoadAllowed, setIsLoadAllowed] = createSignal(props.canAutoLoad);
  const shouldLoad = createMemo(() => Boolean(isLoadAllowed() && isIntersecting));
  const mediaWithLoadProgressResult = createMemo(() => useMediaWithLoadProgress(
    () => getVideoMediaHash(video(), 'inline'),
    !shouldLoad(),
    () => getMediaFormat(video(), 'inline'),
  ));
  const mediaData = () => mediaWithLoadProgressResult().mediaData;
  const loadProgress = () => mediaWithLoadProgressResult().loadProgress;
  const fullMediaData = createMemo(() => video().blobUrl || mediaData());

  const mediaWithLoadProgressResult2 = createMemo(() => useMediaWithLoadProgress(
    () => getVideoMediaHash(video(), 'download'),
    () => !props.isDownloading,
    ApiMediaFormat.BlobUrl,
  ));
  const downloadProgress = () => mediaWithLoadProgressResult2().loadProgress;

  const [isPlayerReady, markPlayerReady] = useFlag();
  const hasTtl = createMemo(() => hasMessageTtl(props.message));
  const isInOneTimeModal = createMemo(() => props.origin === 'oneTimeModal');
  const shouldRenderSpoiler = createMemo(() => hasTtl() && !isInOneTimeModal());
  const thumbDataUri = useThumbnail(() => props.message);
  const hasThumb = Boolean(thumbDataUri);
  const noThumb = createMemo(() => !hasThumb || isPlayerReady() || shouldRenderSpoiler());
  const thumbRef = useBlurredMediaThumbRef(() => video(), () => noThumb());
  // TODO(codemod): ref option: hand the result `ref` to the element (ref={t.ref}) instead
  createMediaTransition({ hasMediaData: () => !noThumb(), ref: thumbRef });

  const isTransferring = createMemo(() => (isLoadAllowed() && !isPlayerReady()) || props.isDownloading);
  const wasLoadDisabled = createMemo(() => previous(() => isLoadAllowed()) === false);

  const { ref: spinnerRef, shouldRender: shouldRenderSpinner } = createShowTransition({
    isOpen: () => isTransferring(),
    noMountTransition: wasLoadDisabled(),
  });

  const [isActivated, setIsActivated] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);

  const [getProgress, setProgress] = createSignal(0);
  const getThrottledProgress = useThrottledSignal(() => getProgress(), PROGRESS_THROTTLE);

  createEffect(depsOf(() => [setProgress, isActivated(), getThrottledProgress] as const), ([, isActivated2]) => {
    if (!isActivated2) {
      return;
    }

    const playerEl = playerRef!;
    setProgress(playerEl.currentTime / playerEl.duration);
  });

  createMutationEffect(depsOf(() => [isActivated(), getThrottledProgress] as const), ([isActivated2]) => {
    if (!isActivated2 || !circleRef) {
      return;
    }

    const strokeDashOffset = PROGRESS_CIRCUMFERENCE - getThrottledProgress() * PROGRESS_CIRCUMFERENCE;
    circleRef.setAttribute('stroke-dashoffset', strokeDashOffset.toString());
  });

  const shouldPlay = createMemo(() => Boolean(fullMediaData() && isIntersecting));

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

  const togglePlaying = () => {
    const playerEl = playerRef!;
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

  createEffect(() => isInOneTimeModal(), (isInOneTimeModal2) => {
    if (!isInOneTimeModal2) {
      return;
    }
    togglePlaying();
  });

  const handleClick = (event) => {
    if (event.target.closest('.transcribe-button')) {
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

  createEffect(depsOf(() => [isActivated(), isMediaUnread(), props.onReadMedia] as const), ([isActivated2, isMediaUnread2, onReadMedia2]) => {
    if (onReadMedia2 && isMediaUnread2 && isActivated2) {
      onReadMedia2();
    }
  });

  const handleTimeUpdate = (e: React.UIEvent<HTMLVideoElement>) => {
    const playerEl = e.currentTarget;
    setProgress(playerEl.currentTime / playerEl.duration);
    setCurrentTime(Math.floor(playerEl.currentTime));
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

  return (
    <div
      ref={ref}
      class={buildClassName('RoundVideo', 'media-inner', isInOneTimeModal() && 'non-interactive', props.className)}
      onClick={handleClick}
    >
      {fullMediaData() && (
        <div class="video-wrapper">
          {shouldRenderSpoiler() && (
            <MediaSpoiler
              isVisible
              thumbDataUri={thumbDataUri}
              width={ROUND_VIDEO_DIMENSIONS_PX}
              height={ROUND_VIDEO_DIMENSIONS_PX}
              className="media-spoiler"
            />
          )}
          <OptimizedVideo
            canPlay={shouldPlay()}
            ref={playerRef}
            src={fullMediaData()}
            className="full-media"
            width={ROUND_VIDEO_DIMENSIONS_PX}
            height={ROUND_VIDEO_DIMENSIONS_PX}
            autoPlay={!shouldRenderSpoiler()}
            disablePictureInPicture
            muted={!isActivated()}
            defaultMuted
            loop={!isActivated()}
            playsInline
            isPriority
            onEnded={isActivated() ? (props.onStop ?? stopPlaying) : undefined}
            onTimeUpdate={isActivated() ? handleTimeUpdate : undefined}
            onReady={markPlayerReady}
          />
        </div>
      )}
      {!shouldRenderSpoiler() && (
        <canvas
          ref={thumbRef}
          class="thumbnail"
          style={`width: ${ROUND_VIDEO_DIMENSIONS_PX}px; height: ${ROUND_VIDEO_DIMENSIONS_PX}px`}
        />
      )}
      <div class="progress">
        {isActivated() && (
          <svg width={ROUND_VIDEO_DIMENSIONS_PX} height={ROUND_VIDEO_DIMENSIONS_PX}>
            <circle
              ref={circleRef}
              cx={PROGRESS_CENTER}
              cy={PROGRESS_CENTER}
              r={PROGRESS_CENTER - PROGRESS_MARGIN}
              class="progress-circle"
              transform={`rotate(-90, ${PROGRESS_CENTER}, ${PROGRESS_CENTER})`}
              stroke-dasharray={PROGRESS_CIRCUMFERENCE}
              stroke-dashoffset={PROGRESS_CIRCUMFERENCE}
            />
          </svg>
        )}
      </div>
      {shouldRenderSpinner() && (
        <div ref={spinnerRef} class={buildClassName('media-loading', styles.loading)}>
          <ProgressSpinner progress={props.isDownloading ? downloadProgress() : loadProgress()} />
        </div>
      )}
      {shouldRenderSpoiler() && !shouldRenderSpinner() && renderPlayWrapper()}
      {!fullMediaData() && !isLoadAllowed() && (
        <Icon name="download" className={buildClassName(styles.controlButton, styles.downloadButton)} />
      )}
      {!isInOneTimeModal() && (
        <MediaBadge className={buildClassName('message-media-duration', isMediaUnread() && 'unread')}>
          {isActivated() ? formatMediaDuration(currentTime()) : formatMediaDuration(video().duration)}
          {(!isActivated() || playerRef!.paused) && <Icon name="muted" className="muted-icon" />}
        </MediaBadge>
      )}
      {props.canTranscribe && (
        <Button onClick={handleButtonClick} className="transcribe-button">
          {props.isTranscribed || props.isTranscriptionError ? <Icon name="down" /> : <Icon name="transcribe" />}
          {props.isTranscribing && (
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
          )}
        </Button>
      )}
    </div>
  );
};

export default RoundVideo;
