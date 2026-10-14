import { createEffect, getIsHeavyAnimating, requestMeasure, watchHeavyAnimation } from 'frameact';

import usePriorityPlaybackCheck, { isPriorityPlaybackActive } from '../../../../hooks/usePriorityPlaybackCheck';
import useBackgroundMode, { isBackgroundModeActive } from '../../../../hooks/window/useBackgroundMode';

// TODO(codemod): useVideoAutoPause: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useVideoAutoPause(
  playerRef: (el: HTMLVideoElement) => void,
  canPlay: boolean,
  isPriority?: boolean,
) {
  let canPlayRef;
  canPlayRef = canPlay;

  const { play, pause } = usePlayPause(playerRef);

  const unfreezePlaying = () => {
    if (canPlayRef && (isPriority || !isFrozen())) {
      play();
    }
  };

  const unfreezePlayingOnRaf = () => {
    requestMeasure(unfreezePlaying);
  };

  useBackgroundMode(pause, unfreezePlayingOnRaf, !canPlay || isPriority);
  // TODO(codemod): useHeavyAnimation(…, isDisabled): watchHeavyAnimation has no disable flag; guard inside the callbacks
  watchHeavyAnimation(pause, unfreezePlaying);
  usePriorityPlaybackCheck(pause, unfreezePlaying, !canPlay || isPriority);

  const handlePlaying = () => {
    if (!canPlayRef || (!isPriority && isFrozen())) {
      pause();
    }
  };

  createEffect(
    () => [canPlay, play, pause, isPriority],
    () => {
      if (canPlay) {
        if (isPriority || !isFrozen()) {
          play();
        }
      } else {
        pause();
      }
    },
  );

  return { handlePlaying };
}

// TODO(codemod): usePlayPause: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
function usePlayPause(mediaRef: (el: HTMLMediaElement) => void) {
  let shouldPauseRef = false;
  let isLoadingPlayRef = false;

  const play = () => {
    shouldPauseRef = false;
    if (mediaRef.current && !isLoadingPlayRef && document.body.contains(mediaRef.current)) {
      isLoadingPlayRef = true;
      mediaRef.current
        .play()
        .then(() => {
          isLoadingPlayRef = false;
          if (shouldPauseRef) {
            mediaRef.current?.pause();
            shouldPauseRef = false;
          }
        })
        .catch((e) => {
          // eslint-disable-next-line no-console
          console.warn(e);
        });
    }
  };

  const pause = () => {
    if (isLoadingPlayRef) {
      shouldPauseRef = true;
    } else {
      mediaRef.current?.pause();
    }
  };

  return { play, pause };
}

function isFrozen() {
  return getIsHeavyAnimating() || isPriorityPlaybackActive() || isBackgroundModeActive();
}
