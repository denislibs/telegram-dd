import { createEffect, createMemo, createSignal } from 'frameact';
import { getGlobal } from '../../../global';

import type { ThreadId } from '../../../types';

import { selectListedIds, selectOutlyingListByMessageId } from '../../../global/selectors';
import { type MaybeAccessor, read } from '../../../util/accessors';
import cycleRestrict from '../../../util/cycleRestrict';
import { depsOf } from '../../../util/effectDeps';

export type OnIntersectPinnedMessage = (params: { firstViewportId?: number; shouldCancelWaiting?: boolean }) => void;

// Deviation: the parameters are `MaybeAccessor`s, the signals are accessors.
export default function usePinnedMessage(
  chatId?: MaybeAccessor<string | undefined>,
  threadId?: MaybeAccessor<ThreadId | undefined>,
  pinnedIds?: MaybeAccessor<number[] | undefined>,
) {
  const [getPinnedIndexByKey, setPinnedIndexByKey] = createSignal<Record<string, number>>({});
  const [getLoadingPinnedId, setLoadingPinnedId] = createSignal<number | undefined>(undefined);
  const key = createMemo(() => {
    const chatId2 = read(chatId);
    return chatId2 ? `${chatId2}_${read(threadId)}` : undefined;
  });
  const getCurrentPinnedIndex = createMemo(() => getPinnedIndexByKey()[key()!] ?? 0);

  // Reset when switching chat
  createEffect(
    depsOf(() => [read(chatId), read(threadId)] as const),
    () => {
      setLoadingPinnedId(undefined);
    },
  );

  createEffect(
    depsOf(() => [getPinnedIndexByKey(), key(), read(pinnedIds)?.length] as const),
    ([pinnedIndexByKey, key2, pinnedLength0]) => {
      if (!key2) return;
      const currentPinnedIndex = pinnedIndexByKey[key2];
      const pinnedLength = pinnedLength0 || 0;
      // Deviation: skipped when the clamped index is already stored (the effect follows the signal it writes, so tt's
      // unconditional write would loop for an empty list).
      if (currentPinnedIndex >= pinnedLength && currentPinnedIndex !== clampIndex(pinnedLength - 1)) {
        setPinnedIndexByKey({
          ...pinnedIndexByKey,
          [key2]: clampIndex(pinnedLength - 1),
        });
      }
    },
  );

  const handleIntersectPinnedMessage: OnIntersectPinnedMessage = ({ firstViewportId, shouldCancelWaiting }) => {
    const chatId2 = read(chatId);
    const threadId2 = read(threadId);
    const pinnedIds2 = read(pinnedIds);
    const key2 = key();
    if (!chatId2 || !threadId2 || !key2 || !pinnedIds2?.length) return;

    if (shouldCancelWaiting) {
      setLoadingPinnedId(undefined);
      return;
    }

    const loadingPinnedId = getLoadingPinnedId();
    if (loadingPinnedId) {
      const newPinnedIndex = pinnedIds2.indexOf(loadingPinnedId);
      setPinnedIndexByKey({
        ...getPinnedIndexByKey(),
        [key2]: clampIndex(newPinnedIndex),
      });
      setLoadingPinnedId(undefined);

      // We're still scrolling, prevent updating the index
      if (loadingPinnedId < (firstViewportId || 0)) {
        return;
      }
    }

    let newIndex = pinnedIds2.findIndex((id) => id < (firstViewportId || 0));
    if (newIndex === -1) {
      newIndex = 0; // Pinned are sorted from newest to oldest
    }

    setPinnedIndexByKey({
      ...getPinnedIndexByKey(),
      [key2]: clampIndex(newIndex),
    });
  };

  const handleFocusPinnedMessage = (messageId: number) => {
    const chatId2 = read(chatId);
    const threadId2 = read(threadId);
    const pinnedIds2 = read(pinnedIds);
    // Focusing on a post in comments
    if (!chatId2 || !threadId2 || !pinnedIds2?.length) {
      return;
    }

    const global = getGlobal();
    const listedIds = selectListedIds(global, chatId2, threadId2);
    const isMessageLoaded =
      listedIds?.includes(messageId) || selectOutlyingListByMessageId(global, chatId2, threadId2, messageId);

    const currentIndex = pinnedIds2.indexOf(messageId);
    const newIndex = cycleRestrict(pinnedIds2.length, currentIndex + 1);

    if (isMessageLoaded) {
      setPinnedIndexByKey({
        ...getPinnedIndexByKey(),
        [key()!]: newIndex,
      });
    } else {
      setLoadingPinnedId(pinnedIds2[newIndex]);
    }
  };

  return {
    handleIntersectPinnedMessage,
    handleFocusPinnedMessage,
    getCurrentPinnedIndex,
    getLoadingPinnedId,
  };
}

function clampIndex(id: number) {
  return Math.max(0, id);
}
