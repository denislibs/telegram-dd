// FOUNDATION STUB: Video (telegram-tt src/components/middle/message/Video.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import { createMemo } from 'frameact';

import type { ApiMediaExtendedPreview, ApiVideo } from '../../../api/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';

import { getMediaDimensions } from '../../../global/helpers';
import buildClassName from '../../../util/buildClassName';
import { buildMediaFrameStyle, getMediaPlaceholderSize } from '../../common/helpers/placeholder';

import mediaStyles from './media.module.scss';

export type OwnProps<T = unknown> = {
  id?: string;
  video: ApiVideo | ApiMediaExtendedPreview;
  lastPlaybackTimestamp?: number;
  canAutoLoad?: boolean;
  canAutoPlay?: boolean;
  uploadProgress?: number;
  layout?: 'intrinsic' | 'fill';
  noSpoilerReveal?: boolean;
  isDownloading?: boolean;
  isProtected?: boolean;
  className?: string;
  clickArg?: T;
  isMediaNsfw?: boolean;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  onClick?: (arg: T, e: React.MouseEvent<HTMLElement>) => void;
  onCancelUpload?: (arg: T) => void;
};

// TODO(port): the real Video (loading, playback, thumbnail, spoiler, duration badge).
const Video = (props: OwnProps) => {
  const size = createMemo(() => getMediaPlaceholderSize(getMediaDimensions(props.video)));

  return (
    <div
      id={props.id}
      role="img"
      aria-label="Video, not supported yet"
      class={buildClassName(
        'media-inner dark',
        mediaStyles.frame,
        mediaStyles[props.layout ?? 'intrinsic'],
        props.className,
      )}
      style={buildMediaFrameStyle(size())}
    />
  );
};

export default Video;
