// FOUNDATION STUB: Photo (telegram-tt src/components/middle/message/Photo.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import { createMemo } from 'frameact';

import type { ApiMediaExtendedPreview, ApiPhoto } from '../../../api/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';
import type { ThemeKey } from '../../../types';

import { getMediaDimensions } from '../../../global/helpers';
import buildClassName from '../../../util/buildClassName';
import buildStyle from '../../../util/buildStyle';
import { buildMediaFrameStyle, getMediaPlaceholderSize } from '../../common/helpers/placeholder';

import mediaStyles from './media.module.scss';

export type OwnProps<T = unknown> = {
  id?: string;
  photo: ApiPhoto | ApiMediaExtendedPreview;
  isOwn?: boolean;
  canAutoLoad?: boolean;
  isInSelectMode?: boolean;
  isSelected?: boolean;
  uploadProgress?: number;
  size?: 'inline' | 'pictogram';
  layout?: 'intrinsic' | 'fill';
  shouldAffectAppendix?: boolean;
  nonInteractive?: boolean;
  noSpoilerReveal?: boolean;
  isDownloading?: boolean;
  isProtected?: boolean;
  theme: ThemeKey;
  className?: string;
  clickArg?: T;
  isMediaNsfw?: boolean;
  observeIntersection?: ObserveFn;
  onClick?: (arg: T, e: React.MouseEvent<HTMLElement>) => void;
  onCancelUpload?: (arg: T) => void;
};

// TODO(port): the real Photo (loading, thumbnail, spoiler, appendix background, upload progress).
const Photo = (props: OwnProps) => {
  const size = createMemo(() => getMediaPlaceholderSize(getMediaDimensions(props.photo)));
  const isPictogram = () => props.size === 'pictogram';

  return (
    <div
      id={props.id}
      role="img"
      aria-label="Photo, not supported yet"
      class={buildClassName(
        'media-inner',
        mediaStyles.frame,
        mediaStyles[props.layout ?? 'intrinsic'],
        isPictogram() && mediaStyles.pictogram,
        (size().width === size().height || isPictogram()) && 'square-image',
        props.className,
      )}
      style={isPictogram() ? buildStyle() : buildMediaFrameStyle(size())}
    />
  );
};

export default Photo;
