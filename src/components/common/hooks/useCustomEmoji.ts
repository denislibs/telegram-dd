import { createEffect, createSignal } from 'frameact';
import { getGlobal } from '../../../global';

import type { ApiSticker } from '../../../api/types';
import type { GlobalState } from '../../../global/types';

import { selectCanPlayAnimatedEmojis, selectCustomEmoji } from '../../../global/selectors';
import { addCustomEmojiCallback, removeCustomEmojiCallback } from '../../../util/emoji/customEmojiManager';
import ensureCustomEmoji from '../../../util/emoji/ensureCustomEmoji';

// TODO(codemod): useCustomEmoji: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useCustomEmoji(documentId?: string) {
  const [customEmoji, setCustomEmoji] = createSignal<ApiSticker | undefined>(
    (() => (documentId ? selectCustomEmoji(getGlobal(), documentId) : undefined))(),
  );
  const [canPlay, setCanPlay] = createSignal((() => selectCanPlayAnimatedEmojis(getGlobal()))());

  const handleGlobalChange = (customEmojis?: GlobalState['customEmojis']) => {
    if (!documentId) return;

    const newGlobal = getGlobal();
    setCustomEmoji((customEmojis ?? newGlobal.customEmojis).byId[documentId]);
    setCanPlay(selectCanPlayAnimatedEmojis(newGlobal));
  };

  createEffect(
    () => documentId,
    () => {
      ensureCustomEmoji(documentId);
    },
  );

  createEffect(
    () => documentId,
    () => handleGlobalChange(),
  );

  createEffect(
    () => documentId,
    () => {
      if (!documentId) return undefined;

      addCustomEmojiCallback(handleGlobalChange, documentId);

      return () => {
        removeCustomEmojiCallback(handleGlobalChange);
      };
    },
  );

  return { customEmoji, canPlay };
}
