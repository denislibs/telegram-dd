// FOUNDATION STUB: AttachmentModal.async (telegram-tt src/components/middle/composer/AttachmentModal.async.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
// Deviation: the sync AttachmentModal is not in src yet, so its OwnProps are copied here and exported from this file.
import type { ApiAttachment, ApiMessage } from '../../../api/types';
import type { MessageListType, ThreadId } from '../../../types';
import type { RichEditor } from './richEditorTypes';

export type OwnProps = {
  chatId: string;
  threadId: ThreadId;
  richEditor: RichEditor;
  attachments: ApiAttachment[];
  editingMessage?: ApiMessage;
  messageListType?: MessageListType;
  canShowCustomSendMenu?: boolean;
  isReady: boolean;
  isForMessage?: boolean;
  shouldSchedule?: boolean;
  shouldForceCompression?: boolean;
  shouldForceAsFile?: boolean;
  isForCurrentMessageList?: boolean;
  forceDarkTheme?: boolean;
  canScheduleUntilOnline?: boolean;
  canSchedule?: boolean;
  paidMessagesStars?: number;
  onSend: (sendCompressed: boolean, sendGrouped: boolean, isInvertedMedia?: true) => void;
  onFileAppend: (files: File[], isSpoiler?: boolean) => void;
  onAttachmentsUpdate: (attachments: ApiAttachment[]) => void;
  onClear: NoneToVoidFunction;
  onSendSilent: (sendCompressed: boolean, sendGrouped: boolean, isInvertedMedia?: true) => void;
  onSendScheduled: (
    sendCompressed: boolean,
    sendGrouped: boolean,
    isInvertedMedia?: true,
    scheduledAt?: number,
    scheduleRepeatPeriod?: number,
  ) => void;
  onSendWhenOnline?: NoneToVoidFunction;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const AttachmentModalAsync = (_props: OwnProps) => undefined;

export default AttachmentModalAsync;
