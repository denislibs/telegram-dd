import { createEffect, createMemo } from 'frameact';
import { getActions } from '../../../../global';

import type { ChatTranslatedMessages, TranslationTone } from '../../../../types';

import { type MaybeAccessor, read } from '../../../../util/accessors';
import { depsOf } from '../../../../util/effectDeps';
import { getTranslationCacheKey, parseTranslationCacheKey } from '../../../../util/keys/translationKey';
import { throttle } from '../../../../util/schedulers';

const MESSAGE_LIMIT_PER_REQUEST = 20;
const THROTTLE_DELAY = 500;
const PENDING_TRANSLATIONS = new Map<string, Map<string, number[]>>();

// Deviation: a hook runs once. The parameters are `MaybeAccessor`s and the result fields are accessors.
export default function useMessageTranslation(
  chatTranslations: MaybeAccessor<ChatTranslatedMessages | undefined>,
  chatId?: MaybeAccessor<string | undefined>,
  messageId?: MaybeAccessor<number | undefined>,
  requestedLanguageCode?: MaybeAccessor<string | undefined>,
  tone?: MaybeAccessor<TranslationTone | undefined>,
) {
  const cacheKey = createMemo(() => {
    const languageCode = read(requestedLanguageCode);
    return languageCode ? getTranslationCacheKey(languageCode, read(tone)) : undefined;
  });
  const messageTranslation = createMemo(() => {
    const cacheKey2 = cacheKey();
    const messageId2 = read(messageId);
    return cacheKey2 && messageId2 ? read(chatTranslations)?.byLangCode[cacheKey2]?.[messageId2] : undefined;
  });

  const isPending = () => messageTranslation()?.isPending;
  const text = () => messageTranslation()?.text;
  const richMessage = () => messageTranslation()?.richMessage;

  createEffect(
    depsOf(
      () =>
        [
          read(chatId),
          text(),
          richMessage(),
          isPending(),
          read(messageId),
          cacheKey(),
          read(requestedLanguageCode),
          read(tone),
        ] as const,
    ),
    ([chatId2, text2, richMessage2, isPending2, messageId2, cacheKey2, requestedLanguageCode2, tone2]) => {
      if (!chatId2 || !messageId2 || !cacheKey2 || !requestedLanguageCode2) return;

      if (!text2 && !richMessage2 && isPending2 === undefined) {
        addPendingTranslation(chatId2, messageId2, requestedLanguageCode2, tone2);
      }
    },
  );

  const hasMessage = () => Boolean(read(chatId) && read(messageId));

  return {
    isPending: () => (hasMessage() ? isPending() : false),
    translatedText: () => (hasMessage() ? text() : undefined),
    translatedRichMessage: () => (hasMessage() ? richMessage() : undefined),
  };
}

const throttledProcessPending = throttle(processPending, THROTTLE_DELAY);

function processPending() {
  const { translateMessages } = getActions();
  let hasUnprocessed = false;

  PENDING_TRANSLATIONS.forEach((chats, cacheKey) => {
    const { languageCode, tone } = parseTranslationCacheKey(cacheKey);

    chats.forEach((messageIds, chatId) => {
      const messageIdsToTranslate = messageIds.slice(0, MESSAGE_LIMIT_PER_REQUEST);

      if (messageIdsToTranslate.length < messageIds.length) {
        hasUnprocessed = true;
      }

      translateMessages({ chatId, messageIds: messageIdsToTranslate, toLanguageCode: languageCode, tone });

      removePendingTranslations(chatId, messageIdsToTranslate, cacheKey);
    });
  });

  if (hasUnprocessed) {
    throttledProcessPending();
  }
}

function addPendingTranslation(chatId: string, messageId: number, toLanguageCode: string, tone?: TranslationTone) {
  const cacheKey = getTranslationCacheKey(toLanguageCode, tone);
  const languageTranslations = PENDING_TRANSLATIONS.get(cacheKey) || new Map<string, number[]>();
  const messageIds = languageTranslations.get(chatId) || [];

  if (messageIds.includes(messageId)) {
    throttledProcessPending();
    return;
  }

  messageIds.push(messageId);
  languageTranslations.set(chatId, messageIds);
  PENDING_TRANSLATIONS.set(cacheKey, languageTranslations);

  getActions().markMessagesTranslationPending({ chatId, messageIds, toLanguageCode, tone });

  throttledProcessPending();
}

function removePendingTranslations(chatId: string, messageIds: number[], cacheKey: string) {
  const languageTranslations = PENDING_TRANSLATIONS.get(cacheKey);
  if (!languageTranslations?.size) {
    PENDING_TRANSLATIONS.delete(cacheKey);
    return;
  }

  const oldMessageIds = languageTranslations.get(chatId);
  if (!oldMessageIds?.length) {
    languageTranslations.delete(chatId);
    return;
  }

  const newMessageIds = oldMessageIds.filter((id) => !messageIds.includes(id));

  if (!newMessageIds?.length) {
    languageTranslations.delete(chatId);
    if (!languageTranslations.size) {
      PENDING_TRANSLATIONS.delete(cacheKey);
    }
    return;
  }

  languageTranslations.set(chatId, newMessageIds);
}
