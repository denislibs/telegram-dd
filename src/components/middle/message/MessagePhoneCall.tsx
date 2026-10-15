// FOUNDATION STUB: MessagePhoneCall (telegram-tt src/components/middle/message/MessagePhoneCall.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiMessage } from '../../../api/types';
import type { ApiMessageActionPhoneCall } from '../../../api/types/messageActions';

export type OwnProps = {
  phoneCall: ApiMessageActionPhoneCall;
  message: ApiMessage;
  chatId: string;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MessagePhoneCall = (_props: OwnProps) => undefined;

export default MessagePhoneCall;
