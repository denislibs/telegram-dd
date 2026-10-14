// FOUNDATION STUB: the `editor` bundle (message input, rich editor, message copy) is ported with the composer slice. It
// only carries the signature that `global/actions/ui/messages.ts` (copyMessages) calls through `loadBundle`.
import type { ClipboardTextContent, MessageCopyRequest } from '../types/messageCopy';
import type { MessageListType, ThreadId } from '../types';

export async function buildMessageCopyContent(
  _messageList: { chatId: string; threadId: ThreadId; type: MessageListType },
  _request: MessageCopyRequest,
  _tabId?: number,
): Promise<ClipboardTextContent> {
  return { plainText: '', html: '', markdown: '' };
}
