import { createEffect, createMemo, createSignal } from 'frameact';
import { getGlobal } from '../../../global';
import { depsOf } from '../../../util/effectDeps';

import type { ThreadId } from '../../../types';

import { selectListedIds, selectOutlyingListByMessageId } from '../../../global/selectors';
import cycleRestrict from '../../../util/cycleRestrict';


export type OnIntersectPinnedMessage = (params: { firstViewportId?: number; shouldCancelWaiting?: boolean }) => void;

// TODO(codemod): usePinnedMessage: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function usePinnedMessage(chatId?: string, threadId?: ThreadId, pinnedIds?: number[]) {
  const [getPinnedIndexByKey, setPinnedIndexByKey] = createSignal<Record<string, number>>({});
  const [getLoadingPinnedId, setLoadingPinnedId] = createSignal<number | undefined>(undefined);
  const key = chatId ? `${chatId}_${threadId}` : undefined;
  const getCurrentPinnedIndex = createMemo(() => getPinnedIndexByKey()()[key!] ?? 0);

  // Reset when switching chat
  createEffect(depsOf(() => [chatId, threadId, setPinnedIndexByKey, setLoadingPinnedId]), () => {
    setLoadingPinnedId(undefined);
  });

  createEffect(depsOf(() => [getPinnedIndexByKey(), key, pinnedIds?.length, setPinnedIndexByKey] as const), ([getPinnedIndexByKey2]) => {
    if (!key) return;
    const currentPinnedIndex = getPinnedIndexByKey2()[key];
    const pinnedLength = pinnedIds?.length || 0;
    if (currentPinnedIndex >= pinnedLength) {
      setPinnedIndexByKey({
        ...getPinnedIndexByKey2(),
        [key]: clampIndex(pinnedLength - 1),
      });
    }
  });

  const handleIntersectPinnedMessage: OnIntersectPinnedMessage = ({ firstViewportId, shouldCancelWaiting }) => {
      if (!chatId || !threadId || !key || !pinnedIds?.length) return;

      if (shouldCancelWaiting) {
        setLoadingPinnedId(undefined);
        return;
      }

      const loadingPinnedId = getLoadingPinnedId()();
      if (loadingPinnedId) {
        const newPinnedIndex = pinnedIds.indexOf(loadingPinnedId);
        setPinnedIndexByKey({
          ...getPinnedIndexByKey()(),
          [key]: clampIndex(newPinnedIndex),
        });
        setLoadingPinnedId(undefined);

        // We're still scrolling, prevent updating the index
        if (loadingPinnedId < (firstViewportId || 0)) {
          return;
        }
      }

      let newIndex = pinnedIds.findIndex((id) => id < (firstViewportId || 0));
      if (newIndex === -1) {
        newIndex = 0; // Pinned are sorted from newest to oldest
      }

      setPinnedIndexByKey({
        ...getPinnedIndexByKey()(),
        [key]: clampIndex(newIndex),
      });
    };

  const handleFocusPinnedMessage = (messageId: number) => {
    // Focusing on a post in comments
    if (!chatId || !threadId || !pinnedIds?.length) {
      return;
    }

    const global = getGlobal();
    const listedIds = selectListedIds(global, chatId, threadId);
    const isMessageLoaded =
      listedIds?.includes(messageId) || selectOutlyingListByMessageId(global, chatId, threadId, messageId);

    const currentIndex = pinnedIds.indexOf(messageId);
    const newIndex = cycleRestrict(pinnedIds.length, currentIndex + 1);

    if (isMessageLoaded) {
      setPinnedIndexByKey({
        ...getPinnedIndexByKey()(),
        [key!]: newIndex,
      });
    } else {
      setLoadingPinnedId(pinnedIds[newIndex]);
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
