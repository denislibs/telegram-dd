// FOUNDATION STUB: the rich-text renderer (entities -> nodes, custom emoji, spoilers, links) is a component-layer file,
// ported with the components (T6). The global layer only calls it from `helpers/messageSummary.ts` to build summaries;
// until then it returns the plain text, with every Spoiler range concealed (Deviation: tt's `asPreview` renders a
// `<Spoiler>`; the same braille characters as its plain-string summaries, `generateBrailleSpoiler`). The chat list is always
// on screen: a login code (the synthetic Spoiler of the 777000 chat, `extractMessageText(..., inChatList)`) or any text a
// sender spoilered must not be readable there.
// Copied (signature) from telegram-tt src/components/common/helpers/renderTextWithEntities.tsx
import type { ApiMessageEntity } from '../../../api/types';
import type { TextPart, ThreadId } from '../../../types';
import { ApiMessageEntityTypes } from '../../../api/types';

import { generateBrailleSpoiler } from '../../../global/helpers/messageSummary';

/** `text` with the ranges of Spoiler entities replaced by braille characters of the same length (overlaps merged). */
export function concealSpoilers(text: string, entities?: ApiMessageEntity[]): string {
  if (!entities?.length) return text;

  const concealed = new Array<boolean>(text.length).fill(false);
  let hasSpoiler = false;
  for (const { type, offset, length } of entities) {
    if (type !== ApiMessageEntityTypes.Spoiler) continue;
    hasSpoiler = true;
    for (let i = Math.max(0, offset); i < Math.min(text.length, offset + length); i++) concealed[i] = true;
  }
  if (!hasSpoiler) return text;

  let result = '';
  let i = 0;
  while (i < text.length) {
    if (!concealed[i]) {
      result += text[i++];
      continue;
    }
    let end = i;
    while (end < text.length && concealed[end]) end++;
    result += generateBrailleSpoiler(end - i);
    i = end;
  }

  return result;
}

export function renderTextWithEntities({
  text,
  entities,
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
  return [concealSpoilers(text, entities)];
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
