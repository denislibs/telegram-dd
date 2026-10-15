import { createMemo } from 'frameact';
import { splitProps } from 'frameact/dom';

import type { ApiSticker } from '../../api/types';
import type { OwnProps as AnimatedIconProps } from './AnimatedIcon';
import { ApiMediaFormat } from '../../api/types';

import { getStickerMediaHash } from '../../global/helpers';

import useMedia from '../../hooks/useMedia';

import AnimatedIconWithPreview from './AnimatedIconWithPreview';

type OwnProps = Partial<AnimatedIconProps> & { sticker?: ApiSticker; noLoad?: boolean; forcePreview?: boolean };

function AnimatedIconFromSticker(props: OwnProps) {
  const [, otherProps] = splitProps(props, ['sticker', 'noLoad', 'forcePreview', 'fitzModifier']);

  const thumbDataUri = createMemo(() => props.sticker?.thumbnail?.dataUri);
  const localMediaHash = createMemo(() => props.sticker && getStickerMediaHash(props.sticker, 'full'));
  const previewBlobUrl = useMedia(
    () => (props.sticker ? getStickerMediaHash(props.sticker, 'preview') : undefined),
    () => Boolean(props.fitzModifier || (props.noLoad && !props.forcePreview)),
    ApiMediaFormat.BlobUrl,
  );
  const tgsUrl = useMedia(
    () => localMediaHash(),
    () => Boolean(props.noLoad),
  );

  return (
    <AnimatedIconWithPreview
      tgsUrl={tgsUrl()}
      previewUrl={props.fitzModifier ? undefined : previewBlobUrl()}
      thumbDataUri={thumbDataUri()}
      fitzModifier={props.fitzModifier}
      {...otherProps}
    />
  );
}

export default AnimatedIconFromSticker;
