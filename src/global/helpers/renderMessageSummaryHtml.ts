import type { ApiMessage } from '../../api/types';

import { type LangFn } from '../../util/localization';
import { renderMessageText } from '../../components/common/helpers/renderMessageText';
import { getGlobal } from '..';
import { getMessageStatefulContent } from './messages';
import { getMessageSummaryDescription, getMessageSummaryEmoji } from './messageSummary';

export function renderMessageSummaryHtml(
  lang: LangFn,
  message: ApiMessage,
  isExtended = false,
) {
  const global = getGlobal();
  const emoji = getMessageSummaryEmoji(message);
  const emojiWithSpace = emoji ? `${emoji} ` : '';
  const text = (renderMessageText({ message, shouldRenderAsHtml: true }) as string[])?.join('');

  const statefulContent = getMessageStatefulContent(global, message);

  // Deviation (security): HTML mode, so the server strings of the description are escaped (`messageSummary.ts`)
  const description = getMessageSummaryDescription(lang, message, statefulContent, text, isExtended, true) as string;

  return `${emojiWithSpace}${description}`;
}
