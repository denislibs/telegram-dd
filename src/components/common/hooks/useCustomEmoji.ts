import { createEffect, createSignal } from 'frameact';
import { getGlobal } from '../../../global';

import type { ApiSticker } from '../../../api/types';
import type { GlobalState } from '../../../global/types';

import { selectCanPlayAnimatedEmojis, selectCustomEmoji } from '../../../global/selectors';
import { type MaybeAccessor, read } from '../../../util/accessors';
import { addCustomEmojiCallback, removeCustomEmojiCallback } from '../../../util/emoji/customEmojiManager';
import ensureCustomEmoji from '../../../util/emoji/ensureCustomEmoji';

export default function useCustomEmoji(documentId?: MaybeAccessor<string | undefined>) {
  const [customEmoji, setCustomEmoji] = createSignal<ApiSticker | undefined>(
    read(documentId) ? selectCustomEmoji(getGlobal(), read(documentId)!) : undefined,
  );
  const [canPlay, setCanPlay] = createSignal(selectCanPlayAnimatedEmojis(getGlobal()));

  const handleGlobalChange = (customEmojis?: GlobalState['customEmojis']) => {
    const documentId2 = read(documentId);
    if (!documentId2) return;

    const newGlobal = getGlobal();
    setCustomEmoji((customEmojis ?? newGlobal.customEmojis).byId[documentId2]);
    setCanPlay(selectCanPlayAnimatedEmojis(newGlobal));
  };

  createEffect(
    () => read(documentId),
    (documentId2) => {
      ensureCustomEmoji(documentId2);
    },
  );

  createEffect(
    () => read(documentId),
    () => handleGlobalChange(),
  );

  createEffect(
    () => read(documentId),
    (documentId2) => {
      if (!documentId2) return undefined;

      addCustomEmojiCallback(handleGlobalChange, documentId2);

      return () => {
        removeCustomEmojiCallback(handleGlobalChange);
      };
    },
  );

  return { customEmoji, canPlay };
}
