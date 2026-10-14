import { createSignal, onMount } from 'frameact';

import type { ApiPeer } from '../api/types';
import { ApiMediaFormat } from '../api/types';

import { getChatAvatarHash } from '../global/helpers';
import { buildHexFromColor, getAverageColor } from '../util/colors';
import useMedia from './useMedia';

// TODO(codemod): useAverageColor: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
function useAverageColor(peer: ApiPeer, fallbackColor = '#00000000') {
  const [color, setColor] = createSignal(fallbackColor);
  const imgBlobUrl = useMedia(getChatAvatarHash(peer), false, ApiMediaFormat.BlobUrl);

  onMount(() => {
    (async () => {
      if (!imgBlobUrl) {
        return;
      }

      const averageColor = await getAverageColor(imgBlobUrl);
      setColor(buildHexFromColor(averageColor));
    })();
  });

  return color;
}

export default useAverageColor;
