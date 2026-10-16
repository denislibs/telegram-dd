import { getMediaThumbUri, type MediaWithThumbs } from '../../../../global/helpers';
import { type MaybeAccessor, read } from '../../../../util/accessors';

import useOffscreenCanvasBlur from '../../../../hooks/useOffscreenCanvasBlur';

type CanvasBlurReturnType = ReturnType<typeof useOffscreenCanvasBlur>;

// Deviation: the parameters are `MaybeAccessor`s (a hook runs once); it returns the canvas callback ref.
export default function useBlurredMediaThumbRef(
  forcedUri: MaybeAccessor<string | undefined>,
  isDisabled: MaybeAccessor<boolean | undefined>,
): CanvasBlurReturnType;
export default function useBlurredMediaThumbRef(
  media: MaybeAccessor<MediaWithThumbs>,
  isDisabled?: MaybeAccessor<boolean | undefined>,
): CanvasBlurReturnType;
export default function useBlurredMediaThumbRef(
  media: MaybeAccessor<MediaWithThumbs | string | undefined>,
  isDisabled?: MaybeAccessor<boolean | undefined>,
) {
  return useOffscreenCanvasBlur(() => {
    const media2 = read(media);
    return media2 ? (typeof media2 === 'string' ? media2 : getMediaThumbUri(media2)) : undefined;
  }, isDisabled);
}
