// FOUNDATION STUB: Document (telegram-tt src/components/common/Document.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { ApiDocument, ApiMessage } from '../../api/types';
import type { ObserveFn } from '../../hooks/useIntersectionObserver';
import type { MenuItemContextAction } from '../ui/ListItem';

import buildClassName from '../../util/buildClassName';
import { PLACEHOLDER_RADIUS, PLACEHOLDER_SURFACE } from './helpers/placeholder';

export type OwnProps = {
  document: ApiDocument;
  observeIntersection?: ObserveFn;
  fileSize?: 'small' | 'medium' | 'large';
  isSelected?: boolean;
  isSelectable?: boolean;
  canAutoLoad?: boolean;
  uploadProgress?: number;
  datetime?: number;
  className?: string;
  sender?: string;
  autoLoadFileMaxSizeMb?: number;
  isDownloading?: boolean;
  noDownload?: boolean;
  shouldWarnAboutFiles?: boolean;
  id?: string;
  onCancelUpload?: NoneToVoidFunction;
  contextActions?: MenuItemContextAction[];
} & (
  | {
      message: ApiMessage;
      onDateClick: (arg: ApiMessage) => void;
      onMediaClick?: (messageId: number) => void;
    }
  | {
      message?: ApiMessage;
      onDateClick?: never;
      onMediaClick?: NoneToVoidFunction;
    }
);

// The file icon of tt's document is 3rem (a 3.375rem row).
// TODO(port): the real Document (file icon / thumbnail, name, size, download progress).
const Document = (props: OwnProps) => {
  return (
    <div
      id={props.id}
      role="img"
      aria-label="Document, not supported yet"
      class={buildClassName('Document', props.className)}
      style={`min-width: 15rem; max-width: 100%; height: 3.375rem; ${PLACEHOLDER_SURFACE}; ${PLACEHOLDER_RADIUS}`}
    />
  );
};

export default Document;
