import { createMemo } from 'frameact';
import { getActions } from '../global';

import type { ApiSendMessageAction } from '../api/types';
import type { ThreadId } from '../types';

import { SEND_MESSAGE_ACTION_INTERVAL } from '../config';
import { type MaybeAccessor, read } from '../util/accessors';
import { throttle } from '../util/schedulers';

// Deviation: a hook runs once; `chatId`/`threadId` are values or accessors, and the result is a stable function that calls
// the throttled sender of the current chat and thread (tt returned the throttled function itself, re-created per chat/thread).
const useSendMessageAction = (
  chatId?: MaybeAccessor<string | undefined>,
  threadId?: MaybeAccessor<ThreadId | undefined>,
) => {
  const throttledSend = createMemo(() => {
    const chatId2 = read(chatId);
    const threadId2 = read(threadId);

    return throttle((action: ApiSendMessageAction) => {
      if (!chatId2 || !threadId2) return;
      getActions().sendMessageAction({ chatId: chatId2, threadId: threadId2, action });
    }, SEND_MESSAGE_ACTION_INTERVAL);
  });

  return (action: ApiSendMessageAction) => throttledSend()(action);
};

export default useSendMessageAction;
