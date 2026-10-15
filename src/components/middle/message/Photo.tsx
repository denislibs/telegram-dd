// FOUNDATION STUB: Photo (telegram-tt src/components/middle/message/Photo.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiMediaExtendedPreview, ApiPhoto } from '../../../api/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';
import type { ThemeKey } from '../../../types';

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Photo = (_props: OwnProps) => undefined;

export default Photo;
