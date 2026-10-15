// FOUNDATION STUB: Document (telegram-tt src/components/common/Document.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiDocument, ApiMessage } from '../../api/types';
import type { ObserveFn } from '../../hooks/useIntersectionObserver';
import type { MenuItemContextAction } from '../ui/ListItem';

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
} & ({
  message: ApiMessage;
  onDateClick: (arg: ApiMessage) => void;
  onMediaClick?: (messageId: number) => void;
} | {
  message?: ApiMessage;
  onDateClick?: never;
  onMediaClick?: NoneToVoidFunction;
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Document = (_props: OwnProps) => undefined;

export default Document;
