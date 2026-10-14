import { createEffect, getIsHeavyAnimating, requestMeasure, watchHeavyAnimation } from 'frameact';

import { type MaybeAccessor, read } from '../../../../util/accessors';

import usePriorityPlaybackCheck, { isPriorityPlaybackActive } from '../../../../hooks/usePriorityPlaybackCheck';
import useBackgroundMode, { isBackgroundModeActive } from '../../../../hooks/window/useBackgroundMode';

export default function useVideoAutoPause(
  playerRef: MaybeAccessor<HTMLVideoElement | undefined>,
  canPlay: MaybeAccessor<boolean>,
  isPriority?: MaybeAccessor<boolean | undefined>,
) {
  const { play, pause } = usePlayPause(playerRef);

  const unfreezePlaying = () => {
    if (read(canPlay) && (read(isPriority) || !isFrozen())) {
      play();
    }
  };

  const unfreezePlayingOnRaf = () => {
    requestMeasure(unfreezePlaying);
  };

  const isDisabled = () => !read(canPlay) || read(isPriority);

  useBackgroundMode(pause, unfreezePlayingOnRaf, isDisabled);
  // Deviation: `watchHeavyAnimation` has no disable flag (tt's `useHeavyAnimation(…, isDisabled)`), so the callbacks check it.
  watchHeavyAnimation(
    () => {
      if (!isDisabled()) pause();
    },
    () => {
      if (!isDisabled()) unfreezePlaying();
    },
  );
  usePriorityPlaybackCheck(pause, unfreezePlaying, isDisabled);

  const handlePlaying = () => {
    if (!read(canPlay) || (!read(isPriority) && isFrozen())) {
      pause();
    }
  };

  createEffect(
    () => [read(canPlay), read(isPriority)] as const,
    ([canPlay2, isPriority2]) => {
      if (canPlay2) {
        if (isPriority2 || !isFrozen()) {
          play();
        }
      } else {
        pause();
      }
    },
  );

  return { handlePlaying };
}

function usePlayPause(mediaRef: MaybeAccessor<HTMLMediaElement | undefined>) {
  let shouldPauseRef = false;
  let isLoadingPlayRef = false;

  const play = () => {
    shouldPauseRef = false;
    const media = read(mediaRef);
    if (media && !isLoadingPlayRef && document.body.contains(media)) {
      isLoadingPlayRef = true;
      media
        .play()
        .then(() => {
          isLoadingPlayRef = false;
          if (shouldPauseRef) {
            read(mediaRef)?.pause();
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
      read(mediaRef)?.pause();
    }
  };

  return { play, pause };
}

function isFrozen() {
  return getIsHeavyAnimating() || isPriorityPlaybackActive() || isBackgroundModeActive();
}
