import { createEffect, createMemo, onDestroy } from 'frameact';
import { Show } from 'frameact/dom';
import { getActions, withGlobal } from '../../../global';
import { depsOf } from '../../../util/effectDeps';
import { createShowTransition } from '../../../lib/kit';
import type { GlobalState } from '../../../global/types';

import type { ApiMessageAction } from '../../../api/types/messageActions';
import type { FocusDirection, ScrollTargetPosition, ThreadId } from '../../../types';
import type { Signal } from '../../../util/signals';
import {
  type ApiKeyboardButton,
  type ApiMessage,
  type ApiPeer,
  type KeyboardButtonGiftOffer,
  type KeyboardButtonNoForwardsRequest,
  MAIN_THREAD_ID,
} from '../../../api/types';
import { MediaViewerOrigin } from '../../../types';

import { MESSAGE_APPEARANCE_DELAY, SERVICE_NOTIFICATIONS_USER_ID } from '../../../config';
import { getMessageHtmlId, getUserFullName } from '../../../global/helpers';
import { getPeerTitle } from '../../../global/helpers/peers';
import { getMessageReplyInfo } from '../../../global/helpers/replies';
import {
  selectActionMessageBg,
  selectChat,
  selectChatMessage,
  selectIsCurrentUserFrozen,
  selectIsCurrentUserPremium,
  selectIsInSelectMode,
  selectIsMessageFocused,
  selectSender,
  selectShouldLoopStickers,
  selectTabState,
  selectUser,
} from '../../../global/selectors';
import { selectThreadReadState } from '../../../global/selectors/threads';
import { IS_TAURI } from '../../../util/browser/globalEnvironment';
import { IS_ANDROID, IS_FLUID_BACKGROUND_SUPPORTED } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import { getMtpEphemeralMessageId, isLocalMessageId } from '../../../util/keys/messageKey';
import { getServerTime } from '../../../util/serverTime';
import { isElementInViewport } from '../../../util/visibility/isElementInViewport';
import { preventMessageInputBlur } from '../helpers/preventMessageInputBlur';

import useAppLayout from '../../../hooks/useAppLayout';
import useContextMenuHandlers from '../../../hooks/useContextMenuHandlers';
import useEnsureMessage from '../../../hooks/useEnsureMessage';
import useFlag from '../../../hooks/useFlag';
import { type ObserveFn, useOnIntersect } from '../../../hooks/useIntersectionObserver';
import useLang from '../../../hooks/useLang';
import useFluidBackgroundFilter from './hooks/useFluidBackgroundFilter';
import useFocusMessageListElement from './hooks/useFocusMessageListElement';

import ConfirmDialog from '../../ui/ConfirmDialog';
import ActionMessageText from './ActionMessageText';
import ChannelPhoto from './actions/ChannelPhoto';
import Gift from './actions/Gift';
import GiveawayPrize from './actions/GiveawayPrize';
import GramTransfer from './actions/GramTransfer';
import NoForwardsRequest from './actions/NoForwardsRequest';
import StarGift from './actions/StarGift';
import StarGiftPurchaseOffer from './actions/StarGiftPurchaseOffer';
import StarGiftUnique from './actions/StarGiftUnique';
import SuggestedBirthday from './actions/SuggestedBirthday';
import SuggestedPhoto from './actions/SuggestedPhoto';
import SuggestedPostApproval from './actions/SuggestedPostApproval';
import SuggestedPostBalanceTooLow from './actions/SuggestedPostBalanceTooLow';
import SuggestedPostRejected from './actions/SuggestedPostRejected';
import WalletTonConnectRequest from './actions/WalletTonConnectRequest';
import ContextMenuContainer from './ContextMenuContainer';
import InlineButtons from './InlineButtons';
import Reactions from './reactions/Reactions';
import SimilarChannels from './SimilarChannels';

import styles from './ActionMessage.module.scss';

type OwnProps = {
  message: ApiMessage;
  threadId: ThreadId;
  appearanceOrder: number;
  isJustAdded?: boolean;
  isLastInList?: boolean;
  memoFirstUnreadIdRef?: { current: number | undefined };
  getIsMessageListReady?: Signal<boolean>;
  observeIntersectionForBottom?: ObserveFn;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  onMessageUnmount?: (messageId: number) => void;
};

type StateProps = {
  sender?: ApiPeer;
  currentUserId?: string;
  isInsideTopic?: boolean;
  isFocused?: boolean;
  focusDirection?: FocusDirection;
  noFocusHighlight?: boolean;
  replyMessage?: ApiMessage;
  actionMessageBg?: string;
  isCurrentUserPremium?: boolean;
  isInSelectMode?: boolean;
  hasUnreadReaction?: boolean;
  hasUnreadPollVote?: boolean;
  isResizingContainer?: boolean;
  scrollTargetPosition?: ScrollTargetPosition;
  isAccountFrozen?: boolean;
  noForwardsRequestExpirePeriod: number;
  transferPeerName?: string;
  isTransferLoading?: boolean;
  shouldLoopStickers?: boolean;
};

const SINGLE_LINE_ACTIONS = new Set<ApiMessageAction['type']>([
  'pinMessage',
  'chatEditPhoto',
  'chatDeletePhoto',
  'unsupported',
]);
const HIDDEN_TEXT_ACTIONS = new Set<ApiMessageAction['type']>([
  'giftCode',
  'prizeStars',
  'suggestProfilePhoto',
  'suggestBirthday',
  'suggestedPostApproval',
  'starGiftPurchaseOffer',
  'noForwardsRequest',
]);
const WITH_LINK_BREAKS_ACTIONS = new Set<ApiMessageAction['type']>([
  'todoCompletions',
  'todoAppendTasks',
  'pollAppendAnswer',
  'pollDeleteAnswer',
]);

const ActionMessage = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const {
    requestConfetti,
    openMediaViewer,
    getReceipt,
    checkGiftCode,
    openPrizeStarsTransactionFromGiveaway,
    openPremiumModal,
    openStarsTransactionFromGift,
    openGiftInfoModalFromMessage,
    openWalletTransaction,
    toggleChannelRecommendations,
    animateUnreadReaction,
    markMentionsRead,
    markPollVotesRead,
    focusMessage,
    openGiftOfferAcceptModal,
    declineStarGiftOffer,
    showNotification,
    toggleNoForwards,
  } = getActions();

  let ref!: HTMLDivElement;

  const source = createMemo(() => props.message);
  const id = () => source().id;
  const chatId = () => source().chatId;
  const action = createMemo(() => props.message.content.action!);
  const isLocal = createMemo(() => isLocalMessageId(id()));

  const isTextHidden = createMemo(() => HIDDEN_TEXT_ACTIONS.has(action().type));
  const isSingleLine = createMemo(() => SINGLE_LINE_ACTIONS.has(action().type));
  const withLinkBreaks = createMemo(() => WITH_LINK_BREAKS_ACTIONS.has(action().type));
  const isFluidMultiline = createMemo(() => IS_FLUID_BACKGROUND_SUPPORTED && !isSingleLine());
  const isClickableText = createMemo(() => action().type === 'suggestedPostSuccess');
  const isNarrowMessage = createMemo(() => action().type === 'starGiftPurchaseOfferDeclined');

  const messageReplyInfo = createMemo(() => getMessageReplyInfo(props.message));
  const source2 = createMemo(() => messageReplyInfo() || {});
  const replyToMsgId = () => source2().replyToMsgId;
  const replyToPeerId = () => source2().replyToPeerId;

  const withServiceReactions = createMemo(() => Boolean(props.message.areReactionsPossible && props.message?.reactions?.results?.length));

  const hasGiftOfferExpired = createMemo(() => action().type === 'starGiftPurchaseOffer' && action().expiresAt <= getServerTime());
  const shouldRenderGiftOfferButtons =
    createMemo(() => action().type === 'starGiftPurchaseOffer' &&
    !props.message.isOutgoing &&
    !action().isAccepted &&
    !action().isDeclined &&
    !hasGiftOfferExpired());

  const hasNoForwardsRequestExpired =
    createMemo(() => action().type === 'noForwardsRequest' && props.message.date + props.noForwardsRequestExpirePeriod <= getServerTime());
  const shouldRenderNoForwardsButtons =
    createMemo(() => action().type === 'noForwardsRequest' && !props.message.isOutgoing && !action().isExpired && !hasNoForwardsRequestExpired());

  const shouldRenderInlineButtons = createMemo(() => shouldRenderGiftOfferButtons() || shouldRenderNoForwardsButtons());

  const shouldSkipRender = createMemo(() => props.isInsideTopic && action().type === 'topicCreate');

  const lang = useLang();
  const { isTouchScreen } = useAppLayout();

  const giftOfferInlineButtons: KeyboardButtonGiftOffer[][] = createMemo(
    () => [
      [
        {
          action: { type: 'giftOffer', buttonType: 'reject' },
          text: lang('GiftOfferReject'),
        },
        {
          action: { type: 'giftOffer', buttonType: 'accept' },
          text: lang('GiftOfferAccept'),
        },
      ],
    ],
  );

  const noForwardsInlineButtons: KeyboardButtonNoForwardsRequest[][] = createMemo(
    () => [
      [
        {
          action: { type: 'noForwardsRequest', buttonType: 'reject' },
          text: lang('NoForwardsRequestReject'),
        },
        {
          action: { type: 'noForwardsRequest', buttonType: 'accept' },
          text: lang('NoForwardsRequestAccept'),
        },
      ],
    ],
  );

  const [isRejectOfferDialogOpen, openRejectOfferDialog, closeRejectOfferDialog] = useFlag(false);

  const handleInlineButtonClick = (button: ApiKeyboardButton) => {
    if (button.action.type === 'giftOffer') {
      if (button.action.buttonType === 'accept') {
        if (action().type === 'starGiftPurchaseOffer') {
          openGiftOfferAcceptModal({
            peerId: chatId(),
            messageId: id(),
            gift: action().gift,
            price: action().price,
          });
        }
      } else if (button.action.buttonType === 'reject') {
        openRejectOfferDialog();
      }
    } else if (button.action.type === 'noForwardsRequest') {
      if (action().type === 'noForwardsRequest') {
        const isAccept = button.action.buttonType === 'accept';
        toggleNoForwards({
          userId: chatId(),
          isEnabled: isAccept ? action().newValue : action().prevValue,
          requestMsgId: id(),
        });
      }
    }
  };

  const handleRejectOfferConfirm = () => {
    closeRejectOfferDialog();
    declineStarGiftOffer({ messageId: id() });
  };

  const handleRejectOfferClose = () => {
    closeRejectOfferDialog();
  };

  useOnIntersect(() => ref, () => !shouldSkipRender() ? props.observeIntersectionForBottom : undefined);

  useEnsureMessage(() => replyToPeerId() || chatId(), () => replyToMsgId(), () => props.replyMessage, () => id());
  useFocusMessageListElement({
    elementRef: () => ref,
    isFocused: () => props.isFocused,
    focusDirection: () => props.focusDirection,
    noFocusHighlight: () => props.noFocusHighlight,
    isResizingContainer: () => props.isResizingContainer,
    isJustAdded: () => props.isJustAdded,
    scrollTargetPosition: () => props.scrollTargetPosition,
  });

  const contextMenuHandlersResult = createMemo(() => useContextMenuHandlers(
    () => ref,
    () => (isTouchScreen && props.isInSelectMode) || props.isAccountFrozen,
    !IS_TAURI,
    IS_ANDROID,
    () => props.getIsMessageListReady,
  ));
  const isContextMenuOpen = () => contextMenuHandlersResult().isContextMenuOpen;
  const contextMenuAnchor = () => contextMenuHandlersResult().contextMenuAnchor;
  const isContextMenuAltKeyPressed = () => contextMenuHandlersResult().isContextMenuAltKeyPressed;
  const handleBeforeContextMenu = () => contextMenuHandlersResult().handleBeforeContextMenu;
  const handleContextMenu = () => contextMenuHandlersResult().handleContextMenu;
  const handleContextMenuClose = () => contextMenuHandlersResult().handleContextMenuClose;
  const handleContextMenuHide = () => contextMenuHandlersResult().handleContextMenuHide;
  const isContextMenuShown = createMemo(() => contextMenuAnchor() !== undefined);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    preventMessageInputBlur(e);
    handleBeforeContextMenu()(e);
  };

  const noAppearanceAnimation = createMemo(() => props.appearanceOrder <= 0);
  const [isShown, markShown] = useFlag(noAppearanceAnimation());
  createEffect(depsOf(() => [props.appearanceOrder, noAppearanceAnimation()] as const), ([appearanceOrder2, noAppearanceAnimation2]) => {
    if (noAppearanceAnimation2) {
      return;
    }

    // Message appearance animation works only if this timeout is not cleared
    setTimeout(markShown, appearanceOrder2 * MESSAGE_APPEARANCE_DELAY);
  });

  const { ref: refWithTransition } = createShowTransition({
    isOpen: () => isShown(),
    noOpenTransition: () => noAppearanceAnimation(),
    noCloseTransition: () => true,
    className: false,
    // TODO(codemod): ref option: hand the result `ref` to the element (ref={t.ref}) instead
    ref: () => ref,
  });

  onDestroy(() => {
    props.onMessageUnmount?.(id());
  });

  createEffect(depsOf(() => [
    props.hasUnreadReaction,
    props.hasUnreadPollVote,
    chatId(),
    id(),
    animateUnreadReaction,
    markPollVotesRead,
    props.message.hasUnreadMention,
  ] as const), ([hasUnreadReaction2, hasUnreadPollVote2, chatId2, id2]) => {
    const bottomMarker = ref;
    if (!bottomMarker || !isElementInViewport(bottomMarker)) return;

    if (hasUnreadReaction2) {
      animateUnreadReaction({ chatId: chatId2, messageIds: [id2] });
    }

    if (hasUnreadPollVote2) {
      markPollVotesRead({ chatId: chatId2, messageIds: [id2] });
    }

    if (props.message.hasUnreadMention) {
      markMentionsRead({ chatId: chatId2, messageIds: [id2] });
    }
  });

  // TODO(codemod): dependency on a container (memoFirstUnreadIdRef) keeps its identity while its content changes: track the fields the effect reads instead (store contract §12.7)
  createEffect(depsOf(() => [action().type, id(), isLocal(), props.memoFirstUnreadIdRef] as const), ([, id2, isLocal2, memoFirstUnreadIdRef2]) => {
    if (action().type !== 'giftPremium') return;
    if ((memoFirstUnreadIdRef2?.current && id2 >= memoFirstUnreadIdRef2.current) || isLocal2) {
      requestConfetti({});
    }
  });

  const fluidBackgroundStyle = useFluidBackgroundFilter(() => isFluidMultiline() ? props.actionMessageBg : undefined);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const handleClick = () => {
    switch (action().type) {
      case 'paymentSent':
      case 'paymentRefunded': {
        getReceipt({
          chatId: props.message.chatId,
          messageId: props.message.id,
        });
        break;
      }

      case 'chatEditPhoto': {
        openMediaViewer({
          chatId: props.message.chatId,
          messageId: props.message.id,
          threadId: props.threadId,
          origin: MediaViewerOrigin.ChannelAvatar,
        });
        break;
      }

      case 'giftCode': {
        checkGiftCode({ slug: action().slug, message: { chatId: props.message.chatId, messageId: props.message.id } });
        break;
      }

      case 'prizeStars': {
        openPrizeStarsTransactionFromGiveaway({
          chatId: props.message.chatId,
          messageId: props.message.id,
        });
        break;
      }

      case 'giftPremium': {
        openPremiumModal({
          isGift: true,
          fromUserId: props.sender?.id,
          toUserId: props.sender && props.sender.id === props.currentUserId ? chatId() : props.currentUserId,
          daysAmount: action().days,
        });
        break;
      }

      case 'giftTon':
      case 'giftStars': {
        openStarsTransactionFromGift({
          chatId: props.message.chatId,
          messageId: props.message.id,
        });
        break;
      }

      case 'gramTransfer': {
        if (!action().transactionId) break;

        openWalletTransaction({ transactionId: action().transactionId });
        break;
      }

      case 'starGift': {
        openGiftInfoModalFromMessage({
          chatId: props.message.chatId,
          messageId: props.message.id,
        });
        break;
      }

      case 'starGiftUnique': {
        if (action().gift.isBurned) {
          showNotification({ message: lang('ActionStarGiftUniqueBurnedError') });
          break;
        }
        openGiftInfoModalFromMessage({
          chatId: props.message.chatId,
          messageId: props.message.id,
        });
        break;
      }

      case 'starGiftPurchaseOffer': {
        if (shouldRenderGiftOfferButtons()) {
          openGiftOfferAcceptModal({
            peerId: chatId(),
            messageId: id(),
            gift: action().gift,
            price: action().price,
          });
        }
        break;
      }

      case 'channelJoined': {
        toggleChannelRecommendations({ chatId: chatId() });
        break;
      }

      case 'suggestedPostApproval': {
        const replyInfo = getMessageReplyInfo(props.message);
        if (replyInfo?.type === 'message' && replyInfo.replyToMsgId) {
          focusMessage({
            chatId: props.message.chatId,
            threadId: props.threadId,
            messageId: replyInfo.replyToMsgId,
          });
        }
        break;
      }

      case 'suggestedPostSuccess': {
        const replyInfo = getMessageReplyInfo(props.message);
        if (replyInfo?.type === 'message' && replyInfo.replyToMsgId) {
          focusMessage({
            chatId: props.message.chatId,
            threadId: props.threadId,
            messageId: replyInfo.replyToMsgId,
          });
        }
        break;
      }
    }
  };

  const fullContent = createMemo(() => {
    switch (action().type) {
      case 'chatEditPhoto': {
        if (!action().photo) return undefined;
        return (
          <ChannelPhoto action={action()} observeIntersection={props.observeIntersectionForLoading} onClick={handleClick} />
        );
      }

      case 'suggestProfilePhoto':
        return <SuggestedPhoto message={props.message} action={action()} observeIntersection={props.observeIntersectionForLoading} />;

      case 'suggestBirthday':
        return <SuggestedBirthday message={props.message} action={action()} />;

      case 'prizeStars':
      case 'giftCode':
        return (
          <GiveawayPrize
            action={action()}
            sender={props.sender}
            observeIntersectionForLoading={props.observeIntersectionForLoading}
            observeIntersectionForPlaying={props.observeIntersectionForPlaying}
            onClick={handleClick}
          />
        );

      case 'giftPremium':
      case 'giftTon':
      case 'giftStars':
        return (
          <Gift
            action={action()}
            observeIntersectionForLoading={props.observeIntersectionForLoading}
            observeIntersectionForPlaying={props.observeIntersectionForPlaying}
            onClick={handleClick}
          />
        );

      case 'walletTonConnectRequest': {
        // The server names a request by the wire id of its message, which an anchored one keeps in `ephemeralId`
        const ephemeralId = props.message.isEphemeral ? props.message.id : props.message.ephemeralId;

        return (
          <WalletTonConnectRequest
            action={action()}
            messageId={ephemeralId === undefined ? props.message.id : getMtpEphemeralMessageId(ephemeralId)}
          />
        );
      }

      case 'gramTransfer':
        return (
          <GramTransfer
            action={action()}
            peerName={props.message.chatId === SERVICE_NOTIFICATIONS_USER_ID ? lang('WalletUnknownUser') : props.transferPeerName}
            isOutgoing={props.message.isOutgoing}
            isSending={props.message.sendingState === 'messageSendingStatePending'}
            isFailed={props.message.sendingState === 'messageSendingStateFailed'}
            isLoading={props.isTransferLoading}
            shouldLoopStickers={props.shouldLoopStickers}
            onClick={handleClick}
          />
        );

      case 'starGift':
        return (
          <StarGift
            action={action()}
            message={props.message}
            observeIntersectionForLoading={props.observeIntersectionForLoading}
            observeIntersectionForPlaying={props.observeIntersectionForPlaying}
            onClick={handleClick}
          />
        );

      case 'starGiftUnique':
        return (
          <StarGiftUnique
            action={action()}
            message={props.message}
            observeIntersectionForLoading={props.observeIntersectionForLoading}
            observeIntersectionForPlaying={props.observeIntersectionForPlaying}
            onClick={handleClick}
          />
        );

      case 'starGiftPurchaseOffer':
        return (
          <StarGiftPurchaseOffer
            action={action()}
            message={props.message}
            hasButtons={shouldRenderGiftOfferButtons()}
            observeIntersectionForLoading={props.observeIntersectionForLoading}
            observeIntersectionForPlaying={props.observeIntersectionForPlaying}
            onClick={shouldRenderGiftOfferButtons() ? handleClick : undefined}
          />
        );

      case 'channelJoined':
        return <SimilarChannels chatId={props.message.chatId} />;

      case 'noForwardsRequest':
        return <NoForwardsRequest message={props.message} />;

      case 'suggestedPostApproval':
        if (action().isBalanceTooLow) {
          return <SuggestedPostBalanceTooLow message={props.message} action={action()} onClick={handleClick} />;
        }
        return action().isRejected ? (
          <SuggestedPostRejected message={props.message} action={action()} onClick={handleClick} />
        ) : (
          <SuggestedPostApproval message={props.message} action={action()} onClick={handleClick} />
        );

      default:
        return undefined;
    }
  });

  return (
    <Show when={!((props.isInsideTopic && action().type === 'topicCreate') || action().type === 'phoneCall')}>
    <div
      ref={refWithTransition}
      id={getMessageHtmlId(id())}
      class={buildClassName(
        'ActionMessage',
        'message-list-item',
        styles.root,
        isSingleLine() && styles.singleLine,
        withLinkBreaks() && styles.withLinkBreaks,
        isFluidMultiline() && styles.fluidMultiline,
        fullContent() && styles.hasFullContent,
        props.isFocused && !props.noFocusHighlight && 'focused',
        isContextMenuShown() && 'has-menu-open',
        props.isLastInList && 'last-in-list',
      )}
      data-message-id={props.message.id}
      data-is-pinned={props.message.isPinned || undefined}
      data-has-unread-mention={props.message.hasUnreadMention || undefined}
      data-has-unread-poll-vote={props.hasUnreadPollVote || undefined}
      data-has-unread-reaction={props.hasUnreadReaction || undefined}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu()}
    >
      {!isTextHidden() && (
        <>
          {isFluidMultiline() && (
            <div
              class={buildClassName(
                styles.inlineWrapper,
                isClickableText() && styles.hoverable,
                isNarrowMessage() && styles.narrowWrapper,
              )}
            >
              <span class={styles.fluidBackground} style={fluidBackgroundStyle}>
                <ActionMessageText message={props.message} isInsideTopic={props.isInsideTopic} />
              </span>
            </div>
          )}
          <div
            class={buildClassName(
              styles.inlineWrapper,
              isClickableText() && styles.hoverable,
              isNarrowMessage() && styles.narrowWrapper,
            )}
          >
            <span
              class={styles.textContent}
              role="button"
              tabIndex={0}
              onClick={handleClick}
              onKeyDown={handleKeyDown}
            >
              <ActionMessageText message={props.message} isInsideTopic={props.isInsideTopic} />
            </span>
          </div>
        </>
      )}
      {(fullContent() || shouldRenderInlineButtons()) && (
        <div class={styles.contentWrapper}>
          {fullContent()}
          {shouldRenderGiftOfferButtons() && (
            <InlineButtons
              className={styles.inlineButtons}
              inlineButtons={giftOfferInlineButtons()}
              onClick={handleInlineButtonClick}
            />
          )}
          {shouldRenderNoForwardsButtons() && (
            <InlineButtons
              className={styles.inlineButtons}
              inlineButtons={noForwardsInlineButtons()}
              onClick={handleInlineButtonClick}
            />
          )}
        </div>
      )}
      {contextMenuAnchor() && (
        <ContextMenuContainer
          isOpen={isContextMenuOpen()}
          anchor={contextMenuAnchor()}
          isAltKeyPressed={isContextMenuAltKeyPressed()}
          message={props.message}
          messageListType="thread"
          threadId={props.threadId}
          className={styles.contextContainer}
          onClose={handleContextMenuClose()}
          onCloseAnimationEnd={handleContextMenuHide()}
        />
      )}
      {withServiceReactions() && (
        <Reactions
          isOutside
          message={props.message}
          threadId={props.threadId}
          observeIntersection={props.observeIntersectionForPlaying}
          isCurrentUserPremium={props.isCurrentUserPremium}
          isAccountFrozen={props.isAccountFrozen}
        />
      )}
      <ConfirmDialog
        isOpen={isRejectOfferDialogOpen()}
        title={lang('GiftOfferRejectTitle')}
        textParts={lang(
          'GiftOfferRejectText',
          { user: props.sender ? getPeerTitle(lang, props.sender) : lang('ActionFallbackSomeone') },
          { withNodes: true, withMarkdown: true },
        )}
        confirmLabel={lang('GiftOfferReject')}
        confirmIsDestructive
        confirmHandler={handleRejectOfferConfirm}
        onClose={handleRejectOfferClose}
      />
    </div>
    </Show>
  );
};

const mapStateToProps = (global: GlobalState, { message, threadId }: OwnProps): Complete<StateProps> => {
    const tabState = selectTabState(global);

    const chat = selectChat(global, message.chatId);

    const sender = selectSender(global, message);

    const isInsideTopic = chat?.isForum && threadId !== MAIN_THREAD_ID;

    const { replyToMsgId, replyToPeerId } = getMessageReplyInfo(message) || {};
    const replyMessage = replyToMsgId
      ? selectChatMessage(global, replyToPeerId || message.chatId, replyToMsgId)
      : undefined;

    const isFocused = threadId ? selectIsMessageFocused(global, message, threadId) : false;
    const {
      direction: focusDirection,
      noHighlight: noFocusHighlight,
      isResizingContainer,
      scrollTargetPosition,
    } = (isFocused && tabState.focusedMessage) || {};

    const isCurrentUserPremium = selectIsCurrentUserPremium(global);

    const readState = selectThreadReadState(global, message.chatId, threadId);
    const hasUnreadReaction = readState?.unreadReactions?.includes(message.id);
    const hasUnreadPollVote = readState?.unreadPollVotes?.includes(message.id);
    const isAccountFrozen = selectIsCurrentUserFrozen(global);

    const messageAction = message.content.action;
    const isTransfer = messageAction?.type === 'gramTransfer';

    // The service chat reports transfers from senders the server does not name
    const transferPeerName =
      isTransfer && message.chatId !== SERVICE_NOTIFICATIONS_USER_ID
        ? getUserFullName(selectUser(global, message.chatId))
        : undefined;
    const isTransferLoading = isTransfer && tabState.loadingWalletTransactionId === messageAction.transactionId;

    // Read only for a transfer card, so other service messages do not re-render on the setting
    const shouldLoopStickers = isTransfer ? selectShouldLoopStickers(global) : undefined;

    return {
      sender,
      currentUserId: global.currentUserId,
      isCurrentUserPremium,
      isFocused,
      focusDirection,
      noFocusHighlight,
      isInsideTopic,
      replyMessage,
      isInSelectMode: selectIsInSelectMode(global),
      actionMessageBg: selectActionMessageBg(global),
      hasUnreadReaction,
      hasUnreadPollVote,
      isResizingContainer,
      scrollTargetPosition,
      isAccountFrozen,
      noForwardsRequestExpirePeriod: global.appConfig.noForwardsRequestExpirePeriod,
      transferPeerName,
      isTransferLoading,
      shouldLoopStickers,
    };
  };

export default ActionMessage;
