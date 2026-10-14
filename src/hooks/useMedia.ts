import { createEffect, createMemo, createSignal } from 'frameact';

import { ApiMediaFormat } from '../api/types';

import { selectIsSynced } from '../global/selectors';
import { type MaybeAccessor, read } from '../util/accessors';
import { IS_PROGRESSIVE_SUPPORTED } from '../util/browser/windowEnvironment';
import * as mediaLoader from '../util/mediaLoader';
import useSelector from './data/useSelector';

// Deviation: `useForceUpdate` is a version signal that the memo reads, so it re-reads the loader once the fetch resolves.
const useMedia = (
  mediaHash: MaybeAccessor<string | false | undefined>,
  noLoad: MaybeAccessor<boolean> = false,
  mediaFormat: MaybeAccessor<ApiMediaFormat> = ApiMediaFormat.BlobUrl,
  delay?: MaybeAccessor<number | false | undefined>,
  cacheBuster?: MaybeAccessor<number | undefined>,
) => {
  const [version, setVersion] = createSignal(0);
  const forceUpdate = () => setVersion((current) => current + 1);

  const mediaData = createMemo(() => {
    version();

    const hash = read(mediaHash);
    const isStreaming = IS_PROGRESSIVE_SUPPORTED && read(mediaFormat) === ApiMediaFormat.Progressive;
    return hash ? (isStreaming ? mediaLoader.getProgressiveUrl(hash) : mediaLoader.getFromMemory(hash)) : undefined;
  });
  const isSynced = useSelector(selectIsSynced);

  createEffect(
    () =>
      [
        read(noLoad),
        read(mediaHash),
        mediaData(),
        read(mediaFormat),
        read(cacheBuster),
        read(delay),
        isSynced(),
      ] as const,
    ([noLoad2, mediaHash2, mediaData2, mediaFormat2, , delay2]) => {
      if (!noLoad2 && mediaHash2 && !mediaData2) {
        const startedAt = Date.now();

        mediaLoader.fetch(mediaHash2, mediaFormat2).then(() => {
          const spentTime = Date.now() - startedAt;
          if (!delay2 || spentTime >= delay2) {
            forceUpdate();
          } else {
            setTimeout(forceUpdate, delay2 - spentTime);
          }
        });
      }
    },
  );

  return mediaData;
};

export default useMedia;
