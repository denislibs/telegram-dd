// FOUNDATION STUB: Album (telegram-tt src/components/middle/message/Album.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';
import type { IAlbum } from '../../../types';

export type OwnProps = {
  album: IAlbum;
  observeIntersection: ObserveFn;
  hasCustomAppendix?: boolean;
  isOwn: boolean;
  isProtected?: boolean;
  onMediaClick: (messageId: number, index?: number) => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Album = (_props: OwnProps) => undefined;

export default Album;
