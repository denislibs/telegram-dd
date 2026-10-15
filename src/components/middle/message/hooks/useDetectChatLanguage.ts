import { type Accessor, createEffect } from 'frameact';
import { getActions } from '../../../../global';

import type { ApiMessage } from '../../../../api/types';

import { isMessageTranslatable } from '../../../../global/helpers/messages';
import { type MaybeAccessor, read } from '../../../../util/accessors';
import { depsOf } from '../../../../util/effectDeps';
import LimitedMap from '../../../../util/primitives/LimitedMap';
import { throttle } from '../../../../util/schedulers';

// https://github.com/DrKLO/Telegram/blob/dfd74f809e97d1ecad9672fc7388cb0223a95dfc/TMessagesProj/src/main/java/org/telegram/messenger/TranslateController.java#L35
const MIN_MESSAGES_CHECKED = 8;
const MIN_TRANSLATABLE_RATIO = 0.3;
const MIN_DETECTABLE_RATIO = 0.6;

const THROTTLE_DELAY = 1000;
const MESSAGES_LIMIT = 150;

type MessageMetadata = {
  id: number;
  isTranslatable: boolean;
  detectedLanguage: string | undefined;
};

const CHAT_STATS = new Map<string, LimitedMap<number, MessageMetadata>>();

// Deviation: a hook runs once. The parameters are `MaybeAccessor`s; `getIsReady` is read in the compute half (a signal
// here, not a render prop), so the message is processed when the list becomes ready. tt's effect depended on the
// identity of the message object, which changed with each edit: the translatability is computed in the compute half.
export default function useDetectChatLanguage(
  message: MaybeAccessor<ApiMessage>,
  detectedLanguage?: MaybeAccessor<string | undefined>,
  isDisabled?: MaybeAccessor<boolean | undefined>,
  getIsReady?: Accessor<boolean>,
) {
  createEffect(
    depsOf(() => {
      const isDisabled2 = read(isDisabled);
      const isReady = getIsReady ? getIsReady() : true;
      if (isDisabled2 || !isReady) return [undefined, undefined, undefined, undefined, undefined] as const;

      const message2 = read(message);
      return [
        message2.chatId,
        message2.id,
        isMessageTranslatable(message2, true),
        read(detectedLanguage),
        true,
      ] as const;
    }),
    ([chatId, id, isTranslatable, detectedLanguage2, isActive]) => {
      if (!isActive) return;

      processMessageMetadata({
        chatId,
        id,
        isTranslatable,
        detectedLanguage: detectedLanguage2,
      });
    },
  );
}

const throttledMakeChatDecision = throttle(makeChatDecision, THROTTLE_DELAY);

function processMessageMetadata({
  chatId,
  id,
  isTranslatable,
  detectedLanguage,
}: {
  chatId: string;
  id: number;
  isTranslatable: boolean;
  detectedLanguage?: string;
}) {
  const chatStats = CHAT_STATS.get(chatId) || new LimitedMap<number, MessageMetadata>(MESSAGES_LIMIT);

  const previousMetadata = chatStats.get(id);
  if (
    previousMetadata &&
    previousMetadata.detectedLanguage === detectedLanguage &&
    previousMetadata.isTranslatable === isTranslatable
  ) {
    return;
  }

  chatStats.set(id, {
    id,
    isTranslatable,
    detectedLanguage,
  });

  CHAT_STATS.set(chatId, chatStats);

  throttledMakeChatDecision(chatId);
}

function makeChatDecision(chatId: string) {
  const { updateChatDetectedLanguage } = getActions();
  const chatStats = CHAT_STATS.get(chatId);
  if (!chatStats) {
    return;
  }

  const messagesChecked = chatStats.size;
  if (messagesChecked < MIN_MESSAGES_CHECKED) {
    return;
  }

  let translatableCount = 0;
  let detectableCount = 0;
  const languageOccurrences = new Map<string, number>();

  for (const metadata of chatStats.values()) {
    if (metadata.isTranslatable) {
      translatableCount++;
    }

    if (metadata.detectedLanguage) {
      detectableCount++;
    }

    const language = metadata.detectedLanguage;
    if (language) {
      const occurrences = languageOccurrences.get(language) || 0;
      languageOccurrences.set(language, occurrences + 1);
    }
  }

  const translatableRatio = translatableCount / messagesChecked;
  const detectableRatio = detectableCount / translatableCount;

  if (translatableRatio < MIN_TRANSLATABLE_RATIO || detectableRatio < MIN_DETECTABLE_RATIO) {
    return;
  }

  const mostFrequentLanguage = Array.from(languageOccurrences.entries()).sort(([, a], [, b]) => b - a)[0][0];

  updateChatDetectedLanguage({
    chatId,
    detectedLanguage: mostFrequentLanguage,
  });
}
