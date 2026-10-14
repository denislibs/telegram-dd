import { createEffect } from 'frameact';
import { getActions } from '../global';

import type { ApiMessage } from '../api/types';

import { type MaybeAccessor, read } from '../util/accessors';
import { depsOf } from '../util/effectDeps';

export default function useEnsureMessage(
  chatId: MaybeAccessor<string>,
  messageId?: MaybeAccessor<number | undefined>,
  message?: MaybeAccessor<ApiMessage | undefined>,
  replyOriginForId?: MaybeAccessor<number | undefined>,
  isDisabled?: MaybeAccessor<boolean | undefined>,
) {
  const { loadMessage } = getActions();

  createEffect(
    depsOf(() => [read(isDisabled), read(chatId), read(message), read(messageId), read(replyOriginForId)] as const),
    ([isDisabled2, chatId2, message2, messageId2, replyOriginForId2]) => {
      if (isDisabled2) return;
      if (messageId2 && !message2) {
        loadMessage({ chatId: chatId2, messageId: messageId2, replyOriginForId: replyOriginForId2! });
      }
    },
  );
}
