// FOUNDATION STUB: Video (telegram-tt src/components/middle/message/Video.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiMediaExtendedPreview, ApiVideo } from '../../../api/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Video = (_props: OwnProps) => undefined;

export default Video;
