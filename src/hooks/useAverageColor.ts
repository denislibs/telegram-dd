import { createEffect, createSignal } from 'frameact';

import type { ApiPeer } from '../api/types';
import { ApiMediaFormat } from '../api/types';

import { getChatAvatarHash } from '../global/helpers';
import { type MaybeAccessor, read } from '../util/accessors';
import { buildHexFromColor, getAverageColor } from '../util/colors';
import useMedia from './useMedia';

// Deviation: `peer` is a `MaybeAccessor` (frameact hooks run once).
function useAverageColor(peer: MaybeAccessor<ApiPeer>, fallbackColor = '#00000000') {
  const [color, setColor] = createSignal(fallbackColor);
  const imgBlobUrl = useMedia(() => getChatAvatarHash(read(peer)), false, ApiMediaFormat.BlobUrl);

  createEffect(
    () => imgBlobUrl(),
    (imgBlobUrl2) => {
      (async () => {
        if (!imgBlobUrl2) {
          return;
        }

        const averageColor = await getAverageColor(imgBlobUrl2);
        setColor(buildHexFromColor(averageColor));
      })();
    },
  );

  return color;
}

export default useAverageColor;
