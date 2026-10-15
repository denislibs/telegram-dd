import type {
  ApiFormattedText, ApiMediaExtendedPreview, ApiMessage, MediaContent, StatefulMediaContent,
} from '../../api/types';
import type { TeactNode } from '../../lib/frameactNode';
import { ApiMessageEntityTypes } from '../../api/types';

import { type LangFn } from '../../util/localization';
import trimText from '../../util/trimText';
import { renderTextWithEntities } from '../../components/common/helpers/renderTextWithEntities';
import {
  getMessageTextWithFallback, getMessageTranscription,
} from './messages';
import { getRichMessagePreviewText } from './richMessage';

const SPOILER_CHARS = ['⠺', '⠵', '⠞', '⠟'];
export const TRUNCATED_SUMMARY_LENGTH = 200;

export function getMessageSummaryText(
  lang: LangFn,
  message: ApiMessage,
  statefulContent: StatefulMediaContent | undefined,
  noEmoji = false,
  truncateLength = TRUNCATED_SUMMARY_LENGTH,
  isExtended = false,
) {
  const emoji = !noEmoji && getMessageSummaryEmoji(message);
  const emojiWithSpace = emoji ? `${emoji} ` : '';
  const text = trimText(getMessageTextWithSpoilers(lang, message, statefulContent, truncateLength), truncateLength);
  const description = getMessageSummaryDescription(lang, message, statefulContent, text, isExtended);
  const descriptionText = getSummaryDescriptionText(message, statefulContent, description, truncateLength);

  return `${emojiWithSpace}${descriptionText}`;
}

export function getMessageTextWithSpoilers(
  lang: LangFn,
  message: ApiMessage,
  statefulContent: StatefulMediaContent | undefined,
  truncateLength?: number,
) {
  const transcription = getMessageTranscription(message);

  const richMessageText = message.content.richMessage
    ? getRichMessagePreviewText(message.content.richMessage, truncateLength)
    : undefined;
  const textWithoutTranscription = richMessageText
    || getMessageTextWithFallback(lang, statefulContent?.story || message)?.text;
  if (!textWithoutTranscription) {
    return transcription;
  }

  const { entities } = message.content.text || {};
  if (richMessageText || !entities?.length) {
    return transcription ? `${transcription}\n${textWithoutTranscription}` : textWithoutTranscription;
  }

  const text = entities.reduce((accText, {
    type,
    offset,
    length,
  }) => {
    if (type !== ApiMessageEntityTypes.Spoiler) {
      return accText;
    }

    const spoiler = generateBrailleSpoiler(length);

    return `${accText.slice(0, offset)}${spoiler}${accText.slice(offset + length)}`;
  }, textWithoutTranscription);

  return transcription ? `${transcription}\n${text}` : text;
}

export function getMessageSummaryEmoji(message: ApiMessage) {
  const {
    photo,
    video,
    audio,
    voice,
    document,
    sticker,
    pollId,
    paidMedia,
    todo,
  } = message.content;

  if (message.groupedId || photo || paidMedia) {
    return '🖼';
  }

  if (video) {
    return '📹';
  }

  if (sticker) {
    return sticker.emoji;
  }

  if (audio) {
    return '🎧';
  }

  if (voice) {
    return '🎤';
  }

  if (document) {
    return '📎';
  }

  if (pollId) {
    return '📊';
  }

  if (todo) {
    return '📝';
  }

  return undefined;
}

export function getMediaContentTypeDescription(
  lang: LangFn, content: MediaContent, statefulContent: StatefulMediaContent | undefined,
) {
  return getSummaryDescription(lang, content, statefulContent);
}
export function getMessageSummaryDescription(
  lang: LangFn,
  message: ApiMessage,
  statefulContent: StatefulMediaContent | undefined,
  truncatedText?: string | TeactNode,
  isExtended = false,
  shouldRenderAsHtml = false,
) {
  return getSummaryDescription(
    lang, message.content, statefulContent, message, truncatedText, isExtended, shouldRenderAsHtml,
  );
}

// Deviation (security): tt concatenates the server strings of a summary (a file name, an audio title, an invoice title,
// a game title, a poll question, ...) into the HTML string of `renderMessageSummaryHtml` as they are, so a file name
// such as `x<a href="https://evil.example">...</a>` became a live link, mention, spoiler or custom emoji in the copied
// clipboard HTML. In HTML mode every part except `truncatedText` (already HTML, rendered by `renderMessageText` with
// `shouldRenderAsHtml`) is escaped, and the poll and todo titles go through the entity renderer in HTML mode. The plain
// mode (chat list, reply bar, notifications) is unchanged.
export function escapeSummaryHtml(text: string) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function getSummaryDescription(
  lang: LangFn,
  mediaContent: MediaContent,
  statefulContent: StatefulMediaContent | undefined,
  message?: ApiMessage,
  truncatedText?: string | TeactNode,
  isExtended = false,
  shouldRenderAsHtml = false,
) {
  // Identity in plain mode, so that the plain summary stays byte-identical to tt's
  const asText = <T extends string | undefined>(value: T) =>
    (shouldRenderAsHtml && value ? escapeSummaryHtml(value) : value) as T;
  const renderFormattedText = ({ text: formattedText, entities }: ApiFormattedText) => (shouldRenderAsHtml
    ? (renderTextWithEntities({
      text: formattedText, entities, asPreview: true, shouldRenderAsHtml: true,
    }) as string[]).join('')
    : renderTextWithEntities({ text: formattedText, entities, asPreview: true }));

  const {
    text,
    photo,
    video,
    audio,
    voice,
    document,
    sticker,
    contact,
    invoice,
    location,
    game,
    storyData,
    giveaway,
    giveawayResults,
    paidMedia,
    todo,
    dice,
    richMessage,
  } = mediaContent;
  const { poll } = statefulContent || {};

  let hasUsedTruncatedText = false;
  let summary: TeactNode | undefined;

  const boughtExtendedMedia = paidMedia?.isBought && paidMedia.extendedMedia;
  const previewExtendedMedia = paidMedia && !paidMedia.isBought
    ? paidMedia.extendedMedia as ApiMediaExtendedPreview[] : undefined;

  const isPaidMediaAlbum = paidMedia && paidMedia.extendedMedia.length > 1;
  const isPaidMediaSingleVideo = !isPaidMediaAlbum
    && (boughtExtendedMedia?.[0].video || previewExtendedMedia?.[0].duration);
  const isPaidMediaSinglePhoto = !isPaidMediaAlbum && !isPaidMediaSingleVideo;

  if (message?.groupedId || isPaidMediaAlbum) {
    hasUsedTruncatedText = true;
    summary = truncatedText || asText(lang('Album'));
  }

  if (photo || isPaidMediaSinglePhoto) {
    hasUsedTruncatedText = true;
    summary = truncatedText || asText(lang('AttachPhoto'));
  }

  if (video || isPaidMediaSingleVideo) {
    hasUsedTruncatedText = true;
    summary = truncatedText || asText(lang(video?.isGif ? 'AttachGif' : 'AttachVideo'));
  }

  if (sticker) {
    summary = asText(lang('AttachSticker').trim());
  }

  if (audio) {
    summary = asText(getMessageAudioCaption(mediaContent) || lang('AttachMusic'));
  }

  if (voice) {
    hasUsedTruncatedText = true;
    summary = truncatedText || asText(lang('AttachAudio'));
  }

  if (document) {
    hasUsedTruncatedText = !isExtended;
    summary = isExtended ? asText(document.fileName) : (truncatedText || asText(document.fileName));
  }

  if (contact) {
    summary = asText(lang('AttachContact'));
  }

  if (poll) {
    summary = renderFormattedText(poll.summary.question);
  }

  if (invoice) {
    summary = asText(
      invoice.extendedMedia ? invoice.title : lang('AttachInvoice', { description: invoice.description }),
    );
  }

  if (text) {
    if (isExtended && summary && !hasUsedTruncatedText) {
      (summary as string) += `\n${truncatedText as string}`;
    } else {
      summary = truncatedText as string;
    }
  }

  if (location?.mediaType === 'geo' || location?.mediaType === 'venue') {
    summary = asText(lang('AttachLocation'));
  }

  if (location?.mediaType === 'geoLive') {
    summary = asText(lang('AttachLiveLocation'));
  }

  if (game) {
    summary = `🎮 ${asText(game.title)}`;
  }

  if (giveaway) {
    summary = asText(lang('AttachGiveaway'));
  }

  if (giveawayResults) {
    summary = asText(lang('AttachGiveawayResults'));
  }

  if (storyData) {
    summary = truncatedText || asText(lang('AttachStory'));
  }

  if (todo) {
    summary = renderFormattedText(todo.todo.title);
  }

  if (dice) {
    summary = asText(dice.emoticon);
  }

  if (richMessage) {
    summary = truncatedText as string;
  }

  return summary || asText(lang('MessageUnsupported'));
}

export function generateBrailleSpoiler(length: number) {
  return new Array(length)
    .fill(undefined)
    .map(() => SPOILER_CHARS[Math.floor(Math.random() * SPOILER_CHARS.length)])
    .join('');
}

function getMessageAudioCaption(mediaContent: MediaContent) {
  const {
    audio,
    text,
  } = mediaContent;

  return (audio && [audio.title, audio.performer].filter(Boolean)
    .join(' — ')) || (text?.text);
}

function getSummaryDescriptionText(
  message: ApiMessage,
  statefulContent: StatefulMediaContent | undefined,
  description: TeactNode,
  truncateLength: number,
): string {
  const { todo } = message.content;
  const { poll } = statefulContent || {};

  if (todo) {
    return trimText(getFormattedTextWithSpoilers(todo.todo.title), truncateLength);
  }

  if (poll) {
    return trimText(getFormattedTextWithSpoilers(poll.summary.question), truncateLength);
  }

  if (Array.isArray(description)) {
    return description.map((part) => {
      return getSummaryDescriptionText(message, statefulContent, part, truncateLength);
    }).join('');
  }

  return typeof description === 'string' || typeof description === 'number' ? String(description) : '';
}

function getFormattedTextWithSpoilers(formattedText: ApiFormattedText) {
  const { text, entities } = formattedText;

  if (!entities?.length) {
    return text;
  }

  return entities.reduce((accText, {
    type,
    offset,
    length,
  }) => {
    if (type !== ApiMessageEntityTypes.Spoiler) {
      return accText;
    }

    const spoiler = generateBrailleSpoiler(length);

    return `${accText.slice(0, offset)}${spoiler}${accText.slice(offset + length)}`;
  }, text);
}
