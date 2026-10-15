// FOUNDATION STUB: DropArea (telegram-tt src/components/middle/composer/DropArea.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiMessage } from '../../../api/types';

export enum DropAreaState {
  None = 'none',
  Document = 'document',
  QuickFile = 'quick_file',
}

export type OwnProps = {
  isOpen: boolean;
  withQuick?: boolean;
  editingMessage?: ApiMessage;
  onHide: NoneToVoidFunction;
  onFileSelect: (files: File[]) => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DropArea = (_props: OwnProps) => undefined;

export default DropArea;
