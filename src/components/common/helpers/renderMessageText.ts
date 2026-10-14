// FOUNDATION STUB: component-layer helper (message text/summary as nodes), ported with the components (T6) together with
// `renderTextWithEntities` and `renderText`. Plain-text version of tt's functions with the same signatures.
// Copied (signatures) from telegram-tt src/components/common/helpers/renderMessageText.ts
import { getGlobal } from '../../../global';

import type { ApiMessage, ApiSponsoredMessage } from '../../../api/types';
import type { TextPart, ThreadId } from '../../../types';
import type { LangFn } from '../../../util/localization';

import { getMessageStatefulContent, getMessageTextWithFallback } from '../../../global/helpers';
import { getMessageSummaryText, TRUNCATED_SUMMARY_LENGTH } from '../../../global/helpers/messageSummary';
import { getTranslationFn } from '../../../util/localization';
import trimText from '../../../util/trimText';

export function renderMessageText({
  message,
  truncateLength,
}: {
  message: ApiMessage | ApiSponsoredMessage;
  highlight?: string;
  emojiSize?: number;
  asPreview?: boolean;
  truncateLength?: number;
  isProtected?: boolean;
  forcePlayback?: boolean;
  shouldRenderAsHtml?: boolean;
  isForMediaViewer?: boolean;
  threadId?: ThreadId;
  maxTimestamp?: number;
}) {
  const { text } = message.content.text || {};

  if (!text) {
    const contentNotSupportedText = getMessageTextWithFallback(getTranslationFn(), message)?.text;
    return contentNotSupportedText ? [trimText(contentNotSupportedText, truncateLength)] : undefined;
  }

  return [trimText(text, truncateLength)];
}

export function renderMessageSummary(
  lang: LangFn,
  message: ApiMessage,
  noEmoji = false,
  _highlight?: string,
  truncateLength = TRUNCATED_SUMMARY_LENGTH,
): TextPart[] {
  const statefulContent = getMessageStatefulContent(getGlobal(), message);
  return [trimText(getMessageSummaryText(lang, message, statefulContent, noEmoji), truncateLength)];
}
