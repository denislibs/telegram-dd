// FOUNDATION STUB: the `editor` bundle (message input, rich editor, message copy) is ported with the composer slice. It
// carries the signature that `global/actions/ui/messages.ts` (copyMessages) calls through `loadBundle`, and a plain-text
// `buildMessageCopyContent`: Ctrl+C on a selection of message text, and "Copy" of selected messages, produce their text
// (tt's bundle also builds the rich HTML / Markdown of the entities and the sender headers: TODO(port)).
import { getGlobal } from '../global';

import type { MessageListType, ThreadId } from '../types';
import type { ClipboardTextContent, MessageCopyRequest } from '../types/messageCopy';

import { extractMessageText } from '../global/helpers';
import { generateBrailleSpoiler } from '../global/helpers/messageSummary';
import { selectChatMessage } from '../global/selectors';

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

/**
 * The text of the HTML of a selection of rendered messages. A concealed spoiler is replaced by braille characters of the
 * same length: the clone of a range carries the text that the page hides (`user-select: none` does not keep a text out of
 * `Range.cloneContents`), and a copy must not show what the sender concealed.
 */
export function getPlainTextOfSelectionHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('.Spoiler--concealed .Spoiler__content, .Spoiler--concealed').forEach((node) => {
    if (node.classList.contains('Spoiler--concealed') && node.querySelector('.Spoiler__content')) return;
    node.textContent = generateBrailleSpoiler((node.textContent || '').length);
  });
  doc.querySelectorAll('script, style, template').forEach((node) => node.remove());
  doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  doc.querySelectorAll('p, div, li, blockquote, pre').forEach((block) => block.append('\n'));

  return (doc.body.textContent || '')
    .replace(/ /g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildMessageCopyContent(
  messageList: { chatId: string; threadId: ThreadId; type: MessageListType },
  request: MessageCopyRequest,
  _tabId?: number,
): Promise<ClipboardTextContent> {
  let plainText: string;
  if (request.type === 'selection') {
    plainText = getPlainTextOfSelectionHtml(request.html);
  } else {
    const global = getGlobal();
    plainText = request.messageIds
      .map((id) => selectChatMessage(global, messageList.chatId, id))
      .map((message) => (message ? extractMessageText(message)?.text || '' : ''))
      .filter(Boolean)
      .join('\n\n');
  }

  return Promise.resolve({ plainText, html: escapeHtml(plainText), markdown: plainText });
}
