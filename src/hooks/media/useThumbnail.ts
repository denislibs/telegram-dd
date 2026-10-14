import { createMemo } from 'frameact';
import { useGlobal } from '../../global';

import type { ApiThumbnail, MediaContainer } from '../../api/types';

import { selectTheme } from '../../global/selectors';
import { selectMessageMediaThumbDataUri } from '../../global/selectors/media';
import { type MaybeAccessor, read } from '../../util/accessors';

// Deviation: a memo over the tracked global, so the thumbnail also follows a theme change (tt had a TODO for that).
export default function useThumbnail(media?: MaybeAccessor<MediaContainer | ApiThumbnail | undefined>) {
  const global = useGlobal();
  const thumbDataUri = createMemo(() => {
    const media2 = read(media);
    return media2 && 'content' in media2 ? selectMessageMediaThumbDataUri(global, media2) : media2?.dataUri;
  });

  const theme = createMemo(() => selectTheme(global));

  const dataUri = createMemo(() => {
    const uri = thumbDataUri();
    if (!uri || theme() !== 'dark') return uri;

    return uri.replace('<svg', '<svg fill="white"');
  });

  return dataUri;
}
