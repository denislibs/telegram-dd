import { createMemo, getIsHeavyAnimating } from 'frameact';
import type { JSX } from 'frameact/jsx-runtime';
import { getActions, getGlobal } from '../../global';

import type { ApiMessage } from '../../api/types';
import type { IAlbum, IDocumentGroup, MessageListType, ThreadId } from '../../types';
import type { Signal } from '../../util/signals';
import type { MessageDateGroup } from './helpers/groupMessages';
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
  getContainerHeight: Signal<number | undefined>;
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
  containerRef: (el: HTMLDivElement) => void;
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

type TopicSection = {
  target: JSX.Element[];
  topicId: number;
  key: string;
  isContinuation: boolean;
  isBeforeDate?: boolean;
  isBeforeContinuation?: boolean;
  children: JSX.Element[];
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

  const getIsHeavyAnimating2 = getIsHeavyAnimating;
  const getIsReady = createMemo(() => props.isReady && !getIsHeavyAnimating2());

  const areDatesClickable = createMemo(() => !props.isSavedDialog && !props.isSchedule);
  const isPrivate = createMemo(() => isUserId(props.chatId));
  const shouldRenderSponsoredMessage = createMemo(() => props.canShowAds && props.isViewportNewest);
  const shouldHideComments = createMemo(() => props.hasLinkedChat === false || !props.isChannelChat || Boolean(props.isChatMonoforum));

  const messageObserversResult = createMemo(() => useMessageObservers({
    type: () => props.type,
    containerRef: props.containerRef,
    memoFirstUnreadIdRef: () => props.memoFirstUnreadIdRef,
    chatId: () => props.chatId,
    threadId: () => props.threadId,
    isQuickPreview: () => props.isQuickPreview,
    onIntersectPinnedMessage: () => props.onIntersectPinnedMessage,
  }));
  const observeIntersectionForReading = () => messageObserversResult().observeIntersectionForReading;
  const observeIntersectionForLoading = () => messageObserversResult().observeIntersectionForLoading;
  const observeIntersectionForPlaying = () => messageObserversResult().observeIntersectionForPlaying;
  const onMessageUnmount = () => messageObserversResult().onMessageUnmount;

  const scrollHooksResult = createMemo(() => useScrollHooks({
    type: () => props.type,
    containerRef: props.containerRef,
    messageIds: () => props.historyMessageIds,
    getContainerHeight: () => props.getContainerHeight,
    isViewportNewest: () => props.isViewportNewest,
    isUnread: () => props.isUnread,
    isReady: () => props.isReady,
    isReplacingHistoryRef: () => props.isReplacingHistoryRef,
    onScrollDownToggle: props.onScrollDownToggle,
  }));
  const withHistoryTriggers = () => scrollHooksResult().withHistoryTriggers;
  const backwardsTriggerRef = () => scrollHooksResult().backwardsTriggerRef;
  const forwardsTriggerRef = () => scrollHooksResult().forwardsTriggerRef;
  const fabTriggerRef = () => scrollHooksResult().fabTriggerRef;

  const oldLang = useOldLang();
  const lang = useLang();

  const unreadDivider = (
    <div class={buildClassName(UNREAD_DIVIDER_CLASS, 'local-action-message')}>
      <span>{oldLang('UnreadMessages')}</span>
    </div>
  );
  const renderPaidMessageAction = (message: ApiMessage, album?: IAlbum) => {
    if (message.paidMessageStars) {
      const messagesLength = album?.messages?.length || 1;
      const amount = message.paidMessageStars * messagesLength;
      return (
        <div class={buildClassName('local-action-message')}>
          <span>
            {message.isOutgoing
              ? lang('ActionPaidOneMessageOutgoing', {
                  amount: formatStarsAsText(lang, amount),
                })
              : (() => {
                  const sender = selectSender(getGlobal(), message);
                  const userTitle = sender ? getPeerTitle(lang, sender) : '';
                  return lang('ActionPaidOneMessageIncoming', {
                    user: userTitle,
                    amount: formatStarsAsText(lang, amount),
                  });
                })()}
          </span>
        </div>
      );
    }
    return undefined;
  };

  const renderSuggestedPostInfoAction = (message: ApiMessage) => {
    if (message.suggestedPostInfo) {
      const { price, scheduleDate } = message.suggestedPostInfo;
      const sender = selectSender(getGlobal(), message);
      const userTitle = sender ? getPeerTitle(lang, sender) : '';
      const userLink = renderPeerLink(sender?.id, userTitle || lang('ActionFallbackUser'));

      const originalMessage =
        message.replyInfo?.type === 'message' && message.replyInfo.replyToMsgId
          ? selectChatMessage(getGlobal(), message.chatId, message.replyInfo.replyToMsgId)
          : undefined;
      const changesInfo = getSuggestedChangesInfo(message, originalMessage);

      const titleText = changesInfo
        ? getSuggestedChangesActionText(lang, message, originalMessage, message.isOutgoing, userLink)
        : message.isOutgoing
          ? lang('ActionSuggestedPostOutgoing', undefined, { withNodes: true, withMarkdown: true })
          : lang('ActionSuggestedPostIncoming', { user: userLink }, { withNodes: true, withMarkdown: true });

      const tableData: TableEntry[] = compact([
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

      return (
        <div class={buildClassName('local-action-message')}>
          <span class={actionMessageStyles.suggestedPostContainer}>
            <div class={actionMessageStyles.suggestedPostTitle}>{titleText}</div>
            {Boolean(tableData.length) && (
              <MiniTable className={actionMessageStyles.suggestedPostInfo} data={tableData} />
            )}
          </span>
        </div>
      );
    }
    return undefined;
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

  const messageCountToAnimate = createMemo(() => props.noAppearanceAnimation
    ? 0
    : props.messageGroups.reduce((acc, messageGroup) => {
        return (
          acc +
          messageGroup.senderGroups.flat().reduce((innerAcc, messageOrAlbum) => {
            return innerAcc + (isDocumentGroup(messageOrAlbum) ? messageOrAlbum.messages.length : 1);
          }, 0)
        );
      }, 0));
  let appearanceIndex = 0;

  function calculateSenderGroups(
    dateGroup: MessageDateGroup,
    dateGroupIndex: number,
    dateGroupsArray: MessageDateGroup[],
  ) {
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

        return compact([
          message.id === props.memoUnreadDividerBeforeIdRef.current && unreadDivider,
          <ActionMessage
            message={message}
            threadId={props.threadId}
            observeIntersectionForBottom={observeIntersectionForReading()}
            observeIntersectionForLoading={observeIntersectionForLoading()}
            observeIntersectionForPlaying={observeIntersectionForPlaying()}
            memoFirstUnreadIdRef={props.memoFirstUnreadIdRef}
            appearanceOrder={messageCountToAnimate() - ++appearanceIndex}
            isJustAdded={addedMessageIdSet()?.has(message.id)}
            isLastInList={isLastInList}
            getIsMessageListReady={getIsReady()}
            onMessageUnmount={onMessageUnmount()}
          />,
        ]);
      }

      let currentDocumentGroupHasThreadTop = false;

      const senderGroupElements = senderGroup
        .map((messageOrAlbum, messageIndex) => {
          function renderMessageElement(
            message: ApiMessage,
            position: {
              isFirstInGroup: boolean;
              isLastInGroup: boolean;
              isFirstInDocumentGroup: boolean;
              isLastInDocumentGroup: boolean;
              isLastInList: boolean;
            },
            isThreadTopMessage: boolean,
            album?: IAlbum,
            documentGroup?: IDocumentGroup,
          ) {
            const isOwn = isOwnMessage(message);
            const originalId = getMessageOriginalId(message);
            const isInLiveTail = props.liveTailStartOriginalId !== undefined && originalId >= props.liveTailStartOriginalId;
            const key = isServiceNotificationMessage(message) ? `${message.date}_${originalId}` : originalId;
            const shouldShowGuestAvatar = isPrivate() && !props.withUsers && Boolean(message.guestChatViaId);
            const isJustAdded =
              addedMessageIdSet()?.has(message.id) ||
              Boolean(album?.messages.some(({ id }) => addedMessageIdSet()?.has(id)));

            return compact([
              message.id === props.memoUnreadDividerBeforeIdRef.current && unreadDivider,
              message.paidMessageStars && !props.withUsers && renderPaidMessageAction(message, album),
              message.suggestedPostInfo && renderSuggestedPostInfoAction(message),
              <Message
                message={message}
                containerRef={props.containerRef}
                observeIntersectionForBottom={observeIntersectionForReading()}
                observeIntersectionForLoading={observeIntersectionForLoading()}
                observeIntersectionForPlaying={observeIntersectionForPlaying()}
                album={album}
                documentGroup={documentGroup}
                noAvatars={props.noAvatars && !shouldShowGuestAvatar}
                withAvatar={
                  position.isLastInGroup &&
                  (props.withUsers || shouldShowGuestAvatar) &&
                  !isOwn &&
                  (!isThreadTopMessage || !props.isComments)
                }
                withSenderName={position.isFirstInGroup && (props.withUsers || shouldShowGuestAvatar) && !isOwn}
                threadId={props.threadId}
                messageListType={props.type}
                noComments={shouldHideComments()}
                noReplies={!shouldHideComments() || props.threadId !== MAIN_THREAD_ID || props.type === 'scheduled'}
                appearanceOrder={messageCountToAnimate() - ++appearanceIndex}
                isJustAdded={isJustAdded}
                isThreadTop={isThreadTopMessage}
                isFirstInGroup={position.isFirstInGroup}
                isLastInGroup={position.isLastInGroup}
                isFirstInDocumentGroup={position.isFirstInDocumentGroup}
                isLastInDocumentGroup={position.isLastInDocumentGroup}
                isLastInList={position.isLastInList}
                shouldIgnoreSendFocus={isInLiveTail && isOwn}
                isQuickPreview={props.isQuickPreview}
                memoFirstUnreadIdRef={props.memoFirstUnreadIdRef}
                getIsMessageListReady={getIsReady()}
                isMessageListActive={props.isActive}
                onMessageUnmount={onMessageUnmount()}
              />,
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
      const lastAppearanceOrder = messageCountToAnimate() - appearanceIndex;

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

      const withAvatar = (props.withUsers || shouldShowGuestAvatar) && !isOwn && (!isThreadTopMessage || !props.isComments);
      return compact([
        <SenderGroupContainer
          id={id}
          message={lastMessage}
          withAvatar={withAvatar}
          appearanceOrder={lastAppearanceOrder}
          canPost={props.canPost}
        >
          {senderGroupElements}
        </SenderGroupContainer>,
        isThreadTopMessage && (
          <div class="local-action-message">
            <span>{oldLang(props.isEmptyThread ? (props.isComments ? 'NoComments' : 'NoReplies') : 'DiscussionStarted')}</span>
          </div>
        ),
      ]);
    });
  }

  function renderDateHeader(dateGroup: MessageDateGroup) {
    return (
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
  }

  function renderTopicGroup({
    topicId,
    key,
    isContinuation,
    isBeforeDate,
    isBeforeContinuation,
    children,
  }: TopicSection) {
    return (
      // TODO(codemod): teactFastList without a single .map() child: use <For> / <ManualFor> for the rows
      <div
        class={buildClassName(
          'topic-group',
          isContinuation && 'topic-group-continuation',
          isBeforeDate && 'topic-group-before-date',
          isBeforeContinuation && 'topic-group-before-continuation',
        )}
      >
        <TopicSeparator chatId={props.chatId} topicId={topicId} />
        {children}
      </div>
    );
  }

  function renderDateGroup(
    dateGroup: MessageDateGroup,
    children: JSX.Element[],
    keySuffix: string,
    shouldAddFirstClass: boolean,
  ) {
    return (
      // TODO(codemod): teactFastList without a single .map() child: use <For> / <ManualFor> for the rows
      <div
        class={buildClassName('message-date-group', shouldAddFirstClass && 'first-message-date-group')}
        onMouseDown={preventMessageInputBlur}
      >
        {children}
      </div>
    );
  }

  let isRenderingLiveTail = false;
  let currentTopicId: number | undefined;
  const dateGroups: JSX.Element[] = [];
  const liveTailDateGroups: JSX.Element[] = [];

  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  props.messageGroups.forEach((dateGroup: MessageDateGroup, dateGroupIndex: number, dateGroupsArray: MessageDateGroup[]) => {
    const senderGroups = calculateSenderGroups(dateGroup, dateGroupIndex, dateGroupsArray);
    const beforeTailChildren: JSX.Element[] = [];
    const liveTailChildren: JSX.Element[] = [];
    const topicSections: TopicSection[] = [];
    const sectionCountByTopicId = new Map<number, number>();

    if (isRenderingLiveTail) {
      liveTailChildren.push(renderDateHeader(dateGroup));
    } else {
      beforeTailChildren.push(renderDateHeader(dateGroup));
    }

    senderGroups.forEach((senderGroupElements, senderGroupIndex) => {
      const isLiveTailStart =
        !isRenderingLiveTail &&
        props.liveTailStartOriginalId !== undefined &&
        senderGroupContainsOriginalId(dateGroup.senderGroups[senderGroupIndex], props.liveTailStartOriginalId);

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
      section.target.push(renderTopicGroup(section));
    });

    const shouldAddFirstClass =
      !props.shouldRenderAccountInfo && !(props.nameChangeDate || props.photoChangeDate) && dateGroupIndex === 0;
    if (beforeTailChildren.length) {
      dateGroups.push(renderDateGroup(dateGroup, beforeTailChildren, 'before-tail', shouldAddFirstClass));
    }

    if (liveTailChildren.length) {
      liveTailDateGroups.push(
        renderDateGroup(dateGroup, liveTailChildren, 'live-tail', shouldAddFirstClass && !beforeTailChildren.length),
      );
    }
  });

  return (
    // TODO(codemod): teactFastList without a single .map() child: use <For> / <ManualFor> for the rows
    <div ref={messagesContainerRef} class="messages-container">
      {withHistoryTriggers() && <div ref={backwardsTriggerRef()} class="backwards-trigger" />}
      {/* TODO(codemod): key= on a single element remounted it: wrap in <Show when={key} keyed>{() => …}</Show> */}
      {props.shouldRenderAccountInfo && <MessageListAccountInfo key={`account_info_${props.chatId}`} chatId={props.chatId} hasMessages />}
      {dateGroups}
      {Boolean(liveTailDateGroups.length) && (
        // TODO(codemod): teactFastList without a single .map() child: use <For> / <ManualFor> for the rows
        <div class="live-tail">
          {liveTailDateGroups}
        </div>
      )}
      {props.isViewportNewest && renderBotForumTopicAction()}
      {withHistoryTriggers() && <div ref={forwardsTriggerRef()} class="forwards-trigger" />}
      <div ref={fabTriggerRef()} class="fab-trigger" />
      {props.isViewportNewest && (
        <MessageListBottomMarker
          isFocused={props.shouldScrollToBottom}
          className={shouldRenderSponsoredMessage() ? 'with-sponsored' : undefined}
        />
      )}
      {shouldRenderSponsoredMessage() && (
        // TODO(codemod): key= on a single element remounted it: wrap in <Show when={key} keyed>{() => …}</Show>
        <SponsoredMessage
          key={props.chatId}
          chatId={props.chatId}
          containerRef={props.containerRef}
          observeIntersectionForLoading={observeIntersectionForLoading()}
          observeIntersectionForPlaying={observeIntersectionForPlaying()}
        />
      )}
    </div>
  );
};

export default MessageListContent;
