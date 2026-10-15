// FOUNDATION STUB: AttachMenu (telegram-tt src/components/middle/composer/AttachMenu.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiAttachMenuPeerType, ApiFormattedText, ApiMessage } from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { MessageListType, ThemeKey, ThreadId } from '../../../types';

export type OwnProps = {
  chatId: string;
  threadId?: ThreadId;
  isButtonVisible: boolean;
  canAttachMedia: boolean;
  canAttachFiles: boolean;
  canAttachPolls: boolean;
  canAttachToDoLists: boolean;
  canSendPhotos: boolean;
  canSendVideos: boolean;
  canSendDocuments: boolean;
  canSendAudios: boolean;
  isScheduled?: boolean;
  attachBots?: GlobalState['attachMenu']['bots'];
  canSendMoney?: boolean;
  peerType?: ApiAttachMenuPeerType;
  shouldCollectDebugLogs?: boolean;
  theme: ThemeKey;
  canEditMedia?: boolean;
  isRichInputExpanded?: boolean;
  editingMessage?: ApiMessage;
  messageListType: MessageListType;
  paidMessagesStars?: number;
  canInsertDate?: boolean;
  canExpandRichInput?: boolean;
  menuPositionX: 'left' | 'right';
  onFileSelect: (files: File[], shouldSendAsFile?: boolean) => void;
  onDateInsert: (text: ApiFormattedText) => void;
  onTodoListCreate: NoneToVoidFunction;
  onRichInputExpand: NoneToVoidFunction;
  onMenuOpen: NoneToVoidFunction;
  onMenuClose: NoneToVoidFunction;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const AttachMenu = (_props: OwnProps) => undefined;

export default AttachMenu;
