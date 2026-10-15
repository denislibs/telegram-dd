// FOUNDATION STUB: ContextMenuContainer (telegram-tt src/components/middle/message/ContextMenuContainer.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiMessage, ApiThreadInfo } from '../../../api/types';
import type { IAlbum, IAnchorPosition, MessageListType, ThreadId } from '../../../types';

export type OwnProps = {
  isOpen: boolean;
  message: ApiMessage;
  album?: IAlbum;
  anchor: IAnchorPosition;
  targetHref?: string;
  isAltKeyPressed?: boolean;
  messageListType: MessageListType;
  threadId: ThreadId;
  noReplies?: boolean;
  detectedLanguage?: string;
  repliesThreadInfo?: ApiThreadInfo;
  className?: string;
  onClose: NoneToVoidFunction;
  onCloseAnimationEnd: NoneToVoidFunction;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ContextMenuContainer = (_props: OwnProps) => undefined;

export default ContextMenuContainer;
