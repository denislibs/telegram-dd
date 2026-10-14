import { createEffect } from 'frameact';

import { ApiMediaFormat } from '../api/types';

import { selectIsSynced } from '../global/selectors';
import { IS_PROGRESSIVE_SUPPORTED } from '../util/browser/windowEnvironment';
import * as mediaLoader from '../util/mediaLoader';
import useSelector from './data/useSelector';
import useForceUpdate from './useForceUpdate';

// TODO(codemod): useMedia: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
const useMedia = (
  mediaHash: string | false | undefined,
  noLoad = false,
  mediaFormat = ApiMediaFormat.BlobUrl,
  delay?: number | false,
  cacheBuster?: number,
) => {
  const isStreaming = IS_PROGRESSIVE_SUPPORTED && mediaFormat === ApiMediaFormat.Progressive;
  const mediaData = mediaHash
    ? isStreaming
      ? mediaLoader.getProgressiveUrl(mediaHash)
      : mediaLoader.getFromMemory(mediaHash)
    : undefined;

  // TODO(codemod): useForceUpdate: a component runs once; make the changing value a signal and delete the force update
  const forceUpdate = useForceUpdate();
  const isSynced = useSelector(selectIsSynced);

  createEffect(
    () => [noLoad, mediaHash, mediaData, mediaFormat, cacheBuster, delay, isSynced()],
    ([, , , , , , isSynced]) => {
      if (!noLoad && mediaHash && !mediaData) {
        const startedAt = Date.now();

        mediaLoader.fetch(mediaHash, mediaFormat).then(() => {
          const spentTime = Date.now() - startedAt;
          if (!delay || spentTime >= delay) {
            forceUpdate();
          } else {
            setTimeout(forceUpdate, delay - spentTime);
          }
        });
      }
    },
  );

  return mediaData;
};

export default useMedia;
