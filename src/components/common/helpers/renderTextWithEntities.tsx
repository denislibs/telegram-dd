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

// Copied verbatim from telegram-tt (pure helper used by MessageText for the focused quote).
export function insertTextEntity(entities: ApiMessageEntity[], newEntity: ApiMessageEntity) {
  const resultEntities: ApiMessageEntity[] = [];

  const newEntityStart = newEntity.offset;
  const newEntityEnd = newEntity.offset + newEntity.length;

  for (const existingEntity of entities) {
    const existingEntityStart = existingEntity.offset;
    const existingEntityEnd = existingEntity.offset + existingEntity.length;
    // Push as is if edges do not overlap
    if (
      existingEntityEnd <= newEntityStart ||
      existingEntityStart > newEntityEnd ||
      (existingEntityStart > newEntityStart && existingEntityEnd < newEntityEnd) ||
      (existingEntityStart === newEntityStart && existingEntityEnd === newEntityEnd)
    ) {
      resultEntities.push(existingEntity);
      continue;
    }

    // If start edge overlaps
    if (existingEntityStart < newEntityStart && existingEntityEnd > newEntityStart) {
      // Split entity in two
      resultEntities.push({
        ...existingEntity,
        length: newEntityStart - existingEntityStart,
      });
      resultEntities.push({
        ...existingEntity,
        offset: newEntityStart,
        length: existingEntityEnd - newEntityStart,
      });
    }

    // If end edge overlaps
    if (existingEntityStart < newEntityEnd && existingEntityEnd > newEntityEnd) {
      // Split entity in two
      resultEntities.push({
        ...existingEntity,
        offset: newEntityEnd,
        length: existingEntityEnd - newEntityStart - newEntity.length,
      });
      resultEntities.push({
        ...existingEntity,
        length: newEntityEnd - existingEntityStart,
      });
    }
  }

  resultEntities.push(newEntity);
  // Sort entities by offset, longer entities first
  return resultEntities.sort((a, b) => a.offset - b.offset || b.length - a.length);
}
