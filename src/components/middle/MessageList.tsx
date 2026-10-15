import {
  beginHeavyAnimation,
  createEffect,
  createMeasureEffect,
  createMemo,
  createSignal,
  frameForcedReflow,
  frameMutation,
  onDestroy,
  previous,
  requestMeasure,
  requestMutation,
  untrack,
} from 'frameact';
import { addExtraClass, removeExtraClass, Show } from 'frameact/dom';
import { forceMeasure, forceMutation } from 'frameact/stricterdom';
import { getActions, getGlobal, withGlobal } from '../../global';
import { depsOf } from '../../util/effectDeps';

import type { GlobalState } from '../../global/types';
import type { OnIntersectPinnedMessage } from './hooks/usePinnedMessage';

import type { ApiChatFullInfo, ApiMessage, ApiRestrictionReason, ApiTopic } from '../../api/types';
import { MAIN_THREAD_ID } from '../../api/types';
import { LoadMoreDirection, type MessageListType, type ThreadId } from '../../types';

import {
  ANIMATION_END_DELAY,
  ANONYMOUS_USER_ID,
  IS_PERF,
  MESSAGE_LIST_SLICE,
  SCROLL_MAX_DURATION,
  SERVICE_NOTIFICATIONS_USER_ID,
} from '../../config';
import {
  getApplicableRestrictionReasons,
  getIsSavedDialog,
  getMessageHtmlId,
  getMessageOriginalId,
  isAnonymousForwardsChat,
  isChatChannel,
  isChatGroup,
  isChatMonoforum,
  isSystemBot,
} from '../../global/helpers';
import {
  selectBot,
  selectCanTranslateChat,
  selectChat,
  selectChatAnchoredMessages,
  selectChatEphemeralMessages,
  selectChatFullInfo,
  selectChatLastMessage,
  selectChatMessages,
  selectChatScheduledMessages,
  selectCurrentMessageIds,
  selectFirstUnreadId,
  selectFocusedMessageId,
  selectIsChatProtected,
  selectIsChatWithSelf,
  selectIsCurrentUserFrozen,
  selectIsCurrentUserPremium,
  selectIsInSelectMode,
  selectIsViewportNewest,
  selectMonoforumChannel,
  selectPerformanceSettingsValue,
  selectTabState,
  selectTopic,
  selectTranslationLanguage,
  selectUser,
  selectUserFullInfo,
} from '../../global/selectors';
import { selectCurrentMessageList } from '../../global/selectors/messages';
import {
  selectLastScrollOffset,
  selectScrollOffset,
  selectThreadInfo,
  selectThreadReadState,
} from '../../global/selectors/threads';
import animateScroll, { isAnimatingScroll, restartCurrentScrollAnimation } from '../../util/animateScroll';
import { IS_FIREFOX } from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';
import { isUserId } from '../../util/entities/ids';
import { buildCollectionByKey } from '../../util/iteratees';
import { isLocalMessageId } from '../../util/keys/messageKey';
import resetScroll from '../../util/resetScroll';
import { debounce, onTickEnd } from '../../util/schedulers';
import { getServerTime } from '../../util/serverTime';
import getOffsetToContainer from '../../util/visibility/getOffsetToContainer';
import { REM } from '../common/helpers/mediaDimensions';
import { groupMessages } from './helpers/groupMessages';
import { requestMessageListReflow } from './helpers/messageListReflow';
import {
  applyMessageListBottomInset,
  buildTopStackCacheKey,
  consumePendingTopGrowth,
  getEffectiveMessageListBottomReserve,
  getMessageListTopReserve,
  isSendCollapsePhaseActive,
  syncMessageListBottomReserve,
} from './helpers/messageListReserves';
import { preventMessageInputBlur } from './helpers/preventMessageInputBlur';

import useInterval from '../../hooks/schedulers/useInterval';
import useNativeCopySelectedMessages from '../../hooks/useNativeCopySelectedMessages';
import { isBackgroundModeActive } from '../../hooks/window/useBackgroundMode';
import useContainerHeight from './hooks/useContainerHeight';
import useStickyDates from './hooks/useStickyDates';

import Loading from '../ui/Loading';
import Transition from '../ui/Transition';
import ContactGreeting from './ContactGreeting';
import MessageListAccountInfo from './MessageListAccountInfo';
import MessageListContent from './MessageListContent';
import NoMessages from './NoMessages';
import RequirementToContactMessage from './RequirementToContactMessage';

import './MessageList.scss';

type OwnProps = {
  chatId: string;
  threadId: ThreadId;
  type: MessageListType;
  isComments?: boolean;
  canPost: boolean;
  hasFooter: boolean;
  isReady: boolean;
  withBottomShift?: boolean;
  withDefaultBg: boolean;
  isContactRequirePremium?: boolean;
  paidMessagesStars?: number;
  isQuickPreview?: boolean;
  onScrollDownToggle?: BooleanToVoidFunction;
  onIntersectPinnedMessage?: OnIntersectPinnedMessage;
};

type StateProps = {
  isChatLoaded?: boolean;
  isChannelChat?: boolean;
  isGroupChat?: boolean;
  isChatMonoforum?: boolean;
  isChatWithSelf?: boolean;
  isSystemBotChat?: boolean;
  isAnonymousForwards?: boolean;
  isOwner?: boolean;
  isChannelWithAvatars?: boolean;
  isBot?: boolean;
  isNonContact?: boolean;
  nameChangeDate?: number;
  photoChangeDate?: number;
  isSynced?: boolean;
  messageIds?: number[];
  messagesById?: Record<number, ApiMessage>;
  ephemeralById?: Record<number, ApiMessage>;
  anchoredById?: Record<number, ApiMessage>;
  firstUnreadId?: number;
  isViewportNewest?: boolean;
  restrictionReasons?: ApiRestrictionReason[];
  ignoreRestrictionReasons?: string[];
  focusingId?: number;
  isSelectModeActive?: boolean;
  lastMessage?: ApiMessage;
  hasLinkedChat?: boolean;
  topic?: ApiTopic;
  noMessageSendingAnimation?: boolean;
  isServiceNotificationsChat?: boolean;
  isEmptyThread?: boolean;
  isForum?: boolean;
  withTopicSeparators?: boolean;
  isBotForum?: boolean;
  currentUserId: string;
  isAccountFrozen?: boolean;
  areAdsEnabled?: boolean;
  channelJoinInfo?: ApiChatFullInfo['joinInfo'];
  isChatProtected?: boolean;
  hasCustomGreeting?: boolean;
  isAppConfigLoaded?: boolean;
  monoforumChannelId?: string;
  canTranslate?: boolean;
  translationLanguage?: string;
  shouldAutoTranslate?: boolean;
  isActive?: boolean;
  canManageBotForumTopics?: boolean;
  shouldScrollToBottom?: boolean;
  reactionPollingPause?: { until: number; chatId: string };
};

enum Content {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  Loading,
  Restricted,
  StarsRequired,
  PremiumRequired,
  AccountInfo,
  // eslint-disable-next-line @typescript-eslint/no-shadow
  ContactGreeting,
  // eslint-disable-next-line @typescript-eslint/no-shadow
  NoMessages,
  MessageList,
}

const MESSAGE_REACTIONS_POLLING_INTERVAL = 20 * 1000;
const MESSAGE_COMMENTS_POLLING_INTERVAL = 20 * 1000;
const MESSAGE_FACT_CHECK_UPDATE_INTERVAL = 5 * 1000;
const MESSAGE_STORY_POLLING_INTERVAL = 5 * 60 * 1000;

const BOTTOM_THRESHOLD = 50;
const BOTTOM_SNAP_THRESHOLD = 7;

const UNREAD_DIVIDER_TOP = 10;
const SCROLL_DEBOUNCE = 200;
const MESSAGE_ANIMATION_DURATION = 500;
// Keep join message above real ones
const CHANNEL_JOIN_MESSAGE_ID = 0.01;
const MIN_SEND_COLLAPSE_REVEAL_SHIFT = 1;
const SEND_FOCUS_DURATION = SCROLL_MAX_DURATION + ANIMATION_END_DELAY;
const BOTTOM_FOCUS_MARGIN = 0.5 * REM;
const FEW_MESSAGES_SCROLL_RISE = 4 * REM;
const SELECT_MODE_ANIMATION_DURATION = 200;

const UNREAD_DIVIDER_CLASS = 'unread-divider';
const FORCE_MESSAGES_SCROLL_CLASS = 'force-messages-scroll';
const BOTTOM_SNAP_CLASS = 'with-bottom-snap';

function compareRenderedMessages(first: ApiMessage, second: ApiMessage) {
  return first.date - second.date || first.id - second.id;
}

const runDebouncedForScroll = debounce((cb) => cb(), SCROLL_DEBOUNCE, false);

function getShouldReleaseLiveTail(liveTailElement: HTMLDivElement) {
  const liveTailMinHeight = parseFloat(getComputedStyle(liveTailElement).minHeight);

  return Boolean(liveTailMinHeight && liveTailElement.scrollHeight > liveTailMinHeight + 1);
}

const MessageList = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const {
    loadViewportMessages,
    setScrollOffset,
    loadSponsoredMessages,
    loadMessageReactions,
    copyMessagesByIds,
    loadMessageViews,
    loadPeerStoriesByIds,
    loadFactChecks,
    requestChatTranslation,
  } = getActions();

  const restrictionReasons = createMemo(() =>
    getApplicableRestrictionReasons(props.restrictionReasons, props.ignoreRestrictionReasons),
  );
  const isRestricted = createMemo(() => restrictionReasons().length > 0);

  let containerRef!: HTMLDivElement;

  // Deviation: `createEffect(..., frameMutation)`, not `createMutationEffect`: the container is the `Transition` root, which
  // gets its ref after the creation, and a mutation effect applies at creation (engine gap #4 of the chat list report).
  createEffect(
    depsOf(() => [props.chatId, props.threadId, props.type] as const),
    ([chatId2, threadId2, type2]) => {
      const container = containerRef;
      if (container) container.dataset.listKey = buildTopStackCacheKey(chatId2, threadId2, type2);
    },
    frameMutation,
  );

  // We update local cached `scrollOffsetRef` when opening chat.
  // Then we update global version every second on scrolling.
  let scrollOffsetRef: number =
    (props.type === 'thread' &&
      (selectScrollOffset(getGlobal(), props.chatId, props.threadId) ||
        selectLastScrollOffset(getGlobal(), props.chatId, props.threadId))) ||
    0;

  // Deviation: the four refs that are handed to `MessageListContent` / the message observers stay `{ current }` boxes
  // (shared mutable state, not reactive, as in tt); the others are plain variables of the component body.
  const anchorIdRef: { current: string | undefined } = { current: undefined };
  let anchorTopRef: number | undefined;
  let listItemElementsRef: HTMLDivElement[] | undefined;
  const memoFirstUnreadIdRef: { current: number | undefined } = { current: props.firstUnreadId };
  const memoUnreadDividerBeforeIdRef: { current: number | undefined } = { current: undefined };
  let isScrollTopJustUpdatedRef = false;
  let forceMessagesScrollTimerRef: number | undefined;
  // Suppresses spurious load-more triggers caused by Safari delivering stale
  // `IntersectionObserver` entries between DOM mutation and scroll restore
  const isReplacingHistoryRef: { current: boolean } = { current: false };
  let shouldAnimateAppearanceRef = Boolean(props.lastMessage);
  let scrollSnapDisabledTimerRef: number | undefined;
  let isLiveTailBottomSnapSuppressedRef = false;
  let isLiveTailAutoScrollingRef = false;
  let liveTailReleaseTimerRef: number | undefined;
  let liveTailStartOriginalIdRef: number | undefined;
  let scrollTopBeforeUpdateRef: number | undefined;
  const [releasedLiveTailStartOriginalId, setReleasedLiveTailStartOriginalId] = createSignal<number | undefined>(
    undefined,
  );

  const isSavedDialog = createMemo(() => getIsSavedDialog(props.chatId, props.threadId, props.currentUserId));
  const hasOpenChatButton = createMemo(
    () => isSavedDialog() && props.threadId !== ANONYMOUS_USER_ID && props.threadId !== props.currentUserId,
  );

  const areMessagesLoaded = createMemo(() => Boolean(props.messageIds));

  // The containers (`messagesById`, `anchoredById`, `ephemeralById`) are store proxies that keep their identity: the
  // memo reads the entries it needs (`messagesById[id]` per listed id, the keys of `ephemeralById`), which are its
  // subscriptions (store contract §12.7).
  const renderData = createMemo(() => {
    const messageIds = props.messageIds;
    const messagesById = props.messagesById;
    if (props.type !== 'thread' || !messageIds || !messagesById) {
      return {
        renderMessageIds: messageIds,
        renderMessagesById: messagesById,
      };
    }

    const normalMessages = messageIds.map((id) => props.anchoredById?.[id] || messagesById[id]).filter(Boolean);
    const normalDates = normalMessages.map(({ date }) => date);
    const oldestDate = normalDates.length ? Math.min(...normalDates) : undefined;
    const newestDate = normalDates.length ? Math.max(...normalDates) : undefined;
    const currentThreadId = Number(props.threadId);
    const ephemeralMessages = Object.values(props.ephemeralById || {}).filter((message) => {
      if (message.anchorMsgId) return false;
      const isInThread =
        currentThreadId === MAIN_THREAD_ID
          ? message.ephemeralTopMsgId === undefined
          : message.ephemeralTopMsgId === currentThreadId;
      if (!isInThread) return false;
      if (!normalMessages.length) return Boolean(props.isViewportNewest);
      return message.date >= oldestDate! && (message.date <= newestDate! || Boolean(props.isViewportNewest));
    });
    const renderMessages = normalMessages.concat(ephemeralMessages).sort(compareRenderedMessages);

    return {
      renderMessageIds: renderMessages.map(({ id }) => id),
      renderMessagesById: buildCollectionByKey(renderMessages, 'id'),
    };
  });
  const renderDataResult = createMemo(() => renderData());
  const renderMessageIds = () => renderDataResult().renderMessageIds;
  const renderMessagesById = () => renderDataResult().renderMessagesById;
  const previousRenderMessageIds = previous(() => renderMessageIds());
  const addedMessageInfo = createMemo(() =>
    props.isViewportNewest
      ? getAddedMessageInfo(renderMessageIds(), renderMessagesById(), previousRenderMessageIds())
      : undefined,
  );
  const source = createMemo(
    (): Partial<NonNullable<ReturnType<typeof getAddedMessageInfo>>> => addedMessageInfo() || {},
  );
  const addedMessageIds = () => source().addedMessageIds;
  const areAddedMessagesOutgoing = () => source().areAddedMessagesOutgoing;
  const previousLastCurrentMessageId = () => source().previousLastCurrentMessageId;

  const isPrivate = createMemo(() => isUserId(props.chatId));
  const withUsers = createMemo(() =>
    Boolean(
      (!isPrivate() && !props.isChannelChat) ||
      props.isChatWithSelf ||
      props.isSystemBotChat ||
      props.isAnonymousForwards ||
      props.isChannelWithAvatars,
    ),
  );

  // Deviation: tt kept the last result in `liveTailStartOriginalIdRef` (assigned on every render); the memo records its own
  // result for the next run.
  const computeLiveTailStartOriginalId = (): number | undefined => {
    const messageIds = props.messageIds;
    const messagesById = props.messagesById;
    if (!messageIds?.length || !messagesById) {
      return undefined;
    }

    const previousLiveTailStartOriginalId = liveTailStartOriginalIdRef;
    const hasActiveLiveTail =
      previousLiveTailStartOriginalId !== undefined &&
      previousLiveTailStartOriginalId !== releasedLiveTailStartOriginalId();
    let renderedLiveTailStartOriginalId: number | undefined;

    for (let i = messageIds.length - 1; i >= 0; i--) {
      const message = messagesById[messageIds[i]];
      if (!message) {
        continue;
      }

      const originalId = getMessageOriginalId(message);
      if (hasActiveLiveTail && message.isOutgoing && originalId >= previousLiveTailStartOriginalId) {
        return originalId;
      }

      if (message.isTypingDraft && !message.isOutgoing) {
        if (hasActiveLiveTail && originalId === previousLiveTailStartOriginalId) {
          renderedLiveTailStartOriginalId = previousLiveTailStartOriginalId;
          continue;
        }

        if (hasActiveLiveTail) {
          continue;
        }

        // Start new live tail from our message to keep consistency with in-tail focusing
        const previousMessage = i > 0 ? messagesById[messageIds[i - 1]] : undefined;
        if (previousMessage?.isOutgoing) {
          return getMessageOriginalId(previousMessage);
        }

        return originalId;
      }

      if (
        previousLiveTailStartOriginalId !== undefined &&
        message.wasTypingDraft &&
        originalId === previousLiveTailStartOriginalId
      ) {
        renderedLiveTailStartOriginalId = previousLiveTailStartOriginalId;
      }
    }

    return renderedLiveTailStartOriginalId;
  };
  const liveTailStartOriginalId = createMemo(() => {
    const result = computeLiveTailStartOriginalId();
    liveTailStartOriginalIdRef = result;
    return result;
  });

  const effectiveLiveTailStartOriginalId = createMemo(() =>
    liveTailStartOriginalId() !== releasedLiveTailStartOriginalId() ? liveTailStartOriginalId() : undefined,
  );

  onDestroy(() => {
    clearTimeout(forceMessagesScrollTimerRef);
    clearTimeout(liveTailReleaseTimerRef);
  });

  // We only need it first time when message list appears
  // Deviation: tt cleared the flag at the tick end of the render that created the content. The content is created in
  // the mutate phase of the next frame here, so the flag is cleared one frame after that.
  createEffect(
    () => areMessagesLoaded(),
    (areMessagesLoaded2) => {
      if (areMessagesLoaded2) {
        requestMeasure(() => {
          requestMeasure(() => {
            shouldAnimateAppearanceRef = false;
          });
        });
      }
    },
  );

  // Updated every time (to be used from intersection callback closure)
  // Deviation: set at the tick end (tt: during the render); the initial value is read at the creation.
  createEffect(
    () => props.firstUnreadId,
    (firstUnreadId2) => {
      memoFirstUnreadIdRef.current = firstUnreadId2;
    },
  );

  const canShowSponsoredMessages = createMemo(() => Boolean(props.areAdsEnabled && props.type === 'thread'));

  createEffect(
    depsOf(
      () =>
        [
          props.chatId,
          props.isSynced,
          props.isReady,
          props.isChannelChat,
          props.isBot,
          canShowSponsoredMessages(),
          props.isAppConfigLoaded,
        ] as const,
    ),
    ([chatId2, isSynced2, isReady2, isChannelChat2, isBot2, canShowSponsoredMessages2, isAppConfigLoaded2]) => {
      const canHaveAds = isChannelChat2 || isBot2;
      if (canShowSponsoredMessages2 && canHaveAds && isSynced2 && isReady2 && isAppConfigLoaded2) {
        loadSponsoredMessages({ peerId: chatId2 });
      }
    },
  );

  // Updated only once when messages are loaded (as we want the unread divider to keep its position)
  // Deviation: a memo (tt: a sync effect run before `groupMessages` in the same render) that is read by `messageGroups`;
  // `memoUnreadDividerBeforeIdRef.current` follows it.
  const unreadDividerBeforeId = createMemo(() => {
    if (areMessagesLoaded()) memoUnreadDividerBeforeIdRef.current = untrack(() => props.firstUnreadId);
    return memoUnreadDividerBeforeIdRef.current;
  });
  // tt's `memoFocusingIdRef` is `props.focusingId` read where it is used.

  // Enable auto translation for the chat if it's available
  createEffect(
    depsOf(() => [props.shouldAutoTranslate, props.canTranslate, props.translationLanguage, props.chatId] as const),
    ([shouldAutoTranslate2, canTranslate2, translationLanguage2, chatId2]) => {
      if (!shouldAutoTranslate2 || !canTranslate2) return;
      requestChatTranslation({ chatId: chatId2, toLanguageCode: translationLanguage2 });
    },
  );

  useNativeCopySelectedMessages(
    () => props.isActive,
    () => props.chatId,
    () => props.threadId,
    () => props.type,
    copyMessagesByIds,
  );

  // `channelJoinInfo` is read field by field (a store container keeps its identity: the reads are the subscriptions).
  const messageGroups = createMemo(() => {
    const ids = renderMessageIds();
    const messagesById = renderMessagesById();
    if (!ids?.length || !messagesById) {
      return undefined;
    }

    const listedMessages: ApiMessage[] = [];
    ids.forEach((id, index, arr) => {
      const prevMessage = listedMessages[listedMessages.length - 1];

      const message = messagesById[id];
      if (!message) {
        return;
      }

      const { shouldAppendJoinMessage, shouldAppendJoinMessageAfterCurrent } =
        (() => {
          if (!props.channelJoinInfo || props.type !== 'thread') return undefined;
          if (
            prevMessage &&
            prevMessage.date < props.channelJoinInfo.joinedDate &&
            props.channelJoinInfo.joinedDate <= message.date
          ) {
            return { shouldAppendJoinMessage: true, shouldAppendJoinMessageAfterCurrent: false };
          }

          if (index === arr.length - 1 && message.date < props.channelJoinInfo.joinedDate) {
            return {
              shouldAppendJoinMessage: true,
              shouldAppendJoinMessageAfterCurrent: true,
            };
          }

          return undefined;
        })() || {};

      if (shouldAppendJoinMessageAfterCurrent) {
        listedMessages.push(message);
      }

      if (shouldAppendJoinMessage) {
        listedMessages.push({
          id: CHANNEL_JOIN_MESSAGE_ID,
          chatId: message.chatId,
          date: props.channelJoinInfo!.joinedDate,
          isOutgoing: false,
          content: {
            action: {
              mediaType: 'action',
              type: 'channelJoined',
              inviterId: props.channelJoinInfo?.inviterId,
              isViaRequest: props.channelJoinInfo?.isViaRequest || undefined,
            },
          },
        } satisfies ApiMessage);
      }

      if (!shouldAppendJoinMessageAfterCurrent) {
        listedMessages.push(message);
      }
    });

    // Service notifications have local IDs which may be not in sync with real message history
    return listedMessages.length
      ? groupMessages(
          listedMessages.sort(compareRenderedMessages),
          unreadDividerBeforeId(),
          !props.isForum ? Number(props.threadId) : undefined,
          props.isChatWithSelf,
          withUsers(),
          effectiveLiveTailStartOriginalId(),
          props.withTopicSeparators,
        )
      : undefined;
  });

  const currentLastMessageId = createMemo(() => {
    const ids = renderMessageIds();
    return ids?.[ids.length - 1];
  });
  const currentLastMessage = createMemo(() => {
    const id = currentLastMessageId();
    return id !== undefined ? renderMessagesById()?.[id] : undefined;
  });
  const currentLastMessageOriginalId = createMemo(() => {
    const message = currentLastMessage();
    return message ? getMessageOriginalId(message) : currentLastMessageId();
  });
  const isCurrentLastMessageTypingDraft = createMemo(() =>
    Boolean(currentLastMessage()?.isTypingDraft || currentLastMessage()?.wasTypingDraft),
  );
  const isCurrentLastMessageIncomingTypingDraft = createMemo(() => {
    const message = currentLastMessage();
    return Boolean(message?.isTypingDraft && !message.isOutgoing);
  });
  const isCurrentLastMessageOwnSent = createMemo(() => Boolean(currentLastMessage()?.isOutgoing));

  useInterval(() => {
    if (
      !props.messageIds ||
      !props.messagesById ||
      props.type === 'scheduled' ||
      props.isAccountFrozen ||
      !props.isActive
    )
      return;
    if (!props.isChannelChat && !props.isGroupChat) return;
    if (props.reactionPollingPause?.chatId === props.chatId && props.reactionPollingPause.until > getServerTime())
      return;

    const messagesById = props.messagesById;
    const ids = props.messageIds.filter((id) => {
      const message = messagesById[id];
      return message && message.reactions && !message.content.action;
    });

    if (!ids.length) return;

    loadMessageReactions({ chatId: props.chatId, ids });
  }, MESSAGE_REACTIONS_POLLING_INTERVAL);

  useInterval(() => {
    if (!props.messageIds || !props.messagesById || props.type === 'scheduled' || !props.isActive) {
      return;
    }
    const messagesById = props.messagesById;
    const storyDataList = props.messageIds.map((id) => messagesById[id]?.content.storyData).filter(Boolean);

    if (!storyDataList.length) return;

    const storiesByPeerIds = storyDataList.reduce(
      (acc, storyData) => {
        const { peerId, id } = storyData;
        if (!acc[peerId]) {
          acc[peerId] = [];
        }
        acc[peerId].push(id);
        return acc;
      },
      {} as Record<string, number[]>,
    );

    Object.entries(storiesByPeerIds).forEach(([peerId, storyIds]) => {
      loadPeerStoriesByIds({ peerId, storyIds });
    });
  }, MESSAGE_STORY_POLLING_INTERVAL);

  useInterval(
    () => {
      if (
        !props.messageIds ||
        !props.messagesById ||
        props.threadId !== MAIN_THREAD_ID ||
        props.type === 'scheduled' ||
        !props.isActive
      ) {
        return;
      }
      const global = getGlobal();
      const messagesById = props.messagesById;
      const ids = props.messageIds.filter(
        (id) =>
          selectThreadInfo(global, props.chatId, id)?.isCommentsInfo || messagesById[id]?.viewsCount !== undefined,
      );

      if (!ids.length) return;

      loadMessageViews({ chatId: props.chatId, ids });
    },
    MESSAGE_COMMENTS_POLLING_INTERVAL,
    true,
  );

  useInterval(() => {
    if (
      !props.messageIds ||
      !props.messagesById ||
      props.threadId !== MAIN_THREAD_ID ||
      props.type === 'scheduled' ||
      !props.isActive
    ) {
      return;
    }
    const messagesById = props.messagesById;
    const ids = props.messageIds.filter((id) => messagesById[id]?.factCheck?.shouldFetch);

    if (!ids.length) return;

    loadFactChecks({ chatId: props.chatId, ids });
  }, MESSAGE_FACT_CHECK_UPDATE_INTERVAL);

  // Recreated (its debounce state is reset) when the listed ids change, as in tt (`[loadViewportMessages, messageIds]`).
  const loadMoreAround = createMemo(() => {
    void props.messageIds;
    if (props.type !== 'thread') {
      return undefined;
    }

    return debounce(
      () =>
        loadViewportMessages({ direction: LoadMoreDirection.Around, chatId: props.chatId, threadId: props.threadId }),
      1000,
      true,
      false,
    );
  });

  const { isScrolled, updateStickyDates } = useStickyDates();

  const updateBottomSnapClass = () => {
    const container = containerRef;
    const bottomTrigger = container?.querySelector<HTMLDivElement>('.fab-trigger');
    if (!container || !bottomTrigger) return;

    if (effectiveLiveTailStartOriginalId() !== undefined && isLiveTailBottomSnapSuppressedRef) {
      requestMutation(() => {
        removeExtraClass(container, BOTTOM_SNAP_CLASS);
      });
      return;
    }

    // Check if fab-trigger + threshold are entering the viewport. The bottom reserve keeps
    // the content above the absolute footer, so the content bottom is above the scrollport bottom
    const viewportBottom =
      container.scrollTop + container.offsetHeight - getEffectiveMessageListBottomReserve(container);
    const triggerPosition = bottomTrigger.offsetTop;
    // Scroll is near fab-trigger + threshold. Prevents snap on sponsored message
    const shouldSnapBeActive =
      triggerPosition - BOTTOM_SNAP_THRESHOLD <= viewportBottom &&
      viewportBottom <= triggerPosition + BOTTOM_SNAP_THRESHOLD * 2;

    const hasSnap = container.classList.contains(BOTTOM_SNAP_CLASS);
    if (hasSnap === shouldSnapBeActive) return;

    if (shouldSnapBeActive) {
      requestMutation(() => {
        addExtraClass(container, BOTTOM_SNAP_CLASS);
      });
    } else {
      clearTimeout(scrollSnapDisabledTimerRef);
      scrollSnapDisabledTimerRef = undefined;
      requestMutation(() => {
        removeExtraClass(container, BOTTOM_SNAP_CLASS);
      });
    }
  };

  const allowLiveTailBottomSnap = () => {
    if (effectiveLiveTailStartOriginalId() === undefined || !isLiveTailBottomSnapSuppressedRef) {
      return;
    }

    isLiveTailBottomSnapSuppressedRef = false;
    updateBottomSnapClass();
  };

  const handleScroll = () => {
    if (isScrollTopJustUpdatedRef) {
      isScrollTopJustUpdatedRef = false;
      return;
    }

    const container = containerRef;
    if (!container) {
      return;
    }

    if (!props.focusingId) {
      updateStickyDates(container);
    }

    if (isLiveTailAutoScrollingRef) {
      if (!isAnimatingScroll(container)) {
        requestMeasure(() => {
          isLiveTailAutoScrollingRef = false;
        });
      }
    } else {
      allowLiveTailBottomSnap();
    }

    // Check if scroll should be snapped, but only if there's no new message animation in progress
    if (scrollSnapDisabledTimerRef === undefined) {
      updateBottomSnapClass();
    }

    runDebouncedForScroll(() => {
      const global = getGlobal();

      const isFocusing = Boolean(selectTabState(global).focusedMessage?.chatId);
      if (!isFocusing) {
        props.onIntersectPinnedMessage?.({ shouldCancelWaiting: true });
      }

      if (!container.parentElement) {
        return;
      }

      scrollOffsetRef = container.scrollHeight - container.scrollTop;

      if (props.type === 'thread' && !props.isQuickPreview) {
        setScrollOffset({ chatId: props.chatId, threadId: props.threadId, scrollOffset: scrollOffsetRef });
      }
    });
  };

  let isMessageSendPendingRef = false;

  const handleContentResize = (growth: number) => {
    const container = containerRef;
    if (!container || growth <= 0) return;

    const effectiveGrowth = growth - consumePendingTopGrowth(container);
    if (effectiveGrowth <= 0) return;

    if (
      isLiveTailAutoScrollingRef ||
      (effectiveLiveTailStartOriginalId() !== undefined && isLiveTailBottomSnapSuppressedRef) ||
      isScrollTopJustUpdatedRef ||
      isReplacingHistoryRef.current
    ) {
      return;
    }

    // Retarget active glides before ignoring send-pending resizes
    if (isAnimatingScroll(container)) {
      restartCurrentScrollAnimation();
      return;
    }

    if (isMessageSendPendingRef) {
      return;
    }

    const { scrollTop, scrollHeight, offsetHeight } = container;
    const wasAtBottom = scrollHeight - scrollTop - offsetHeight - effectiveGrowth <= BOTTOM_THRESHOLD;
    if (!wasAtBottom || !props.isViewportNewest) return;

    forceMutation(() => {
      resetScroll(container, scrollHeight - offsetHeight);
      scrollOffsetRef = offsetHeight;
      isScrollTopJustUpdatedRef = true;
      requestMeasure(() => {
        isScrollTopJustUpdatedRef = false;
      });
    }, [container]);
  };

  const [getContainerHeight, prevContainerHeightRef] = useContainerHeight(
    () => containerRef,
    () => props.canPost && !props.isSelectModeActive,
  );

  const handleWheel = (e: WheelEvent) => {
    if (e.deltaY > 0) {
      isLiveTailAutoScrollingRef = false;
      allowLiveTailBottomSnap();
    }

    // Remove snap when scrolling up to avoid scroll bug
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1753188
    if (IS_FIREFOX && e.deltaY < 0) {
      const container = containerRef;
      if (!container) return;

      requestMutation(() => {
        removeExtraClass(container, BOTTOM_SNAP_CLASS);
      });
    }
  };

  // Initial message loading
  createMeasureEffect(
    depsOf(() => [props.isChatLoaded, props.messageIds, loadMoreAround(), props.focusingId, isRestricted()] as const),
    ([isChatLoaded2, messageIds2, loadMoreAround2, focusingId2, isRestricted2]) => {
      if (!loadMoreAround2 || !isChatLoaded2 || isRestricted2 || focusingId2) {
        return;
      }

      // Loading history while sending a message can return the same message and cause ambiguity
      const isLastMessageLocal = messageIds2 && isLocalMessageId(messageIds2[messageIds2.length - 1]);
      if (isLastMessageLocal) {
        return;
      }

      const container = containerRef!;

      if (
        !messageIds2 ||
        messageIds2.length === 1 ||
        (messageIds2.length < MESSAGE_LIST_SLICE / 2 &&
          (container.firstElementChild as HTMLDivElement).clientHeight <= container.offsetHeight)
      ) {
        loadMoreAround2();
      }
    },
  );

  const rememberScrollPosition = () => {
    if (!renderMessageIds() || !listItemElementsRef) {
      return;
    }

    const renderMessageIdSet = new Set(renderMessageIds());
    const preservedItemElements = listItemElementsRef.filter((element) =>
      renderMessageIdSet.has(Number(element.dataset.messageId)),
    );

    // We avoid the very first item as it may be a partly-loaded album
    // and also because it may be removed when messages limit is reached
    const anchor = preservedItemElements[1] || preservedItemElements[0];
    if (!anchor) {
      return;
    }

    anchorIdRef.current = anchor.id;
    anchorTopRef = anchor.getBoundingClientRect().top;
  };

  // Deviation: the snapshot of the scroll position before the update (tt: `useSyncEffect` + `forceMeasure` during the
  // render that changes the ids) is a measure effect: it runs in the measure phase of the frame in which the ids change,
  // before the mutate phase that updates the DOM. `deps` match the reflow effect below.
  createMeasureEffect(
    depsOf(() => [renderMessageIds(), props.isViewportNewest, effectiveLiveTailStartOriginalId()] as const),
    () => {
      isReplacingHistoryRef.current = true;
      scrollTopBeforeUpdateRef = containerRef?.scrollTop;
      rememberScrollPosition();
    },
  );
  // tt: `useEffect(..., [getContainerHeight])` re-ran when the signal changed
  createMeasureEffect(
    () => getContainerHeight(),
    () => rememberScrollPosition(),
  );

  /* Handles updated message list, takes care of scroll repositioning
    Live tail mode:
    - When a new typing draft is received, the live tail is revealed
    - New messages attach to it. New outgoing message kick older out
    - If outgoing message is tall, we should show at least one line of typing draft that replies to it
  */
  // Deviation: tt's `useLayoutEffectWithPrevDeps` runs after the DOM update of its render, before paint. Here it is a
  // forced-reflow effect (after the mutate phase of the frame in which the ids change); the measuring and the scroll
  // write stay in `requestMessageListReflow` (a forced-reflow task whose returned function is the mutation), and the two
  // direct class writes go through `forceMutation`.
  createEffect(
    depsOf(
      () =>
        [
          props.messageIds,
          renderMessageIds(),
          props.isViewportNewest,
          effectiveLiveTailStartOriginalId(),
          currentLastMessageOriginalId(),
          currentLastMessageId(),
          addedMessageIds(),
          areAddedMessagesOutgoing(),
          previousLastCurrentMessageId(),
          isCurrentLastMessageTypingDraft(),
          isCurrentLastMessageIncomingTypingDraft(),
          isCurrentLastMessageOwnSent(),
          getContainerHeight(),
          props.noMessageSendingAnimation,
        ] as const,
    ),
    (_deps, prev) => {
      const [prevMessageIds, prevRenderMessageIds, prevIsViewportNewest, prevLiveTailStartOriginalId] = prev ?? [];
      if (IS_PERF) {
        // eslint-disable-next-line no-console
        console.time('scrollTop');
      }

      const containerHeight = getContainerHeight();
      const prevContainerHeight = prevContainerHeightRef.current;
      prevContainerHeightRef.current = containerHeight;

      // Skip initial resize observer callback
      if (
        renderMessageIds() === prevRenderMessageIds &&
        props.isViewportNewest === prevIsViewportNewest &&
        containerHeight !== prevContainerHeight &&
        prevContainerHeight === undefined
      ) {
        return;
      }

      const container = containerRef!;
      const listItemElements = Array.from(container.querySelectorAll<HTMLDivElement>('.message-list-item'));
      listItemElementsRef = listItemElements;
      const lastItemElement = listItemElements[listItemElements.length - 1];
      const firstUnreadElement = memoFirstUnreadIdRef.current
        ? container.querySelector<HTMLDivElement>(`#${getMessageHtmlId(memoFirstUnreadIdRef.current)}`)
        : undefined;

      const firstMessageId = props.messageIds?.[0];
      const prevFirstMessageId = prevMessageIds?.[0];
      const hasLoadedMessageIds = Boolean(renderMessageIds()?.length && prevRenderMessageIds?.length);
      const hasViewportShifted =
        firstMessageId !== prevFirstMessageId && props.messageIds?.length === MESSAGE_LIST_SLICE / 2 + 1;

      const wasMessageAdded = hasLoadedMessageIds && Boolean(addedMessageIds()?.length) && !hasViewportShifted;
      const wasLiveTailCreated = Boolean(
        effectiveLiveTailStartOriginalId() !== undefined &&
        effectiveLiveTailStartOriginalId() !== prevLiveTailStartOriginalId,
      );
      const hasLiveTail = effectiveLiveTailStartOriginalId() !== undefined;
      const shouldRevealLiveTailTypingDraft = Boolean(
        wasMessageAdded && hasLiveTail && !wasLiveTailCreated && isCurrentLastMessageIncomingTypingDraft(),
      );

      if (wasLiveTailCreated || shouldRevealLiveTailTypingDraft) {
        isLiveTailBottomSnapSuppressedRef = true;
      } else if (!hasLiveTail) {
        isLiveTailBottomSnapSuppressedRef = false;
      }

      const shouldReleaseLiveTail = Boolean(
        wasMessageAdded &&
        currentLastMessageOriginalId() !== undefined &&
        hasLiveTail &&
        !wasLiveTailCreated &&
        !isCurrentLastMessageTypingDraft() &&
        forceMeasure(() => {
          const liveTailElement = container.querySelector<HTMLDivElement>('.live-tail');
          return liveTailElement ? getShouldReleaseLiveTail(liveTailElement) : false;
        }),
      );

      const isFirstLoadWithSend = !prevRenderMessageIds?.length && Boolean(renderMessageIds()?.length);
      const isInSendCollapsePhase =
        (wasMessageAdded ? areAddedMessagesOutgoing() : isCurrentLastMessageOwnSent()) &&
        (wasMessageAdded || isFirstLoadWithSend) &&
        isSendCollapsePhaseActive(container);

      const messageListParent = container.parentElement!;
      const hasForcedMessagesScroll = messageListParent.classList.contains(FORCE_MESSAGES_SCROLL_CLASS);
      // Add extra height when few messages to allow scroll animation
      if (
        props.isViewportNewest &&
        wasMessageAdded &&
        !hasLiveTail &&
        !isInSendCollapsePhase &&
        (hasForcedMessagesScroll ||
          (renderMessageIds()!.length < MESSAGE_LIST_SLICE / 2 &&
            forceMeasure(
              () => (container.firstElementChild as HTMLDivElement).clientHeight <= container.offsetHeight * 2,
            )))
      ) {
        forceMutation(() => {
          addExtraClass(messageListParent, FORCE_MESSAGES_SCROLL_CLASS);
        }, messageListParent);

        clearTimeout(forceMessagesScrollTimerRef);
        forceMessagesScrollTimerRef = window.setTimeout(() => {
          forceMessagesScrollTimerRef = undefined;
          requestMutation(() => {
            removeExtraClass(messageListParent, FORCE_MESSAGES_SCROLL_CLASS);
          });
        }, SEND_FOCUS_DURATION);
      }

      if (wasMessageAdded) {
        isMessageSendPendingRef = true;
        clearTimeout(scrollSnapDisabledTimerRef);
        scrollSnapDisabledTimerRef = undefined;

        forceMutation(() => {
          removeExtraClass(container, BOTTOM_SNAP_CLASS);
        }, container);

        scrollSnapDisabledTimerRef = window.setTimeout(() => {
          scrollSnapDisabledTimerRef = undefined;
          isMessageSendPendingRef = false;
          updateBottomSnapClass();
        }, MESSAGE_ANIMATION_DURATION);
      }

      requestMessageListReflow(() => {
        const { scrollTop, scrollHeight, offsetHeight } = container;
        const scrollOffset = scrollOffsetRef;
        const bottomReserve = getEffectiveMessageListBottomReserve(container);
        const messagesContainerEl = container.querySelector<HTMLElement>('.messages-container');
        const currentBottomInset = messagesContainerEl
          ? parseFloat(getComputedStyle(messagesContainerEl).paddingBottom) || 0
          : 0;
        const reserveDelta = bottomReserve - currentBottomInset;
        const effectiveScrollHeight = scrollHeight + reserveDelta;

        let bottomOffset = scrollOffset - (prevContainerHeight || offsetHeight);
        const prevLastItemElement =
          previousLastCurrentMessageId() !== undefined
            ? listItemElements.find(
                ({ dataset }) => Number(dataset.lastMessageId || dataset.messageId) === previousLastCurrentMessageId(),
              )
            : undefined;
        const addedMessageIdSet = new Set(addedMessageIds() || []);
        const addedMessagesHeight = wasMessageAdded
          ? listItemElements.reduce((height, element) => {
              const elementMessageId = Number(element.dataset.lastMessageId || element.dataset.messageId);
              return addedMessageIdSet.has(elementMessageId) ? height + element.offsetHeight : height;
            }, 0)
          : 0;
        const addedTailHeight =
          wasMessageAdded && lastItemElement && prevLastItemElement
            ? Math.max(
                lastItemElement.getBoundingClientRect().bottom - prevLastItemElement.getBoundingClientRect().bottom,
                addedMessagesHeight,
              )
            : addedMessagesHeight;
        if (wasMessageAdded) {
          bottomOffset -= addedTailHeight;
        }
        const isAtBottom = props.isViewportNewest && prevIsViewportNewest && bottomOffset <= BOTTOM_THRESHOLD;
        const wasAtBottomBeforeTypingDraft = Boolean(
          shouldRevealLiveTailTypingDraft &&
          props.isViewportNewest &&
          prevIsViewportNewest &&
          scrollHeight - addedTailHeight - scrollTop - offsetHeight <= BOTTOM_THRESHOLD,
        );
        const shouldFocusLiveTail = wasLiveTailCreated && isAtBottom;
        const shouldRevealTypingDraft = Boolean(
          shouldRevealLiveTailTypingDraft && (isAtBottom || wasAtBottomBeforeTypingDraft),
        );

        const isAlreadyFocusing = currentLastMessageId() !== undefined && props.focusingId === currentLastMessageId();

        // Animate incoming message, but if app is in background mode, scroll to the first unread
        if (
          wasMessageAdded &&
          isAtBottom &&
          (!isAlreadyFocusing || shouldReleaseLiveTail) &&
          (!hasLiveTail || shouldReleaseLiveTail)
        ) {
          // Break out of `forceLayout`
          requestMeasure(() => {
            const isScrollToBottom = !isBackgroundModeActive() || !firstUnreadElement;
            const topReserve = getMessageListTopReserve(container);
            const isFewMessagesScroll = container.parentElement?.classList.contains(FORCE_MESSAGES_SCROLL_CLASS);
            const maxDistance = isFewMessagesScroll && isScrollToBottom ? FEW_MESSAGES_SCROLL_RISE : undefined;
            animateScroll({
              container,
              element: isScrollToBottom ? lastItemElement : firstUnreadElement,
              position: isScrollToBottom ? 'end' : 'start',
              margin: BOTTOM_FOCUS_MARGIN + (isScrollToBottom ? bottomReserve : topReserve),
              topReserve,
              bottomReserve,
              maxDistance,
              forceDuration: props.noMessageSendingAnimation ? 0 : undefined,
            });

            if (shouldReleaseLiveTail && effectiveLiveTailStartOriginalId() !== undefined) {
              clearTimeout(liveTailReleaseTimerRef);

              liveTailReleaseTimerRef = window.setTimeout(() => {
                liveTailReleaseTimerRef = undefined;
                setReleasedLiveTailStartOriginalId(effectiveLiveTailStartOriginalId());
              }, SEND_FOCUS_DURATION);
            }
          });
        }

        const isResized = prevContainerHeight !== undefined && prevContainerHeight !== containerHeight;
        if (isResized && isAnimatingScroll(container)) {
          return undefined;
        }

        const anchor = anchorIdRef.current && container.querySelector(`#${anchorIdRef.current}`);
        const unreadDivider =
          !anchor &&
          memoUnreadDividerBeforeIdRef.current &&
          container.querySelector<HTMLDivElement>(`.${UNREAD_DIVIDER_CLASS}`);
        const liveTailElement = shouldFocusLiveTail ? container.querySelector<HTMLDivElement>('.live-tail') : undefined;
        const animateLiveTailScroll = liveTailElement
          ? animateScroll({
              container,
              element: liveTailElement,
              position: 'end',
              margin: bottomReserve,
              maxDistance: Number.MAX_SAFE_INTEGER,
              forceDuration: props.noMessageSendingAnimation ? 0 : undefined,
              shouldReturnMutationFn: true,
            })
          : undefined;
        const typingDraftTop =
          shouldRevealTypingDraft && lastItemElement ? getOffsetToContainer(lastItemElement, container).top : undefined;
        const typingDraftBottom =
          typingDraftTop !== undefined && lastItemElement ? typingDraftTop + lastItemElement.offsetHeight : undefined;
        const scrollTopBeforeUpdate = scrollTopBeforeUpdateRef;
        const viewportBottomBeforeUpdate = (scrollTopBeforeUpdate ?? scrollTop) + offsetHeight;
        const typingDraftElement =
          typingDraftBottom !== undefined && typingDraftBottom > viewportBottomBeforeUpdate
            ? lastItemElement
            : undefined;
        const typingDraftScrollTop =
          typingDraftElement && typingDraftTop !== undefined
            ? typingDraftTop + typingDraftElement.offsetHeight - offsetHeight
            : undefined;
        const shouldRestoreBeforeTypingDraftAnimation = Boolean(
          typingDraftElement &&
          scrollTopBeforeUpdate !== undefined &&
          scrollTopBeforeUpdate < scrollTop &&
          typingDraftScrollTop !== undefined &&
          scrollTopBeforeUpdate < typingDraftScrollTop,
        );

        let animateTypingDraftScroll: NoneToVoidFunction | undefined;
        if (typingDraftElement) {
          animateTypingDraftScroll = shouldRestoreBeforeTypingDraftAnimation
            ? () => {
                resetScroll(container, scrollTopBeforeUpdate);
                requestMeasure(() => {
                  const mutate = animateScroll({
                    container,
                    element: typingDraftElement,
                    position: 'end',
                    margin: bottomReserve,
                    maxDistance: Number.MAX_SAFE_INTEGER,
                    forceDuration: props.noMessageSendingAnimation ? 0 : undefined,
                    shouldReturnMutationFn: true,
                  });

                  requestMutation(mutate!);
                });
              }
            : animateScroll({
                container,
                element: typingDraftElement,
                position: 'end',
                margin: bottomReserve,
                maxDistance: Number.MAX_SAFE_INTEGER,
                forceDuration: props.noMessageSendingAnimation ? 0 : undefined,
                shouldReturnMutationFn: true,
              });
        }

        let newScrollTop!: number;
        let isParkedForSendCollapse = false;
        if (liveTailElement) {
          const liveTailOffset = getOffsetToContainer(liveTailElement, container).top;
          newScrollTop = liveTailOffset + liveTailElement.offsetHeight - offsetHeight;
        } else if (shouldFocusLiveTail) {
          newScrollTop = scrollHeight - offsetHeight;
        } else if (typingDraftScrollTop !== undefined) {
          newScrollTop = typingDraftScrollTop;
        } else if (shouldRevealTypingDraft) {
          newScrollTop = scrollTop;
        } else if (isAtBottom && (isResized || isInSendCollapsePhase)) {
          newScrollTop = scrollHeight - offsetHeight;
          if (isInSendCollapsePhase) {
            isParkedForSendCollapse = true;
            const revealShift = addedTailHeight + reserveDelta;
            if (revealShift > MIN_SEND_COLLAPSE_REVEAL_SHIFT && !props.noMessageSendingAnimation) {
              newScrollTop -= revealShift;
            }
          }
        } else if (anchor) {
          const newAnchorTop = anchor.getBoundingClientRect().top;
          newScrollTop = scrollTop + (newAnchorTop - (anchorTopRef || 0));
        } else if (unreadDivider) {
          newScrollTop = Math.min(
            getOffsetToContainer(unreadDivider, container).top - UNREAD_DIVIDER_TOP,
            scrollHeight - scrollOffset,
          );
        } else {
          newScrollTop = scrollHeight - scrollOffset;
        }

        const isBottomAnchored =
          !liveTailElement &&
          !shouldFocusLiveTail &&
          typingDraftScrollTop === undefined &&
          !shouldRevealTypingDraft &&
          !anchor &&
          !unreadDivider;
        if (isBottomAnchored || isParkedForSendCollapse) {
          newScrollTop += reserveDelta;
        }

        return () => {
          applyMessageListBottomInset(container, bottomReserve);

          const animateScrollMutation = animateLiveTailScroll || animateTypingDraftScroll;
          if (animateScrollMutation) {
            const animationStartScrollTop =
              shouldRestoreBeforeTypingDraftAnimation && scrollTopBeforeUpdate !== undefined
                ? scrollTopBeforeUpdate
                : scrollTop;

            if (Math.abs(newScrollTop - animationStartScrollTop) >= 1) {
              isLiveTailAutoScrollingRef = true;
            }

            animateScrollMutation();
            scrollOffsetRef = Math.max(Math.ceil(effectiveScrollHeight - newScrollTop), offsetHeight);
            requestMeasure(() => {
              isReplacingHistoryRef.current = false;
            });
            return;
          }

          resetScroll(container, Math.ceil(newScrollTop));

          requestMeasure(() => {
            isReplacingHistoryRef.current = false;
          });
          restartCurrentScrollAnimation();

          scrollOffsetRef = isParkedForSendCollapse
            ? offsetHeight
            : Math.max(Math.ceil(effectiveScrollHeight - newScrollTop), offsetHeight);

          if (!props.focusingId) {
            isScrollTopJustUpdatedRef = true;

            requestMeasure(() => {
              isScrollTopJustUpdatedRef = false;

              updateBottomSnapClass();
            });
          }

          if (IS_PERF) {
            // eslint-disable-next-line no-console
            console.timeEnd('scrollTop');
          }
        };
      });
    },
    frameForcedReflow,
  );

  createMeasureEffect(
    () => props.isSelectModeActive,
    (_isSelectModeActive, prevIsSelectModeActive) => {
      if (prevIsSelectModeActive === undefined) return;
      beginHeavyAnimation(SELECT_MODE_ANIMATION_DURATION + ANIMATION_END_DELAY);

      const container = containerRef;
      if (container) {
        const wasAtBottom = container.classList.contains(BOTTOM_SNAP_CLASS);
        syncMessageListBottomReserve(container, false, wasAtBottom);
      }
    },
  );

  const noAvatars = createMemo(() => Boolean(!withUsers() || (props.isChannelChat && !props.isChannelWithAvatars)));
  const shouldRenderGreeting = createMemo(
    () =>
      isUserId(props.chatId) &&
      !props.isChatWithSelf &&
      !props.isBot &&
      !props.isAnonymousForwards &&
      props.type === 'thread' &&
      ((!messageGroups() &&
        !props.lastMessage &&
        props.messageIds &&
        // Used to avoid flickering when deleting a greeting that has just been sent
        (!listItemElementsRef || listItemElementsRef.length === 0)) ||
        (props.messageIds?.length === 1 &&
          props.messagesById?.[props.messageIds[0]]?.content.action?.type === 'contactSignUp') ||
        props.lastMessage?.content?.action?.type === 'contactSignUp'),
  );

  const isGroupChatJustCreated = createMemo(
    () =>
      props.isGroupChat &&
      props.isOwner &&
      props.messageIds?.length === 1 &&
      props.messagesById?.[props.messageIds[0]]?.content.action?.type === 'chatCreate',
  );
  const isEmptyTopic = createMemo(
    () =>
      props.messageIds?.length === 1 &&
      props.messagesById?.[props.messageIds[0]]?.content.action?.type === 'topicCreate',
  );

  const className = createMemo(() =>
    buildClassName(
      'MessageList custom-scroll',
      noAvatars() && 'no-avatars',
      !props.hasFooter && 'no-footer',
      props.type === 'pinned' && 'type-pinned',
      props.withBottomShift && 'with-bottom-shift',
      props.withDefaultBg && 'with-default-bg',
      props.isSelectModeActive && 'select-mode-active',
      isScrolled() && 'scrolled',
      !props.isReady && 'is-animating',
      hasOpenChatButton() && 'saved-dialog',
      props.isChatProtected && 'hide-on-print',
    ),
  );

  const hasMessages = createMemo(() => Boolean((renderMessageIds() && messageGroups()) || props.lastMessage));

  createEffect(
    depsOf(() => [hasMessages(), props.onScrollDownToggle] as const),
    ([hasMessages2, onScrollDownToggle2]) => {
      if (hasMessages2) return;

      onScrollDownToggle2?.(false);
    },
  );

  const activeKey = createMemo(() =>
    isRestricted()
      ? Content.Restricted
      : props.paidMessagesStars && !hasMessages() && !props.hasCustomGreeting
        ? Content.StarsRequired
        : props.isContactRequirePremium && !hasMessages()
          ? Content.PremiumRequired
          : (props.isBot || props.isNonContact) && !hasMessages() && props.threadId === MAIN_THREAD_ID
            ? Content.AccountInfo
            : shouldRenderGreeting()
              ? Content.ContactGreeting
              : renderMessageIds() && (!messageGroups() || isGroupChatJustCreated() || isEmptyTopic())
                ? Content.NoMessages
                : hasMessages()
                  ? Content.MessageList
                  : Content.Loading,
  );
  const previousActiveKey = previous(() => activeKey());
  const shouldSkipContentTransition = createMemo(
    () =>
      previousActiveKey() !== undefined &&
      (activeKey() === Content.AccountInfo || previousActiveKey() === Content.AccountInfo),
  );

  // Deviation: each `Transition` slide renders the content of its own key (tt rendered the current content for the
  // active slide only), so the outgoing slide keeps its content while it fades out.
  function renderContent(key: Content) {
    return key === Content.Restricted ? (
      <div class="empty">
        <span>
          {restrictionReasons()?.[0]?.text || `This is a private ${props.isChannelChat ? 'channel' : 'chat'}`}
        </span>
      </div>
    ) : key === Content.StarsRequired ? (
      <RequirementToContactMessage
        paidMessagesStars={props.paidMessagesStars}
        peerId={props.monoforumChannelId || props.chatId}
      />
    ) : key === Content.PremiumRequired ? (
      <RequirementToContactMessage peerId={props.chatId} />
    ) : key === Content.AccountInfo ? (
      <MessageListAccountInfo chatId={props.chatId} hasMessages={hasMessages()} />
    ) : key === Content.ContactGreeting ? (
      <Show when={props.chatId} keyed>
        {(chatId) => <ContactGreeting userId={chatId} />}
      </Show>
    ) : key === Content.NoMessages ? (
      <NoMessages
        chatId={props.chatId}
        topic={props.topic}
        type={props.type}
        isChatWithSelf={props.isChatWithSelf}
        isGroupChatJustCreated={isGroupChatJustCreated()}
      />
    ) : key === Content.MessageList ? (
      <MessageListContent
        canShowAds={canShowSponsoredMessages() && props.isChannelChat}
        chatId={props.chatId}
        isComments={props.isComments}
        isChannelChat={props.isChannelChat}
        isChatMonoforum={props.isChatMonoforum}
        isSavedDialog={isSavedDialog()}
        messageIds={renderMessageIds() || (props.lastMessage ? [props.lastMessage.id] : [])}
        historyMessageIds={props.messageIds || (props.lastMessage ? [props.lastMessage.id] : [])}
        messageGroups={messageGroups() || (props.lastMessage ? groupMessages([props.lastMessage]) : [])}
        getContainerHeight={getContainerHeight}
        isViewportNewest={Boolean(props.isViewportNewest)}
        isUnread={Boolean(props.firstUnreadId)}
        isEmptyThread={props.isEmptyThread}
        withUsers={withUsers()}
        noAvatars={noAvatars()}
        containerRef={() => containerRef}
        anchorIdRef={anchorIdRef}
        memoUnreadDividerBeforeIdRef={memoUnreadDividerBeforeIdRef}
        memoFirstUnreadIdRef={memoFirstUnreadIdRef}
        liveTailStartOriginalId={effectiveLiveTailStartOriginalId()}
        isReplacingHistoryRef={isReplacingHistoryRef}
        threadId={props.threadId}
        type={props.type}
        isReady={props.isReady}
        isActive={props.isActive}
        hasLinkedChat={props.hasLinkedChat}
        isSchedule={messageGroups() ? props.type === 'scheduled' : false}
        shouldRenderAccountInfo={props.isBot || props.isNonContact}
        nameChangeDate={props.nameChangeDate}
        photoChangeDate={props.photoChangeDate}
        noAppearanceAnimation={!messageGroups() || !shouldAnimateAppearanceRef}
        addedMessageIds={addedMessageIds()}
        isQuickPreview={props.isQuickPreview}
        canPost={props.canPost}
        canManageBotForumTopics={props.canManageBotForumTopics}
        withTopicSeparators={props.withTopicSeparators}
        isBotForum={props.isBotForum}
        shouldScrollToBottom={props.shouldScrollToBottom}
        onScrollDownToggle={props.onScrollDownToggle}
        onContentResize={handleContentResize}
        onIntersectPinnedMessage={props.onIntersectPinnedMessage}
      />
    ) : (
      <Loading color="white" backgroundColor="dark" />
    );
  }

  return (
    <Transition
      ref={(el) => {
        containerRef = el;
      }}
      className={className()}
      name={shouldSkipContentTransition() ? 'none' : 'fade'}
      activeKey={activeKey()}
      shouldCleanup
      onScroll={handleScroll}
      onWheel={handleWheel}
      onMouseDown={preventMessageInputBlur}
    >
      {(slide) => renderContent(slide.key)}
    </Transition>
  );
};

const mapStateToProps = (global: GlobalState, { chatId, threadId, type }: OwnProps): Complete<StateProps> => {
  const tabState = selectTabState(global);
  const currentUserId = global.currentUserId!;
  const chat = selectChat(global, chatId);
  const user = selectUser(global, chatId);
  const userFullInfo = selectUserFullInfo(global, chatId);
  const readState = selectThreadReadState(global, chatId, threadId);
  if (!chat) {
    return { currentUserId } as Complete<StateProps>;
  }

  const messageIds = selectCurrentMessageIds(global, chatId, threadId, type);
  const chatMessagesById = selectChatMessages(global, chatId);
  const ephemeralById = type === 'thread' ? selectChatEphemeralMessages(global, chatId) : undefined;
  const anchoredById = type === 'thread' ? selectChatAnchoredMessages(global, chatId) : undefined;
  const messagesById = type === 'scheduled' ? selectChatScheduledMessages(global, chatId) : chatMessagesById;

  const isSavedDialog = getIsSavedDialog(chatId, threadId, currentUserId);

  if (
    threadId !== MAIN_THREAD_ID &&
    !isSavedDialog &&
    !chat?.isForum &&
    !(chatMessagesById && threadId && chatMessagesById[Number(threadId)])
  ) {
    return { currentUserId } as Complete<StateProps>;
  }

  const lastMessage =
    type === 'thread' ? selectChatLastMessage(global, chatId, isSavedDialog ? 'saved' : 'all') : undefined;
  const focusingId = selectFocusedMessageId(global, chatId);

  const withLastMessageWhenPreloading =
    threadId === MAIN_THREAD_ID &&
    !messageIds &&
    readState &&
    !readState.unreadCount &&
    !focusingId &&
    lastMessage &&
    !lastMessage.groupedId;

  const chatBot = selectBot(global, chatId);
  const isNonContact = Boolean(userFullInfo?.settings?.canAddContact);
  const nameChangeDate = userFullInfo?.settings?.nameChangeDate;
  const photoChangeDate = userFullInfo?.settings?.photoChangeDate;

  const topic = selectTopic(global, chatId, threadId);
  const chatFullInfo = !isUserId(chatId) ? selectChatFullInfo(global, chatId) : undefined;
  const isEmptyThread = selectThreadInfo(global, chatId, threadId)?.messagesCount === 0;

  const isCurrentUserPremium = selectIsCurrentUserPremium(global);
  const areAdsEnabled = !isCurrentUserPremium || selectUserFullInfo(global, currentUserId)?.areAdsEnabled;
  const isAccountFrozen = selectIsCurrentUserFrozen(global);

  const hasCustomGreeting = Boolean(userFullInfo?.businessIntro);
  const isAppConfigLoaded = global.isAppConfigLoaded;

  const monoforumChannelId = selectMonoforumChannel(global, chatId)?.id;
  const canTranslate = selectCanTranslateChat(global, chatId) && !chatFullInfo?.isTranslationDisabled;
  const shouldAutoTranslate = chat?.hasAutoTranslation;
  const translationLanguage = selectTranslationLanguage(global);

  const currentMessageList = selectCurrentMessageList(global);
  const isActive =
    currentMessageList &&
    currentMessageList.chatId === chatId &&
    currentMessageList.threadId === threadId &&
    currentMessageList.type === type;

  const {
    chatId: focusedChatId,
    threadId: focusedThreadId,
    messageId: focusedMessageId,
  } = tabState.focusedMessage || {};
  const shouldScrollToBottom = focusedChatId === chatId && focusedThreadId === threadId && !focusedMessageId;

  return {
    isActive,
    areAdsEnabled,
    isChatLoaded: true,
    restrictionReasons: chat.restrictionReasons,
    ignoreRestrictionReasons: global.appConfig.ignoreRestrictionReasons,
    isChannelChat: isChatChannel(chat),
    isChatMonoforum: isChatMonoforum(chat),
    isGroupChat: isChatGroup(chat),
    isChannelWithAvatars: chat.areProfilesShown,
    isOwner: chat.isOwner,
    isChatWithSelf: selectIsChatWithSelf(global, chatId),
    isSystemBotChat: isSystemBot(chatId),
    isAnonymousForwards: isAnonymousForwardsChat(chatId),
    isBot: Boolean(chatBot),
    isNonContact,
    nameChangeDate,
    photoChangeDate,
    isSynced: global.isSynced,
    messageIds,
    messagesById,
    ephemeralById,
    anchoredById,
    firstUnreadId: selectFirstUnreadId(global, chatId, threadId),
    isViewportNewest: type !== 'thread' || selectIsViewportNewest(global, chatId, threadId),
    focusingId,
    isSelectModeActive: selectIsInSelectMode(global),
    hasLinkedChat: chatFullInfo ? Boolean(chatFullInfo.linkedChatId) : undefined,
    channelJoinInfo: chatFullInfo?.joinInfo,
    topic,
    noMessageSendingAnimation: !selectPerformanceSettingsValue(global, 'messageSendingAnimations'),
    isServiceNotificationsChat: chatId === SERVICE_NOTIFICATIONS_USER_ID,
    isForum: chat.isForum,
    withTopicSeparators: chat.isForum && threadId === MAIN_THREAD_ID,
    isBotForum: chat.isBotForum,
    isEmptyThread,
    currentUserId,
    isChatProtected: selectIsChatProtected(global, chatId),
    lastMessage: withLastMessageWhenPreloading ? lastMessage : undefined,
    isAccountFrozen,
    hasCustomGreeting,
    isAppConfigLoaded,
    monoforumChannelId,
    canTranslate,
    translationLanguage,
    shouldAutoTranslate,
    canManageBotForumTopics: chat.isBotForum && user?.canManageBotForumTopics,
    shouldScrollToBottom,
    reactionPollingPause: global.reactionPollingPause,
  };
};

export default MessageList;

function getAddedMessageInfo(
  messageIds?: number[],
  messagesById?: Record<number, ApiMessage>,
  previousMessageIds?: number[],
) {
  if (!messageIds?.length || !messagesById || !previousMessageIds?.length) return undefined;

  const previousLastMessageId = previousMessageIds[previousMessageIds.length - 1];
  const previousLastCurrentMessageId = messageIds.find((messageId) => {
    const message = messagesById[messageId];
    return messageId === previousLastMessageId || getMessageOriginalId(message) === previousLastMessageId;
  });
  if (previousLastCurrentMessageId === undefined) return undefined;

  const previousLastMessage = messagesById[previousLastCurrentMessageId];
  const previousMessageIdSet = new Set(previousMessageIds);
  const addedMessageIds = messageIds.filter((messageId) => {
    const message = messagesById[messageId];
    const originalMessageId = getMessageOriginalId(message);
    return (
      message.date >= previousLastMessage.date &&
      !previousMessageIdSet.has(messageId) &&
      !previousMessageIdSet.has(originalMessageId)
    );
  });

  return {
    addedMessageIds: addedMessageIds.length ? addedMessageIds : undefined,
    areAddedMessagesOutgoing: addedMessageIds.length
      ? addedMessageIds.every((messageId) => messagesById[messageId].isOutgoing)
      : undefined,
    previousLastCurrentMessageId,
  };
}
