import { createEffect } from 'frameact';
import { getActions } from '../../../global';

import type { MessageListType, ThreadId } from '../../../types';
import type { OnIntersectPinnedMessage } from './usePinnedMessage';

import { type MaybeAccessor, read } from '../../../util/accessors';
import { IS_ANDROID } from '../../../util/browser/windowEnvironment';
import { depsOf } from '../../../util/effectDeps';
import { unique } from '../../../util/iteratees';

import useAppLayout from '../../../hooks/useAppLayout';
import { useIntersectionObserver } from '../../../hooks/useIntersectionObserver';
import useBackgroundMode, { isBackgroundModeActive } from '../../../hooks/window/useBackgroundMode';

const INTERSECTION_THROTTLE_FOR_READING = 150;
const INTERSECTION_THROTTLE_FOR_MEDIA = IS_ANDROID ? 1000 : 350;

// Deviation: the reactive parameters are `MaybeAccessor`s, `containerRef` is an accessor of the scroll container.
export default function useMessageObservers({
  type,
  containerRef,
  memoFirstUnreadIdRef,
  chatId,
  threadId,
  isQuickPreview,
  onIntersectPinnedMessage,
}: {
  containerRef: () => HTMLDivElement | undefined;
  memoFirstUnreadIdRef: { current: number | undefined };
  chatId: MaybeAccessor<string>;
  threadId: MaybeAccessor<ThreadId>;
  type: MaybeAccessor<MessageListType>;
  isQuickPreview?: MaybeAccessor<boolean | undefined>;
  // A callback: pass a forwarding closure (`(params) => props.onIntersectPinnedMessage?.(params)`) if it can change.
  onIntersectPinnedMessage: OnIntersectPinnedMessage | undefined;
}) {
  const { markMessageListRead, markMentionsRead, markPollVotesRead, animateUnreadReaction, scheduleForViewsIncrement } =
    getActions();

  const { isMobile } = useAppLayout();
  const INTERSECTION_MARGIN_FOR_LOADING = isMobile() ? 300 : 500;

  let visibleViewportIdsRef: number[] = [];
  createEffect(
    depsOf(() => [read(threadId), read(chatId), read(type)] as const),
    () => {
      visibleViewportIdsRef = [];
    },
  );

  // Note: Targets bottom marker, not the message itself
  const {
    observe: observeIntersectionForReading,
    freeze: freezeForReading,
    unfreeze: unfreezeForReading,
  } = useIntersectionObserver(
    {
      rootRef: containerRef,
      throttleMs: INTERSECTION_THROTTLE_FOR_READING,
      threshold: 0,
      // `memoFirstUnreadIdRef` is set after the first render, firing callback before that can skip some entries, like the last message
      shouldSkipFirst: true,
    },
    (entries) => {
      if (read(type) !== 'thread' || isBackgroundModeActive()) {
        return;
      }

      const chatId2 = read(chatId);
      const memoFirstUnreadId = memoFirstUnreadIdRef.current;

      let maxId = 0;
      const mentionIds: number[] = [];
      const pollVoteIds: number[] = [];
      const reactionIds: number[] = [];
      const scheduledToUpdateViews: number[] = [];

      const currentVisibleViewportIds = visibleViewportIdsRef;
      const hiddenViewportIds = new Set<number>();
      const newVisibleViewportIds: number[] = [];

      entries.forEach((entry) => {
        const { isIntersecting, target } = entry;

        const { dataset } = target as HTMLDivElement;
        const messageId = Number(dataset.lastMessageId || dataset.messageId);
        const shouldUpdateViews = dataset.shouldUpdateViews === 'true';
        const albumMainId = dataset.albumMainId ? Number(dataset.albumMainId) : undefined;

        if (!Number.isInteger(messageId)) {
          return;
        }

        if (!isIntersecting) {
          hiddenViewportIds.add(messageId);
          return;
        }

        newVisibleViewportIds.push(messageId);

        if (messageId > maxId) {
          maxId = messageId;
        }

        if (dataset.hasUnreadMention) {
          mentionIds.push(messageId);
        }

        if (dataset.hasUnreadPollVote) {
          pollVoteIds.push(messageId);
        }

        if (dataset.hasUnreadReaction) {
          reactionIds.push(messageId);
        }

        if (shouldUpdateViews) {
          scheduledToUpdateViews.push(albumMainId || messageId);
        }
      });

      visibleViewportIdsRef = unique(currentVisibleViewportIds.concat(newVisibleViewportIds))
        .filter((id) => !hiddenViewportIds.has(id))
        .sort((a, b) => a - b);

      if (!read(isQuickPreview)) {
        if (memoFirstUnreadId && maxId && maxId >= memoFirstUnreadId) {
          markMessageListRead({ maxId });
        }

        if (mentionIds.length) {
          markMentionsRead({ chatId: chatId2, messageIds: mentionIds });
        }

        if (pollVoteIds.length) {
          markPollVotesRead({ chatId: chatId2, messageIds: pollVoteIds });
        }

        if (scheduledToUpdateViews.length) {
          scheduleForViewsIncrement({ chatId: chatId2, ids: scheduledToUpdateViews });
        }
      }

      if (reactionIds.length) {
        animateUnreadReaction({ chatId: chatId2, messageIds: reactionIds });
      }

      if (visibleViewportIdsRef.length) {
        onIntersectPinnedMessage?.({ firstViewportId: visibleViewportIdsRef[0] });
      }
    },
  );

  useBackgroundMode(freezeForReading, unfreezeForReading);

  const { observe: observeIntersectionForLoading } = useIntersectionObserver({
    rootRef: containerRef,
    throttleMs: INTERSECTION_THROTTLE_FOR_MEDIA,
    margin: INTERSECTION_MARGIN_FOR_LOADING,
  });

  const { observe: observeIntersectionForPlaying } = useIntersectionObserver({
    rootRef: containerRef,
    throttleMs: INTERSECTION_THROTTLE_FOR_MEDIA,
  });

  const onMessageUnmount = (messageId: number) => {
    visibleViewportIdsRef = visibleViewportIdsRef.filter((id) => id !== messageId);
  };

  return {
    observeIntersectionForReading,
    observeIntersectionForLoading,
    observeIntersectionForPlaying,
    onMessageUnmount,
  };
}
