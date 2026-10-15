import { createEffect } from 'frameact';

import type { MessageListType, ThreadId } from '../types';
import type { MessageCopyRequest } from '../types/messageCopy';

import { captureMessageCopyRequest } from '../components/middle/message/helpers/getSelectionAsFormattedText';
import { type MaybeAccessor, read } from '../util/accessors';

// Deviation: the reactive parameters are `MaybeAccessor`s; the copy handler reads them when the event happens.
const useNativeCopySelectedMessages = (
  isActive: MaybeAccessor<boolean | undefined>,
  chatId: MaybeAccessor<string>,
  threadId: MaybeAccessor<ThreadId>,
  messageListType: MaybeAccessor<MessageListType>,
  copyMessagesByIds: (payload: { request: MessageCopyRequest }) => void,
) => {
  const handleCopy = (e: ClipboardEvent) => {
    if (e.defaultPrevented || !window.ClipboardItem || !navigator.clipboard?.write) return;

    const request = captureMessageCopyRequest(read(chatId), read(threadId), read(messageListType));
    if (!request) return;

    e.preventDefault();
    copyMessagesByIds({ request });
  };

  createEffect(
    () => read(isActive),
    (isActive2) => {
      if (!isActive2) return undefined;

      document.addEventListener('copy', handleCopy);
      return () => document.removeEventListener('copy', handleCopy);
    },
  );
};

export default useNativeCopySelectedMessages;
