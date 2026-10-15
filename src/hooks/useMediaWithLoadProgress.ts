import { createEffect, createMemo, createSignal, untrack } from 'frameact';

import { ApiMediaFormat } from '../api/types';

import { selectIsSynced } from '../global/selectors';
import { type MaybeAccessor, read } from '../util/accessors';
import { IS_PROGRESSIVE_SUPPORTED } from '../util/browser/windowEnvironment';
import { depsOf } from '../util/effectDeps';
import * as mediaLoader from '../util/mediaLoader';
import useSelector from './data/useSelector';
import useThrottledCallback from './useThrottledCallback';
import useUniqueId from './useUniqueId';

const STREAMING_PROGRESS = 0.75;
const STREAMING_TIMEOUT = 1500;
const PROGRESS_THROTTLE = 500;

// Deviation: the parameters are `MaybeAccessor`s and the hook returns accessors. `useForceUpdate` is a version signal that the
// `mediaData` memo reads, so the loader's memory cache is read again once the fetch resolved (as in `useMedia`).
export default function useMediaWithLoadProgress(
  mediaHash: MaybeAccessor<string | undefined>,
  noLoad: MaybeAccessor<boolean> = false,
  mediaFormat: MaybeAccessor<ApiMediaFormat | undefined> = ApiMediaFormat.BlobUrl,
  delay?: MaybeAccessor<number | false | undefined>,
  isHtmlAllowed: MaybeAccessor<boolean> = false,
) {
  const format = () => read(mediaFormat) ?? ApiMediaFormat.BlobUrl;
  const isStreaming = () => IS_PROGRESSIVE_SUPPORTED && format() === ApiMediaFormat.Progressive;

  const [version, setVersion] = createSignal(0);
  const forceUpdate = () => setVersion((current) => current + 1);

  const mediaData = createMemo(() => {
    version();

    const hash = read(mediaHash);
    if (!hash) return undefined;

    return isStreaming() && !read(noLoad) ? mediaLoader.getProgressiveUrl(hash) : mediaLoader.getFromMemory(hash);
  });

  const isSynced = useSelector(selectIsSynced);
  const id = useUniqueId();
  const [loadProgress, setLoadProgress] = createSignal(untrack(mediaData) && !untrack(isStreaming) ? 1 : 0);
  let startedAtRef: number | undefined;

  const handleProgress = useThrottledCallback(
    (progress: number) => {
      const delay2 = read(delay);
      if (startedAtRef && id && (!delay2 || Date.now() - startedAtRef > delay2)) {
        setLoadProgress(progress);
      }
    },
    [],
    PROGRESS_THROTTLE,
    true,
  );

  createEffect(
    depsOf(
      () =>
        [
          read(noLoad),
          read(mediaHash),
          mediaData(),
          format(),
          isStreaming(),
          read(delay),
          read(isHtmlAllowed),
          isSynced(),
        ] as const,
    ),
    ([noLoad2, mediaHash2, mediaData2, mediaFormat2, isStreaming2, delay2, isHtmlAllowed2]) => {
      if (!noLoad2 && mediaHash2) {
        if (!mediaData2) {
          setLoadProgress(0);

          if (startedAtRef) {
            mediaLoader.cancelProgress(handleProgress);
          }

          startedAtRef = Date.now();

          mediaLoader.fetch(mediaHash2, mediaFormat2, isHtmlAllowed2, handleProgress, id).then(() => {
            const spentTime = Date.now() - startedAtRef!;
            startedAtRef = undefined;

            if (!delay2 || spentTime >= delay2) {
              forceUpdate();
            } else {
              setTimeout(forceUpdate, delay2 - spentTime);
            }
          });
        } else if (isStreaming2) {
          setTimeout(() => {
            setLoadProgress(STREAMING_PROGRESS);
          }, STREAMING_TIMEOUT);
        }
      }
    },
  );

  createEffect(
    () => read(noLoad),
    (noLoad2) => {
      if (noLoad2 && startedAtRef) {
        mediaLoader.cancelProgress(handleProgress);
        setLoadProgress(0);
        startedAtRef = undefined;
      }
    },
  );

  createEffect(
    () => read(mediaHash),
    (mediaHash2) => {
      return () => {
        if (mediaHash2) {
          mediaLoader.removeCallback(mediaHash2, id);
        }
      };
    },
  );

  return { mediaData, loadProgress };
}
