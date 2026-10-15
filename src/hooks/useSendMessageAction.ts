import { createMemo } from 'frameact';
import { getActions } from '../global';

import type { ApiSendMessageAction } from '../api/types';
import type { ThreadId } from '../types';

import { SEND_MESSAGE_ACTION_INTERVAL } from '../config';
import { throttle } from '../util/schedulers';

// TODO(codemod): useSendMessageAction: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
const useSendMessageAction = (chatId?: string, threadId?: ThreadId) => {
  return createMemo(() => {
    return throttle((action: ApiSendMessageAction) => {
      if (!chatId || !threadId) return;
      getActions().sendMessageAction({ chatId, threadId, action });
    }, SEND_MESSAGE_ACTION_INTERVAL);
  });
};

export default useSendMessageAction;
