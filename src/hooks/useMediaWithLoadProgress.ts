import { createEffect, createSignal } from 'frameact';
import { depsOf } from '../util/effectDeps';

import { ApiMediaFormat } from '../api/types';

import { selectIsSynced } from '../global/selectors';
import { IS_PROGRESSIVE_SUPPORTED } from '../util/browser/windowEnvironment';
import * as mediaLoader from '../util/mediaLoader';
import useSelector from './data/useSelector';
import useForceUpdate from './useForceUpdate';
import useThrottledCallback from './useThrottledCallback';
import useUniqueId from './useUniqueId';

const STREAMING_PROGRESS = 0.75;
const STREAMING_TIMEOUT = 1500;
const PROGRESS_THROTTLE = 500;

// TODO(codemod): useMediaWithLoadProgress: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useMediaWithLoadProgress(
  mediaHash: string | undefined,
  noLoad = false,
  mediaFormat = ApiMediaFormat.BlobUrl,
  delay?: number | false,
  isHtmlAllowed = false,
) {
  const isStreaming = IS_PROGRESSIVE_SUPPORTED && mediaFormat === ApiMediaFormat.Progressive;
  const mediaData = mediaHash
    ? isStreaming && !noLoad
      ? mediaLoader.getProgressiveUrl(mediaHash)
      : mediaLoader.getFromMemory(mediaHash)
    : undefined;

  // TODO(codemod): useForceUpdate: a component runs once; make the changing value a signal and delete the force update
  const forceUpdate = useForceUpdate();
  const isSynced = useSelector(selectIsSynced);
  const id = useUniqueId();
  const [loadProgress, setLoadProgress] = createSignal(mediaData && !isStreaming ? 1 : 0);
  let startedAtRef: number | undefined;

  const handleProgress = useThrottledCallback(
    (progress: number) => {
      if (startedAtRef && id && (!delay || Date.now() - startedAtRef > delay)) {
        setLoadProgress(progress);
      }
    },
    [delay, id],
    PROGRESS_THROTTLE,
    true,
  );

  createEffect(depsOf(() => [noLoad, mediaHash, mediaData, mediaFormat, isStreaming, delay, handleProgress, isHtmlAllowed, id, isSynced()] as const), ([, , , , , , , , , isSynced2]) => {
    if (!noLoad && mediaHash) {
      if (!mediaData) {
        setLoadProgress(0);

        if (startedAtRef) {
          mediaLoader.cancelProgress(handleProgress);
        }

        startedAtRef = Date.now();

        mediaLoader.fetch(mediaHash, mediaFormat, isHtmlAllowed, handleProgress, id).then(() => {
          const spentTime = Date.now() - startedAtRef!;
          startedAtRef = undefined;

          if (!delay || spentTime >= delay) {
            forceUpdate();
          } else {
            setTimeout(forceUpdate, delay - spentTime);
          }
        });
      } else if (isStreaming) {
        setTimeout(() => {
          setLoadProgress(STREAMING_PROGRESS);
        }, STREAMING_TIMEOUT);
      }
    }
  });

  createEffect(depsOf(() => [handleProgress, noLoad]), () => {
    if (noLoad && startedAtRef) {
      mediaLoader.cancelProgress(handleProgress);
      setLoadProgress(0);
      startedAtRef = undefined;
    }
  });

  createEffect(depsOf(() => [id, mediaHash]), () => {
    return () => {
      if (mediaHash) {
        mediaLoader.removeCallback(mediaHash, id);
      }
    };
  });

  return { mediaData, loadProgress };
}
