import { createEffect } from 'frameact';
import { depsOf } from '../util/effectDeps';

import type { MessageListType, ThreadId } from '../types';
import type { MessageCopyRequest } from '../types/messageCopy';

import { captureMessageCopyRequest } from '../components/middle/message/helpers/getSelectionAsFormattedText';
import useLastCallback from './useLastCallback';

// TODO(codemod): useNativeCopySelectedMessages: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
const useNativeCopySelectedMessages = (
  isActive: boolean | undefined,
  chatId: string,
  threadId: ThreadId,
  messageListType: MessageListType,
  copyMessagesByIds: (payload: { request: MessageCopyRequest }) => void,
) => {
  const handleCopy = (e: ClipboardEvent) => {
    if (e.defaultPrevented || !window.ClipboardItem || !navigator.clipboard?.write) return;

    const request = captureMessageCopyRequest(chatId, threadId, messageListType);
    if (!request) return;

    e.preventDefault();
    copyMessagesByIds({ request });
  };

  createEffect(depsOf(() => [handleCopy, isActive]), () => {
    if (!isActive) return undefined;

    document.addEventListener('copy', handleCopy);
    return () => document.removeEventListener('copy', handleCopy);
  });
};

export default useNativeCopySelectedMessages;
