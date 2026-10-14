import { createMemo } from 'frameact';
import { getGlobal } from '../../global';

import type { ApiThumbnail, MediaContainer } from '../../api/types';

import { selectTheme } from '../../global/selectors';
import { selectMessageMediaThumbDataUri } from '../../global/selectors/media';

// TODO(codemod): useThumbnail: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useThumbnail(media?: MediaContainer | ApiThumbnail) {
  const isMediaContainer = media && 'content' in media;
  const global = createMemo(() => getGlobal());
  const thumbDataUri = createMemo(() =>
    isMediaContainer ? selectMessageMediaThumbDataUri(global(), media) : media?.dataUri,
  );

  // TODO Find a way to update thumbnail on theme change
  const theme = createMemo(() => selectTheme(global()));

  const dataUri = createMemo(() => {
    const uri = thumbDataUri();
    if (!uri || theme() !== 'dark') return uri;

    return uri.replace('<svg', '<svg fill="white"');
  });

  return dataUri;
}
