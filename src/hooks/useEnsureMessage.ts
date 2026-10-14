import { createEffect } from 'frameact';
import { getActions } from '../global';
import { depsOf } from '../util/effectDeps';

import type { ApiMessage } from '../api/types';

// TODO(codemod): useEnsureMessage: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useEnsureMessage(
  chatId: string,
  messageId?: number,
  message?: ApiMessage,
  replyOriginForId?: number,
  isDisabled?: boolean,
) {
  const { loadMessage } = getActions();

  createEffect(
    depsOf(() => [isDisabled, chatId, message, messageId, replyOriginForId]),
    () => {
      if (isDisabled) return;
      if (messageId && !message) {
        loadMessage({ chatId, messageId, replyOriginForId: replyOriginForId! });
      }
    },
  );
}
