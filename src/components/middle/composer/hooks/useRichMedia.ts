// FOUNDATION STUB: useRichMedia (telegram-tt src/components/middle/composer/hooks/useRichMedia.ts) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
// Deviation: the stub returns plain values (inert functions, false, undefined); the real hook will return accessors.
// Deviation: the parameters are accessors (the Composer passes `() => value`), as the real hook will take them.
import type { Accessor } from 'frameact';

import type { ApiAttachment, ApiChat } from '../../../../api/types';
import type { ThreadId } from '../../../../types';
import type { RichEditor, RichEditorMediaEditHandler, RichEditorMediaFilesHandler } from '../richEditorTypes';

type Params = {
  richEditor: RichEditor;
  chat?: Accessor<ApiChat | undefined>;
  chatId: Accessor<string>;
  threadId: Accessor<ThreadId>;
  fileSizeLimit: Accessor<number>;
  canSendPhotos: Accessor<boolean>;
  canSendVideos: Accessor<boolean>;
  canSendDocuments: Accessor<boolean>;
  canSendAudios: Accessor<boolean>;
  shouldSendInHighQuality?: Accessor<boolean | undefined>;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function useRichMedia(_params: Params) {
  return {
    handleFiles: (() => {}) as RichEditorMediaFilesHandler,
    handleEditMedia: (() => {}) as RichEditorMediaEditHandler,
    handleCloseMediaEditor: (() => {}) as NoneToVoidFunction,
    handleSaveMediaEdit: (async (_file: File) => {}) as (file: File) => Promise<void>,
    editingAttachment: undefined as ApiAttachment | undefined,
    hasBlockingMedia: false,
  };
}
