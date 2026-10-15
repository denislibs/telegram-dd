import { type Accessor, createMemo, getIsHeavyAnimating, untrack } from 'frameact';
import { For, Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';
import { getActions, useGlobal } from '../../global';

import type { ApiMessage } from '../../api/types';
import type { IAlbum, IDocumentGroup, MessageListType, ThreadId } from '../../types';
import type { MessageDateGroup } from './helpers/groupMessages';
import type { OnIntersectPinnedMessage } from './hooks/usePinnedMessage';
import { MAIN_THREAD_ID } from '../../api/types';

import { SCHEDULED_WHEN_ONLINE } from '../../config';
import {
  getMessageHtmlId,
  getMessageOriginalId,
  getSuggestedChangesActionText,
  getSuggestedChangesInfo,
  isActionMessage,
  isOwnMessage,
  isServiceNotificationMessage,
} from '../../global/helpers';
import { getPeerTitle } from '../../global/helpers/peers';
import { getMessageForumTopicId, isMessageInForumTopic } from '../../global/helpers/replies';
import { selectChatMessage, selectSender } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import { formatHumanDate, formatScheduledDateTime } from '../../util/dates/oldDateFormat';
import { isUserId } from '../../util/entities/ids';
import { convertTonFromNanos } from '../../util/formatCurrency';
import { compact } from '../../util/iteratees';
import { formatMessageListDate } from '../../util/localization/dateFormat';
import { formatStarsAsText, formatTonAsText } from '../../util/localization/format';
import { isAlbum, isDocumentGroup } from './helpers/groupMessages';
import { consumePendingTopGrowth } from './helpers/messageListReserves';
import { preventMessageInputBlur } from './helpers/preventMessageInputBlur';
import { renderPeerLink } from './message/helpers/messageActions';

import useLang from '../../hooks/useLang';
import useOldLang from '../../hooks/useOldLang';
import useResizeObserver from '../../hooks/useResizeObserver';
import useMessageObservers from './hooks/useMessageObservers';
import useScrollHooks from './hooks/useScrollHooks';

import Icon from '../common/icons/Icon';
import MiniTable, { type TableEntry } from '../common/MiniTable';
import ActionMessage from './message/ActionMessage';
import Message from './message/Message';
import SenderGroupContainer from './message/SenderGroupContainer';
import SponsoredMessage from './message/SponsoredMessage';
import TopicSeparator from './message/TopicSeparator';
import MessageListAccountInfo from './MessageListAccountInfo';
import MessageListBottomMarker from './MessageListBottomMarker';

import actionMessageStyles from './message/ActionMessage.module.scss';

interface OwnProps {
  canShowAds?: boolean;
  chatId: string;
  threadId: ThreadId;
  messageIds: number[];
  historyMessageIds: number[];
  messageGroups: MessageDateGroup[];
  getContainerHeight: Accessor<number | undefined>;
  isViewportNewest: boolean;
  isUnread: boolean;
  withUsers: boolean;
  isChannelChat: boolean | undefined;
  isChatMonoforum?: boolean;
  canManageBotForumTopics?: boolean;
  withTopicSeparators?: boolean;
  isBotForum?: boolean;
  isEmptyThread?: boolean;
  isComments?: boolean;
  noAvatars: boolean;
  containerRef: () => HTMLDivElement | undefined;
  anchorIdRef: { current: string | undefined };
  memoUnreadDividerBeforeIdRef: { current: number | undefined };
  memoFirstUnreadIdRef: { current: number | undefined };
  liveTailStartOriginalId?: number;
  isReplacingHistoryRef: { current: boolean };
  type: MessageListType;
  isReady: boolean;
  isActive?: boolean;
  hasLinkedChat: boolean | undefined;
  isSchedule: boolean;
  shouldRenderAccountInfo?: boolean;
  nameChangeDate?: number;
  photoChangeDate?: number;
  noAppearanceAnimation: boolean;
  addedMessageIds?: number[];
  isSavedDialog?: boolean;
  isQuickPreview?: boolean;
  canPost?: boolean;
  shouldScrollToBottom?: boolean;
  onScrollDownToggle?: BooleanToVoidFunction;
  onContentResize?: (growth: number) => void;
  onIntersectPinnedMessage?: OnIntersectPinnedMessage;
}

const UNREAD_DIVIDER_CLASS = 'unread-divider';

// Deviation: tt built the list as an array of keyed elements on every render (`teactFastList`), and teact kept the
// components of the elements whose keys stayed. A frameact component runs once, so the render functions below build a
// plain tree of entries (the same loops, the same keys and the same props) in a memo, and `<For keyed>` renders it:
// a row is created once per key and gets its props from the latest entry of its key.
type PositionProperties = {
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  isFirstInDocumentGroup: boolean;
  isLastInDocumentGroup: boolean;
  isLastInList: boolean;
};

type UnreadDividerEntry = { type: 'unread-divider'; key: string };
type PaidActionEntry = { type: 'paid-action'; key: string; message: ApiMessage; album?: IAlbum };
type SuggestedPostEntry = { type: 'suggested-post'; key: string; message: ApiMessage };
type DiscussionNoteEntry = { type: 'discussion-note'; key: string };
type MessageEntry = PositionProperties & {
  type: 'message';
  key: string | number;
  message: ApiMessage;
  album?: IAlbum;
  documentGroup?: IDocumentGroup;
  noAvatars: boolean;
  withAvatar: boolean;
  withSenderName: boolean;
  noComments: boolean;
  noReplies: boolean;
  appearanceOrder: number;
  isJustAdded: boolean;
  isThreadTop: boolean;
  shouldIgnoreSendFocus: boolean;
};
type ActionMessageEntry = {
  type: 'action-message';
  key: number;
  message: ApiMessage;
  appearanceOrder: number;
  isJustAdded?: boolean;
  isLastInList: boolean;
};
type SenderGroupEntry = {
  type: 'sender-group';
  key: string;
  /** The id of the element (`message-group-...`). */
  id: string;
  /** The path of the entry in the tree: the key of its list in `childrenByPath`. */
  path?: string;
  message: ApiMessage;
  withAvatar: boolean;
  appearanceOrder: number;
  children: Entry[];
};
type TopicGroupEntry = {
  type: 'topic-group';
  key: string;
  topicId: number;
  isContinuation: boolean;
  isBeforeDate?: boolean;
  isBeforeContinuation?: boolean;
  path?: string;
  children: Entry[];
};
type DateHeaderEntry = { type: 'date-header'; key: string; dateGroup: MessageDateGroup };
type Entry =
  | UnreadDividerEntry
  | PaidActionEntry
  | SuggestedPostEntry
  | DiscussionNoteEntry
  | MessageEntry
  | ActionMessageEntry
  | SenderGroupEntry
  | TopicGroupEntry
  | DateHeaderEntry;
type DateGroupEntry = { key: string; shouldAddFirstClass: boolean; path?: string; children: Entry[] };

type TopicSection = {
  target: Entry[];
  topicId: number;
  key: string;
  isContinuation: boolean;
  isBeforeDate?: boolean;
  isBeforeContinuation?: boolean;
  children: Entry[];
};

function getSectionTopicId(message: ApiMessage, currentTopicId: number | undefined, isBotForum?: boolean) {
  return isBotForum && !isMessageInForumTopic(message) ? currentTopicId : getMessageForumTopicId(message);
}

function getSenderGroupFirstMessage(senderGroup: (ApiMessage | IAlbum | IDocumentGroup)[]) {
  const firstItem = senderGroup[0];
  return isAlbum(firstItem) ? firstItem.mainMessage : isDocumentGroup(firstItem) ? firstItem.messages[0] : firstItem;
}

function senderGroupContainsOriginalId(senderGroup: (ApiMessage | IAlbum | IDocumentGroup)[], originalId: number) {
  return senderGroup.some((messageOrAlbum) => {
    if (isAlbum(messageOrAlbum) || isDocumentGroup(messageOrAlbum)) {
      return messageOrAlbum.messages.some((message) => getMessageOriginalId(message) === originalId);
    }

    return getMessageOriginalId(messageOrAlbum) === originalId;
  });
}

const MessageListContent = (props: OwnProps) => {
  const { openHistoryCalendar } = getActions();

  let messagesContainerRef!: HTMLDivElement;
  let prevContentHeightRef: number | undefined;
  const addedMessageIdSet = createMemo(() => props.addedMessageIds && new Set(props.addedMessageIds));

  const handleContentResize = (entry: ResizeObserverEntry) => {
    const newHeight = entry.contentRect.height;
    const prevHeight = prevContentHeightRef;
    prevContentHeightRef = newHeight;
    if (prevHeight === undefined) {
      consumePendingTopGrowth(entry.target.closest<HTMLElement>('.MessageList')!);
      return;
    }

    const growth = newHeight - prevHeight;
    if (growth > 0) props.onContentResize?.(growth);
  };

  useResizeObserver(() => messagesContainerRef, handleContentResize);

  const getIsReady = createMemo(() => props.isReady && !getIsHeavyAnimating());

  const areDatesClickable = createMemo(() => !props.isSavedDialog && !props.isSchedule);
  const isPrivate = createMemo(() => isUserId(props.chatId));
  const shouldRenderSponsoredMessage = createMemo(() => props.canShowAds && props.isViewportNewest);
  const shouldHideComments = createMemo(
    () => props.hasLinkedChat === false || !props.isChannelChat || Boolean(props.isChatMonoforum),
  );

  const {
    observeIntersectionForReading,
    observeIntersectionForLoading,
    observeIntersectionForPlaying,
    onMessageUnmount,
  } = useMessageObservers({
    type: () => props.type,
    containerRef: props.containerRef,
    memoFirstUnreadIdRef: props.memoFirstUnreadIdRef,
    chatId: () => props.chatId,
    threadId: () => props.threadId,
    isQuickPreview: () => props.isQuickPreview,
    onIntersectPinnedMessage: (params) => props.onIntersectPinnedMessage?.(params),
  });

  const { withHistoryTriggers, backwardsTriggerRef, forwardsTriggerRef, fabTriggerRef } = useScrollHooks({
    type: () => props.type,
    containerRef: props.containerRef,
    messageIds: () => props.historyMessageIds,
    getContainerHeight: props.getContainerHeight,
    isViewportNewest: () => props.isViewportNewest,
    isUnread: () => props.isUnread,
    isReady: () => props.isReady,
    isReplacingHistoryRef: props.isReplacingHistoryRef,
    onScrollDownToggle: (isDown) => props.onScrollDownToggle?.(isDown),
  });

  const oldLang = useOldLang();
  const lang = useLang();

  const renderUnreadDivider = () => (
    <div class={buildClassName(UNREAD_DIVIDER_CLASS, 'local-action-message')}>
      <span>{oldLang('UnreadMessages')}</span>
    </div>
  );

  // Deviation: components over the entry accessor (tt re-ran these functions on every render of the list): the paid amount, the
  // sender, the replied-to message and the change summary follow the store, so an album that gets another part, or a sender
  // or an original message that loads after the row was mounted, update the row. `useGlobal()` is the tracked global.
  const PaidMessageAction = (rowProps: { entry: Accessor<PaidActionEntry> }) => {
    const global = useGlobal();
    const entry = rowProps.entry;
    const amount = createMemo(() => entry().message.paidMessageStars! * (entry().album?.messages?.length || 1));
    const userTitle = createMemo(() => {
      const sender = selectSender(global, entry().message);
      return sender ? getPeerTitle(lang, sender) : '';
    });

    return (
      <div class={buildClassName('local-action-message')}>
        <span>
          {entry().message.isOutgoing
            ? lang('ActionPaidOneMessageOutgoing', {
                amount: formatStarsAsText(lang, amount()),
              })
            : lang('ActionPaidOneMessageIncoming', {
                user: userTitle(),
                amount: formatStarsAsText(lang, amount()),
              })}
        </span>
      </div>
    );
  };

  const SuggestedPostInfoAction = (rowProps: { entry: Accessor<SuggestedPostEntry> }) => {
    const global = useGlobal();
    const entry = rowProps.entry;
    const message = () => entry().message;
    const sender = createMemo(() => selectSender(global, message()));
    const originalMessage = createMemo(() => {
      const replyInfo = message().replyInfo;
      return replyInfo?.type === 'message' && replyInfo.replyToMsgId
        ? selectChatMessage(global, message().chatId, replyInfo.replyToMsgId)
        : undefined;
    });
    const userLink = () => {
      const userTitle = sender() ? getPeerTitle(lang, sender()!) : '';
      return renderPeerLink(sender()?.id, userTitle || lang('ActionFallbackUser'));
    };
    const titleText = () => {
      const changesInfo = getSuggestedChangesInfo(message(), originalMessage());
      return changesInfo
        ? getSuggestedChangesActionText(lang, message(), originalMessage(), message().isOutgoing, userLink())
        : message().isOutgoing
          ? lang('ActionSuggestedPostOutgoing', undefined, { withNodes: true, withMarkdown: true })
          : lang('ActionSuggestedPostIncoming', { user: userLink() }, { withNodes: true, withMarkdown: true });
    };
    const tableData = createMemo((): TableEntry[] => {
      const { price, scheduleDate } = message().suggestedPostInfo!;
      return compact([
        [
          lang('TitlePrice'),
          price
            ? price.currency === 'TON'
              ? formatTonAsText(lang, convertTonFromNanos(price.amount))
              : formatStarsAsText(lang, price.amount)
            : lang('SuggestMessageNoPrice'),
        ],
        [
          lang('TitleTime'),
          scheduleDate ? formatScheduledDateTime(scheduleDate, lang, oldLang) : lang('SuggestMessageAnytime'),
        ],
      ]);
    });

    return (
      <div class={buildClassName('local-action-message')}>
        <span class={actionMessageStyles.suggestedPostContainer}>
          <div class={actionMessageStyles.suggestedPostTitle}>{titleText()}</div>
          {Boolean(tableData().length) && (
            <MiniTable className={actionMessageStyles.suggestedPostInfo} data={tableData()} />
          )}
        </span>
      </div>
    );
  };

  const renderBotForumTopicAction = () => {
    if (!props.canManageBotForumTopics || props.threadId !== MAIN_THREAD_ID) return undefined;
    return (
      <div class={buildClassName('local-action-message', actionMessageStyles.root)}>
        <div class={actionMessageStyles.contentBox}>
          <Icon className={actionMessageStyles.botForumTopicIcon} name="topic-new" />
          <h3 class={actionMessageStyles.botForumTopicTitle}>{lang('BotForumActionNew')}</h3>
          <span class={actionMessageStyles.botForumTopicDescription}>{lang('BotForumActionNewDescription')}</span>
          <Icon className={actionMessageStyles.botForumTopicArrow} name="down" />
        </div>
      </div>
    );
  };

  const messageCountToAnimate = createMemo(() =>
    props.noAppearanceAnimation
      ? 0
      : props.messageGroups.reduce((acc, messageGroup) => {
          return (
            acc +
            messageGroup.senderGroups.flat().reduce((innerAcc, messageOrAlbum) => {
              return innerAcc + (isDocumentGroup(messageOrAlbum) ? messageOrAlbum.messages.length : 1);
            }, 0)
          );
        }, 0),
  );

  // The entries of the list (see the note above): the loops of tt's `calculateSenderGroups` and of the render body.
  // Perf (not in tt): the entries of the previous run by path, so that an entry whose fields did not change keeps its
  // object and `<For>` does not wake its row (a row reads its props through its entry: a new entry object re-runs every
  // prop-reading memo, effect and the mapper of the row, for every row, on every change of the list).
  let entryCache = new Map<string, Entry | DateGroupEntry>();
  const isSameEntry = (prev: AnyLiteral, next: AnyLiteral) => {
    for (const key in next) {
      if (key === 'children' || key === 'path') continue;
      if (key === 'dateGroup') {
        if (
          prev.dateGroup.datetime !== next.dateGroup.datetime ||
          prev.dateGroup.originalDate !== next.dateGroup.originalDate
        ) {
          return false;
        }
        continue;
      }
      if (prev[key] !== next[key]) return false;
    }
    for (const key in prev) {
      if (key !== 'path' && !(key in next)) return false;
    }
    return true;
  };

  const model = createMemo(() => {
    const messageGroups = props.messageGroups;
    const liveTailStartOriginalId = props.liveTailStartOriginalId;
    const messageCount = messageCountToAnimate();
    const addedIds = addedMessageIdSet();
    let appearanceIndex = 0;

    function calculateSenderGroups(
      dateGroup: MessageDateGroup,
      dateGroupIndex: number,
      dateGroupsArray: MessageDateGroup[],
    ): Entry[][] {
      return dateGroup.senderGroups.map((senderGroup, senderGroupIndex, senderGroupsArray) => {
        if (
          senderGroup.length === 1 &&
          !isAlbum(senderGroup[0]) &&
          !isDocumentGroup(senderGroup[0]) &&
          isActionMessage(senderGroup[0]) &&
          senderGroup[0].content.action?.type !== 'phoneCall'
        ) {
          const message = senderGroup[0];
          const isLastInList =
            senderGroupIndex === senderGroupsArray.length - 1 && dateGroupIndex === dateGroupsArray.length - 1;

          return compact<Entry>([
            message.id === props.memoUnreadDividerBeforeIdRef.current &&
              ({ type: 'unread-divider', key: 'unread-messages' } satisfies UnreadDividerEntry),
            {
              type: 'action-message',
              key: getMessageOriginalId(message),
              message,
              appearanceOrder: Math.max(0, messageCount - ++appearanceIndex),
              isJustAdded: addedIds?.has(message.id),
              isLastInList,
            } satisfies ActionMessageEntry,
          ]);
        }

        let currentDocumentGroupHasThreadTop = false;

        const senderGroupElements = senderGroup
          .map((messageOrAlbum, messageIndex): Entry[] => {
            function renderMessageElement(
              message: ApiMessage,
              position: PositionProperties,
              isThreadTopMessage: boolean,
              album?: IAlbum,
              documentGroup?: IDocumentGroup,
            ): Entry[] {
              const isOwn = isOwnMessage(message);
              const originalId = getMessageOriginalId(message);
              const isInLiveTail = liveTailStartOriginalId !== undefined && originalId >= liveTailStartOriginalId;
              const key = isServiceNotificationMessage(message) ? `${message.date}_${originalId}` : originalId;
              const shouldShowGuestAvatar = isPrivate() && !props.withUsers && Boolean(message.guestChatViaId);
              const isJustAdded =
                addedIds?.has(message.id) || Boolean(album?.messages.some(({ id }) => addedIds?.has(id)));

              return compact<Entry>([
                message.id === props.memoUnreadDividerBeforeIdRef.current &&
                  ({ type: 'unread-divider', key: 'unread-messages' } satisfies UnreadDividerEntry),
                Boolean(message.paidMessageStars) &&
                  !props.withUsers &&
                  ({
                    type: 'paid-action',
                    key: `paid-messages-action-${message.id}`,
                    message,
                    album,
                  } satisfies PaidActionEntry),
                Boolean(message.suggestedPostInfo) &&
                  ({
                    type: 'suggested-post',
                    key: `suggested-post-action-${message.id}`,
                    message,
                  } satisfies SuggestedPostEntry),
                {
                  type: 'message',
                  key,
                  message,
                  album,
                  documentGroup,
                  noAvatars: props.noAvatars && !shouldShowGuestAvatar,
                  withAvatar:
                    position.isLastInGroup &&
                    (props.withUsers || shouldShowGuestAvatar) &&
                    !isOwn &&
                    (!isThreadTopMessage || !props.isComments),
                  withSenderName: position.isFirstInGroup && (props.withUsers || shouldShowGuestAvatar) && !isOwn,
                  noComments: shouldHideComments(),
                  noReplies: !shouldHideComments() || props.threadId !== MAIN_THREAD_ID || props.type === 'scheduled',
                  appearanceOrder: Math.max(0, messageCount - ++appearanceIndex),
                  isJustAdded,
                  isThreadTop: isThreadTopMessage,
                  isFirstInGroup: position.isFirstInGroup,
                  isLastInGroup: position.isLastInGroup,
                  isFirstInDocumentGroup: position.isFirstInDocumentGroup,
                  isLastInDocumentGroup: position.isLastInDocumentGroup,
                  isLastInList: position.isLastInList,
                  shouldIgnoreSendFocus: isInLiveTail && isOwn,
                } satisfies MessageEntry,
              ]);
            }

            if (isDocumentGroup(messageOrAlbum)) {
              const documentGroup = messageOrAlbum;
              return documentGroup.messages
                .map((docMessage, docIndex) => {
                  const isFirstInDocGroup = docIndex === 0;
                  const isLastInDocGroup = docIndex === documentGroup.messages.length - 1;

                  if (
                    docMessage.previousLocalId &&
                    props.anchorIdRef.current === getMessageHtmlId(docMessage.previousLocalId)
                  ) {
                    props.anchorIdRef.current = getMessageHtmlId(docMessage.id);
                  }

                  if (isFirstInDocGroup && docMessage.id === props.threadId) {
                    currentDocumentGroupHasThreadTop = true;
                  }

                  const isThreadTopMessage = docMessage.id === props.threadId || currentDocumentGroupHasThreadTop;

                  if (isLastInDocGroup) {
                    currentDocumentGroupHasThreadTop = false;
                  }

                  const position = {
                    isFirstInGroup: messageIndex === 0 && isFirstInDocGroup,
                    isLastInGroup: messageIndex === senderGroup.length - 1 && isLastInDocGroup,
                    isFirstInDocumentGroup: isFirstInDocGroup,
                    isLastInDocumentGroup: isLastInDocGroup,
                    isLastInList:
                      messageIndex === senderGroup.length - 1 &&
                      isLastInDocGroup &&
                      senderGroupIndex === senderGroupsArray.length - 1 &&
                      dateGroupIndex === dateGroupsArray.length - 1,
                  };

                  return renderMessageElement(docMessage, position, isThreadTopMessage, undefined, documentGroup);
                })
                .flat();
            }

            const message = isAlbum(messageOrAlbum) ? messageOrAlbum.mainMessage : messageOrAlbum;
            const album = isAlbum(messageOrAlbum) ? messageOrAlbum : undefined;

            if (message.previousLocalId && props.anchorIdRef.current === getMessageHtmlId(message.previousLocalId)) {
              props.anchorIdRef.current = getMessageHtmlId(message.id);
            }

            const isThreadTopMessage = message.id === props.threadId;

            const position = {
              isFirstInGroup: messageIndex === 0,
              isLastInGroup: messageIndex === senderGroup.length - 1,
              isFirstInDocumentGroup: false,
              isLastInDocumentGroup: false,
              isLastInList:
                messageIndex === senderGroup.length - 1 &&
                senderGroupIndex === senderGroupsArray.length - 1 &&
                dateGroupIndex === dateGroupsArray.length - 1,
            };

            return renderMessageElement(message, position, isThreadTopMessage, album);
          })
          .flat();

        const lastItem = senderGroup[senderGroup.length - 1];
        const lastMessage = isAlbum(lastItem)
          ? lastItem.mainMessage
          : isDocumentGroup(lastItem)
            ? lastItem.messages[lastItem.messages.length - 1]
            : lastItem;
        const lastMessageId = getMessageOriginalId(lastMessage);
        const lastAppearanceOrder = Math.max(0, messageCount - appearanceIndex);

        const isOwn = isOwnMessage(lastMessage);

        const firstMessage = getSenderGroupFirstMessage(senderGroup);
        const firstMessageId = getMessageOriginalId(firstMessage);

        const isThreadTopMessage =
          lastMessage.id === props.threadId || (firstMessage.id === props.threadId && Boolean(firstMessage.groupedId));

        const shouldShowGuestAvatar = isPrivate() && !props.withUsers && Boolean(lastMessage.guestChatViaId);
        if (!props.withUsers && !shouldShowGuestAvatar) return senderGroupElements;

        const key = `${firstMessageId}-${lastMessageId}`;
        const id =
          firstMessageId === lastMessageId
            ? `message-group-${firstMessageId}`
            : `message-group-${firstMessageId}-${lastMessageId}`;

        const withAvatar =
          (props.withUsers || shouldShowGuestAvatar) && !isOwn && (!isThreadTopMessage || !props.isComments);
        return compact<Entry>([
          {
            type: 'sender-group',
            key,
            id,
            message: lastMessage,
            withAvatar,
            appearanceOrder: lastAppearanceOrder,
            children: senderGroupElements,
          } satisfies SenderGroupEntry,
          isThreadTopMessage &&
            ({ type: 'discussion-note', key: `discussion-started-${lastMessageId}` } satisfies DiscussionNoteEntry),
        ]);
      });
    }

    let isRenderingLiveTail = false;
    let currentTopicId: number | undefined;
    const dateGroups: DateGroupEntry[] = [];
    const liveTailDateGroups: DateGroupEntry[] = [];

    messageGroups.forEach(
      (dateGroup: MessageDateGroup, dateGroupIndex: number, dateGroupsArray: MessageDateGroup[]) => {
        const senderGroups = calculateSenderGroups(dateGroup, dateGroupIndex, dateGroupsArray);
        const beforeTailChildren: Entry[] = [];
        const liveTailChildren: Entry[] = [];
        const topicSections: TopicSection[] = [];
        const sectionCountByTopicId = new Map<number, number>();

        const dateHeader: DateHeaderEntry = { type: 'date-header', key: 'date-header', dateGroup };
        if (isRenderingLiveTail) {
          liveTailChildren.push(dateHeader);
        } else {
          beforeTailChildren.push(dateHeader);
        }

        senderGroups.forEach((senderGroupElements, senderGroupIndex) => {
          const isLiveTailStart =
            !isRenderingLiveTail &&
            liveTailStartOriginalId !== undefined &&
            senderGroupContainsOriginalId(dateGroup.senderGroups[senderGroupIndex], liveTailStartOriginalId);

          if (isLiveTailStart) {
            isRenderingLiveTail = true;
          }

          const target = isRenderingLiveTail ? liveTailChildren : beforeTailChildren;
          if (!props.withTopicSeparators) {
            target.push(...senderGroupElements);
            return;
          }

          const prevTopicId = currentTopicId;
          const topicId = getSectionTopicId(
            getSenderGroupFirstMessage(dateGroup.senderGroups[senderGroupIndex]),
            currentTopicId,
            props.isBotForum,
          );
          currentTopicId = topicId;
          if (topicId === undefined) {
            target.push(...senderGroupElements);
            return;
          }

          const lastSection = topicSections[topicSections.length - 1];
          if (lastSection && lastSection.target === target && lastSection.topicId === topicId) {
            lastSection.children.push(...senderGroupElements);
          } else {
            const sectionIndex = sectionCountByTopicId.get(topicId) || 0;
            sectionCountByTopicId.set(topicId, sectionIndex + 1);
            const isContinuation = topicId === prevTopicId;
            if (lastSection) {
              lastSection.isBeforeContinuation = isContinuation;
            }

            topicSections.push({
              target,
              topicId,
              key: `topic-${topicId}-${sectionIndex}`,
              isContinuation,
              children: [...senderGroupElements],
            });
          }
        });

        const lastSection = topicSections[topicSections.length - 1];
        const nextDateGroup = dateGroupsArray[dateGroupIndex + 1];
        if (lastSection && nextDateGroup) {
          const nextTopicId = getSectionTopicId(
            getSenderGroupFirstMessage(nextDateGroup.senderGroups[0]),
            currentTopicId,
            props.isBotForum,
          );
          lastSection.isBeforeDate = true;
          lastSection.isBeforeContinuation = nextTopicId === lastSection.topicId;
        }

        topicSections.forEach((section) => {
          section.target.push({
            type: 'topic-group',
            key: section.key,
            topicId: section.topicId,
            isContinuation: section.isContinuation,
            isBeforeDate: section.isBeforeDate,
            isBeforeContinuation: section.isBeforeContinuation,
            children: section.children,
          } satisfies TopicGroupEntry);
        });

        const shouldAddFirstClass =
          !props.shouldRenderAccountInfo && !(props.nameChangeDate || props.photoChangeDate) && dateGroupIndex === 0;
        if (beforeTailChildren.length) {
          dateGroups.push({
            key: `${dateGroup.datetime}-before-tail`,
            shouldAddFirstClass,
            children: beforeTailChildren,
          });
        }

        if (liveTailChildren.length) {
          liveTailDateGroups.push({
            key: `${dateGroup.datetime}-live-tail`,
            shouldAddFirstClass: shouldAddFirstClass && !beforeTailChildren.length,
            children: liveTailChildren,
          });
        }
      },
    );

    // Deviation: every nested list takes its entries from `childrenByPath` (a read of this memo) and not from the entry of
    // its row. A row of the outer list gets its entry after the outer list has been mapped, so an inner list that reads
    // it is dirty again when an effect of an inner row runs: frameact then reports a "potential infinite loop" (engine gap
    // #7 of the messages report). The paths are the keys of the ancestors, so they are as stable as the rows.
    const nextCache = new Map<string, Entry | DateGroupEntry>();
    const reuseEntries = (parentPath: string, list: (Entry | DateGroupEntry)[]) => {
      for (let i = 0; i < list.length; i++) {
        const next = list[i];
        const cacheKey = `${parentPath}/${next.key}`;
        const prev = entryCache.get(cacheKey);
        let kept = next;
        if (prev && prev !== next && isSameEntry(prev, next)) {
          // the children are read from `childrenByPath`, never from the row's entry
          if ('children' in next) (prev as { children: Entry[] }).children = next.children;
          kept = prev;
          list[i] = prev;
        }
        nextCache.set(cacheKey, kept);
        if ('children' in kept) reuseEntries(cacheKey, kept.children);
      }
    };
    reuseEntries('', dateGroups);
    reuseEntries('~live-tail', liveTailDateGroups);
    entryCache = nextCache;

    const childrenByPath = new Map<string, Entry[]>();
    const register = (parentPath: string, entries: Entry[]) => {
      for (const entry of entries) {
        if (entry.type !== 'sender-group' && entry.type !== 'topic-group') continue;
        entry.path = `${parentPath}/${entry.key}`;
        childrenByPath.set(entry.path, entry.children);
        register(entry.path, entry.children);
      }
    };
    for (const group of [...dateGroups, ...liveTailDateGroups]) {
      group.path = group.key;
      childrenByPath.set(group.path, group.children);
      register(group.path, group.children);
    }

    return { dateGroups, liveTailDateGroups, childrenByPath };
  });

  const renderDateHeader = (dateGroup: MessageDateGroup) => (
    <div
      class={buildClassName('sticky-date', areDatesClickable() && 'interactive')}
      onMouseDown={preventMessageInputBlur}
      onClick={areDatesClickable() ? () => openHistoryCalendar({ selectedAt: dateGroup.datetime }) : undefined}
    >
      <span dir="auto">
        {props.isSchedule && dateGroup.originalDate === SCHEDULED_WHEN_ONLINE && oldLang('MessageScheduledUntilOnline')}
        {props.isSchedule &&
          dateGroup.originalDate !== SCHEDULED_WHEN_ONLINE &&
          oldLang('MessageScheduledOn', formatHumanDate(oldLang, dateGroup.datetime, undefined, true))}
        {!props.isSchedule && formatMessageListDate(lang, new Date(dateGroup.datetime))}
      </span>
    </div>
  );

  // One row of any entry type. The type is part of the key, so it never changes for a row.
  const EntryView = (rowProps: { entry: Accessor<Entry> }): JSX.Element => {
    const entry = rowProps.entry;
    switch (entry().type) {
      case 'unread-divider':
        return renderUnreadDivider();
      case 'paid-action': {
        return <PaidMessageAction entry={entry as Accessor<PaidActionEntry>} />;
      }
      case 'suggested-post': {
        return <SuggestedPostInfoAction entry={entry as Accessor<SuggestedPostEntry>} />;
      }
      case 'discussion-note':
        return (
          <div class="local-action-message">
            <span>
              {oldLang(props.isEmptyThread ? (props.isComments ? 'NoComments' : 'NoReplies') : 'DiscussionStarted')}
            </span>
          </div>
        );
      case 'date-header':
        return renderDateHeader((entry as Accessor<DateHeaderEntry>)().dateGroup);
      case 'action-message': {
        const action = entry as Accessor<ActionMessageEntry>;
        return (
          <ActionMessage
            message={action().message}
            threadId={props.threadId}
            observeIntersectionForBottom={observeIntersectionForReading}
            observeIntersectionForLoading={observeIntersectionForLoading}
            observeIntersectionForPlaying={observeIntersectionForPlaying}
            memoFirstUnreadIdRef={props.memoFirstUnreadIdRef}
            appearanceOrder={action().appearanceOrder}
            isJustAdded={action().isJustAdded}
            isLastInList={action().isLastInList}
            getIsMessageListReady={getIsReady}
            onMessageUnmount={onMessageUnmount}
          />
        );
      }
      case 'message': {
        const row = entry as Accessor<MessageEntry>;
        return (
          <Message
            message={row().message}
            containerRef={props.containerRef}
            observeIntersectionForBottom={observeIntersectionForReading}
            observeIntersectionForLoading={observeIntersectionForLoading}
            observeIntersectionForPlaying={observeIntersectionForPlaying}
            album={row().album}
            documentGroup={row().documentGroup}
            noAvatars={row().noAvatars}
            withAvatar={row().withAvatar}
            withSenderName={row().withSenderName}
            threadId={props.threadId}
            messageListType={props.type}
            noComments={row().noComments}
            noReplies={row().noReplies}
            appearanceOrder={row().appearanceOrder}
            isJustAdded={row().isJustAdded}
            isThreadTop={row().isThreadTop}
            isFirstInGroup={row().isFirstInGroup}
            isLastInGroup={row().isLastInGroup}
            isFirstInDocumentGroup={row().isFirstInDocumentGroup}
            isLastInDocumentGroup={row().isLastInDocumentGroup}
            isLastInList={row().isLastInList}
            shouldIgnoreSendFocus={row().shouldIgnoreSendFocus}
            isQuickPreview={props.isQuickPreview}
            memoFirstUnreadIdRef={props.memoFirstUnreadIdRef}
            getIsMessageListReady={getIsReady}
            isMessageListActive={props.isActive}
            onMessageUnmount={onMessageUnmount}
          />
        );
      }
      case 'sender-group': {
        const group = entry as Accessor<SenderGroupEntry>;
        return (
          <SenderGroupContainer
            id={group().id}
            message={group().message}
            withAvatar={group().withAvatar}
            appearanceOrder={group().appearanceOrder}
            canPost={props.canPost}
          >
            <Entries path={group().path!} />
          </SenderGroupContainer>
        );
      }
      case 'topic-group': {
        const topic = entry as Accessor<TopicGroupEntry>;
        return (
          <div
            class={buildClassName(
              'topic-group',
              topic().isContinuation && 'topic-group-continuation',
              topic().isBeforeDate && 'topic-group-before-date',
              topic().isBeforeContinuation && 'topic-group-before-continuation',
            )}
          >
            <TopicSeparator chatId={props.chatId} topicId={topic().topicId} />
            <Entries path={topic().path!} />
          </div>
        );
      }
    }
  };

  const Entries = (listProps: { path: string }) => {
    // read once: the path is made of keys, so it never changes for a row
    const path = untrack(() => listProps.path);
    return (
      <For each={model().childrenByPath.get(path) ?? []} keyed={(entry) => entry.key}>
        {(entry) => <EntryView entry={entry} />}
      </For>
    );
  };

  const DateGroupView = (rowProps: { group: Accessor<DateGroupEntry> }) => (
    <div
      class={buildClassName('message-date-group', rowProps.group().shouldAddFirstClass && 'first-message-date-group')}
      onMouseDown={preventMessageInputBlur}
    >
      <Entries path={rowProps.group().path!} />
    </div>
  );

  return (
    <div ref={messagesContainerRef} class="messages-container">
      <Show when={withHistoryTriggers()}>
        <div ref={backwardsTriggerRef} class="backwards-trigger" />
      </Show>
      <Show when={props.shouldRenderAccountInfo}>
        <Show when={props.chatId} keyed>
          {(chatId) => <MessageListAccountInfo chatId={chatId} hasMessages />}
        </Show>
      </Show>
      <For each={model().dateGroups} keyed={(group) => group.key}>
        {(group) => <DateGroupView group={group} />}
      </For>
      <Show when={model().liveTailDateGroups.length > 0}>
        <div class="live-tail">
          <For each={model().liveTailDateGroups} keyed={(group) => group.key}>
            {(group) => <DateGroupView group={group} />}
          </For>
        </div>
      </Show>
      {props.isViewportNewest && renderBotForumTopicAction()}
      <Show when={withHistoryTriggers()}>
        <div ref={forwardsTriggerRef} class="forwards-trigger" />
      </Show>
      <div ref={fabTriggerRef} class="fab-trigger" />
      <Show when={props.isViewportNewest}>
        <MessageListBottomMarker
          isFocused={props.shouldScrollToBottom}
          className={shouldRenderSponsoredMessage() ? 'with-sponsored' : undefined}
        />
      </Show>
      <Show when={shouldRenderSponsoredMessage()}>
        <Show when={props.chatId} keyed>
          {(chatId) => (
            <SponsoredMessage
              chatId={chatId}
              containerRef={props.containerRef}
              observeIntersectionForLoading={observeIntersectionForLoading}
              observeIntersectionForPlaying={observeIntersectionForPlaying}
            />
          )}
        </Show>
      </Show>
    </div>
  );
};

export default MessageListContent;
