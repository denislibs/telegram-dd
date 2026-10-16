// FOUNDATION STUB: useAttachmentModal (telegram-tt src/components/middle/composer/hooks/useAttachmentModal.ts) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
// Deviation: the stub returns plain values (inert functions, false, undefined); the real hook will return accessors.
// Deviation: the parameters are accessors (the Composer passes `() => value`), as the real hook will take them.
import type { Accessor } from 'frameact';

import type { ApiAttachment, ApiMessage } from '../../../../api/types';

type SetAttachments = (attachments: ApiAttachment[] | ((current: ApiAttachment[]) => ApiAttachment[])) => void;

type Params = {
  attachments: Accessor<ApiAttachment[]>;
  fileSizeLimit: Accessor<number>;
  setAttachments: SetAttachments;
  chatId: Accessor<string>;
  canAttachFiles: Accessor<boolean>;
  canSendAudios?: Accessor<boolean | undefined>;
  canSendVideos?: Accessor<boolean | undefined>;
  canSendPhotos?: Accessor<boolean | undefined>;
  canSendDocuments?: Accessor<boolean | undefined>;
  editedMessage: Accessor<ApiMessage | undefined>;
  shouldSendInHighQuality?: Accessor<boolean | undefined>;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function useAttachmentModal(_params: Params) {
  return {
    handleAppendFiles: (async (_files: File[], _isSpoiler?: boolean) => {}) as (
      files: File[],
      isSpoiler?: boolean,
    ) => Promise<void>,
    handleFileSelect: (async (_files: File[]) => {}) as (files: File[]) => Promise<void>,
    handleClearAttachments: (() => {}) as NoneToVoidFunction,
    handleSetAttachments: ((_newValue) => {}) as SetAttachments,
    shouldForceCompression: false,
    shouldForceAsFile: false,
  };
}
