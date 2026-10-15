// FOUNDATION STUB: MessagePhoneCall (telegram-tt src/components/middle/message/MessagePhoneCall.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { ApiMessage } from '../../../api/types';
import type { ApiMessageActionPhoneCall } from '../../../api/types/messageActions';

import { PLACEHOLDER_RADIUS, PLACEHOLDER_SURFACE } from '../../common/helpers/placeholder';

export type OwnProps = {
  phoneCall: ApiMessageActionPhoneCall;
  message: ApiMessage;
  chatId: string;
};

// TODO(port): the real MessagePhoneCall (call button, reason, duration).
const MessagePhoneCall = (_props: OwnProps) => {
  return (
    <div
      role="img"
      aria-label="Phone call, not supported yet"
      style={`width: 12rem; max-width: 100%; height: 3rem; ${PLACEHOLDER_SURFACE}; ${PLACEHOLDER_RADIUS}`}
    />
  );
};

export default MessagePhoneCall;
