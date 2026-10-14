// FOUNDATION STUB: the rich-text renderer (entities -> nodes, custom emoji, spoilers, links) is a component-layer file,
// ported with the components (T6). The global layer only calls it from `helpers/messageSummary.ts` to build summaries;
// until then it returns the plain text.
// Copied (signature) from telegram-tt src/components/common/helpers/renderTextWithEntities.tsx
import type { ApiMessageEntity } from '../../../api/types';
import type { TextPart, ThreadId } from '../../../types';

export function renderTextWithEntities({
  text,
}: {
  text: string;
  entities?: ApiMessageEntity[];
  highlight?: string;
  emojiSize?: number;
  shouldRenderAsHtml?: boolean;
  containerId?: string;
  asPreview?: boolean;
  isProtected?: boolean;
  cacheBuster?: string;
  forcePlayback?: boolean;
  noCustomEmojiPlayback?: boolean;
  isInSelectMode?: boolean;
  chatId?: string;
  messageId?: number;
  threadId?: ThreadId;
  maxTimestamp?: number;
  [prop: string]: unknown;
}): TextPart[] {
  return [text];
}
