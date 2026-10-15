import { createEffect, createMemo, createSignal, onMount, previous, requestMeasure, requestMutation } from 'frameact';
import { ManualFor } from 'frameact/dom';
import { getActions, withGlobal } from '../../global';
import { depsOf } from '../../util/effectDeps';
import type { GlobalState } from '../../global/types';

import type { ApiChat, ApiChatBannedRights, ApiInputDraftReplyInfo, ApiTopic } from '../../api/types';
import type { ActiveEmojiInteraction, AnimationLevel, MessageListType, ThemeKey, ThreadId } from '../../types';
import { MAIN_THREAD_ID } from '../../api/types';

import {
  ANIMATION_END_DELAY,
  ANONYMOUS_USER_ID,
  EDITABLE_INPUT_CSS_SELECTOR,
  EDITABLE_INPUT_ID,
  GENERAL_TOPIC_ID,
  SUPPORTED_PHOTO_CONTENT_TYPES,
  SUPPORTED_VIDEO_CONTENT_TYPES,
  TMP_CHAT_ID,
} from '../../config';
import {
  getCanPostInChat,
  getForumComposerPlaceholder,
  getHasAdminRight,
  getIsSavedDialog,
  getMessageSendingRestrictionReason,
  isChatChannel,
  isChatGroup,
  isChatSuperGroup,
  isUserRightBanned,
} from '../../global/helpers';
import { getIsChatMuted } from '../../global/helpers/notifications';
import {
  selectActionMessageBg,
  selectBot,
  selectCanAnimateInterface,
  selectCanAnimateRightColumn,
  selectChat,
  selectChatFullInfo,
  selectCurrentMessageList,
  selectCurrentMiddleSearch,
  selectIsChatBotNotStarted,
  selectIsCurrentUserFrozen,
  selectIsInSelectMode,
  selectIsMonoforumAdmin,
  selectIsRightColumnShown,
  selectIsUserBlocked,
  selectNotifyDefaults,
  selectNotifyException,
  selectPeerPaidMessagesStars,
  selectPinnedIds,
  selectTabState,
  selectTheme,
  selectThemeValues,
  selectTopic,
  selectTopics,
  selectUserFullInfo,
} from '../../global/selectors';
import { selectSharedSettings } from '../../global/selectors/sharedState';
import { selectDraft, selectEditingId, selectThreadInfo } from '../../global/selectors/threads';
import {
  IS_ANDROID,
  IS_IOS,
  IS_SAFARI,
  IS_TRANSLATION_SUPPORTED,
  MASK_IMAGE_DISABLED,
} from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';
import captureEscKeyListener from '../../util/captureEscKeyListener';
import { waitForTransitionEnd } from '../../util/cssAnimationEndListeners';
import { isUserId } from '../../util/entities/ids';
import { resolveTransitionName } from '../../util/resolveTransitionName';
import getHasMiddleFooter, { getHasFooterActionBar } from './helpers/getHasMiddleFooter';
import { measureFooterContentHeight, syncMessageListBottomReserve } from './helpers/messageListReserves';

import useAppLayout from '../../hooks/useAppLayout';
import useDebouncedCallback from '../../hooks/useDebouncedCallback';
import useForceUpdate from '../../hooks/useForceUpdate';
import useHistoryBack from '../../hooks/useHistoryBack';
import useLang from '../../hooks/useLang';
import useOldLang from '../../hooks/useOldLang';
import usePrevDuringAnimation from '../../hooks/usePrevDuringAnimation';
import { useResize } from '../../hooks/useResize';
import usePinnedMessage from './hooks/usePinnedMessage';
import useFluidBackgroundFilter from './message/hooks/useFluidBackgroundFilter';

import Composer from '../common/Composer';
import PrivacySettingsNoticeModal from '../common/PrivacySettingsNoticeModal.async';
import SeenByModal from '../common/SeenByModal.async';
import UnpinAllMessagesModal from '../common/UnpinAllMessagesModal.async';
import Transition from '../ui/Transition';
import ChatLanguageModal from './ChatLanguageModal.async';
import { DropAreaState } from './composer/DropArea';
import EmojiInteractionAnimation from './EmojiInteractionAnimation.async';
import FloatingActionButtons from './FloatingActionButtons';
import FooterActionBar from './footer/FooterActionBar';
import FrozenAccountPlaceholder from './FrozenAccountPlaceholder';
import MessageList from './MessageList';
import MessageSelectToolbar from './MessageSelectToolbar';
import MiddleHeader from './MiddleHeader';
import MiddleHeaderPanesIsland from './MiddleHeaderPanesIsland';
import AudioPlayer from './panes/AudioPlayer';
import PremiumRequiredPlaceholder from './PremiumRequiredPlaceholder';
import ReactorListModal from './ReactorListModal.async';
import MiddleSearch from './search/MiddleSearch.async';

import './MiddleColumn.scss';

interface OwnProps {
  leftColumnRef: (el: HTMLDivElement) => void;
  isMobile?: boolean;
  onPlayerPaneStateChange: (state: PaneState) => void;
}

type StateProps = {
  chatId?: string;
  threadId?: ThreadId;
  isComments?: boolean;
  messageListType?: MessageListType;
  chat?: ApiChat;
  draftReplyInfo?: ApiInputDraftReplyInfo;
  isPrivate?: boolean;
  isPinnedMessageList?: boolean;
  canPost?: boolean;
  currentUserBannedRights?: ApiChatBannedRights;
  defaultBannedRights?: ApiChatBannedRights;
  pinnedMessagesCount?: number;
  theme: ThemeKey;
  customBackground?: string;
  backgroundColor?: string;
  patternColor?: string;
  actionMessageBg?: string;
  isLeftColumnShown?: boolean;
  isRightColumnShown?: boolean;
  isBackgroundBlurred?: boolean;
  leftColumnWidth?: number;
  hasActiveMiddleSearch?: boolean;
  isRichInputExpanded?: boolean;
  isSelectModeActive?: boolean;
  isSeenByModalOpen: boolean;
  isPrivacySettingsNoticeModalOpen: boolean;
  isReactorListModalOpen: boolean;
  isChatLanguageModalOpen?: boolean;
  animationLevel: AnimationLevel;
  withInterfaceAnimations?: boolean;
  withRightColumnAnimation?: boolean;
  shouldSkipHistoryAnimations?: boolean;
  currentTransitionKey: number;
  isChannel?: boolean;
  arePeerSettingsLoaded?: boolean;
  canSubscribe?: boolean;
  canStartBot?: boolean;
  canRestartBot?: boolean;
  shouldLoadFullChat?: boolean;
  activeEmojiInteractions?: ActiveEmojiInteraction[];
  shouldJoinToSend?: boolean;
  shouldSendJoinRequest?: boolean;
  pinnedIds?: number[];
  canUnpin?: boolean;
  canUnblock?: boolean;
  isChannelMuteBar?: boolean;
  isMuted?: boolean;
  linkedMonoforumId?: string;
  areGiftsAvailable?: boolean;
  isSavedDialog?: boolean;
  canShowOpenChatButton?: boolean;
  isContactRequirePremium?: boolean;
  topics?: Record<number, ApiTopic>;
  paidMessagesStars?: number;
  isAccountFrozen?: boolean;
  freezeAppealChat?: ApiChat;
  shouldBlockSendInMonoforum?: boolean;
  isUiReady?: boolean;
};

function isImage(item: DataTransferItem) {
  return item.kind === 'file' && item.type && SUPPORTED_PHOTO_CONTENT_TYPES.has(item.type);
}

function isVideo(item: DataTransferItem) {
  return item.kind === 'file' && item.type && SUPPORTED_VIDEO_CONTENT_TYPES.has(item.type);
}

const LAYER_ANIMATION_DURATION_MS = 450 + ANIMATION_END_DELAY;
const KEYBOARD_SETTLE_DURATION = 400;
const DROP_AREA_HIDE_TIMEOUT_MS = 150;

function MiddleColumn(ownProps: OwnProps) {
  const props = withGlobal(ownProps, mapStateToProps);
  const {
    openChat,
    openPreviousChat,
    unpinAllMessages,
    loadUser,
    loadPeerSettings,
    exitMessageSelectMode,
    loadFullChat,
    setLeftColumnWidth,
    resetLeftColumnWidth,
  } = getActions();

  const { isTablet, isDesktop } = useAppLayout();

  const oldLang = useOldLang();
  const lang = useLang();
  const [dropAreaState, setDropAreaState] = createSignal(DropAreaState.None);
  const [isScrollDownNeeded, setIsScrollDownNeeded] = createSignal(false);
  const isScrollDownShown = createMemo(() => isScrollDownNeeded() && (!props.isMobile || !props.hasActiveMiddleSearch));
  const [isUnpinModalOpen, setIsUnpinModalOpen] = createSignal(false);

  const pinnedMessageResult = createMemo(() => usePinnedMessage(() => props.chatId, () => props.threadId, () => props.pinnedIds));
  const handleIntersectPinnedMessage = () => pinnedMessageResult().handleIntersectPinnedMessage;
  const handleFocusPinnedMessage = () => pinnedMessageResult().handleFocusPinnedMessage;
  const getCurrentPinnedIndex = () => pinnedMessageResult().getCurrentPinnedIndex;
  const getLoadingPinnedId = () => pinnedMessageResult().getLoadingPinnedId;

  const closeAnimationDuration = createMemo(() => props.isMobile ? LAYER_ANIMATION_DURATION_MS : undefined);

  // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
  const renderingChatId = usePrevDuringAnimation(props.chatId, closeAnimationDuration());
  // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
  const renderingThreadId = usePrevDuringAnimation(props.threadId, closeAnimationDuration());
  // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
  const renderingMessageListType = usePrevDuringAnimation(props.messageListType, closeAnimationDuration());
  // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
  const renderingCanSubscribe = usePrevDuringAnimation(props.canSubscribe, closeAnimationDuration());
  // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
  const renderingCanStartBot = usePrevDuringAnimation(props.canStartBot, closeAnimationDuration());
  // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
  const renderingCanRestartBot = usePrevDuringAnimation(props.canRestartBot, closeAnimationDuration());
  // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
  const renderingCanUnblock = usePrevDuringAnimation(props.canUnblock, closeAnimationDuration());
  const renderingCanPost =
    // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
    createMemo(() => usePrevDuringAnimation(props.canPost, closeAnimationDuration()) &&
    !renderingCanRestartBot &&
    !renderingCanStartBot &&
    !renderingCanSubscribe &&
    !renderingCanUnblock &&
    props.chatId !== TMP_CHAT_ID &&
    !props.isContactRequirePremium);
  const renderingIsScrollDownShown =
    // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
    createMemo(() => usePrevDuringAnimation(isScrollDownShown(), closeAnimationDuration()) && props.chatId !== TMP_CHAT_ID);
  // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
  const renderingIsChannel = usePrevDuringAnimation(props.isChannel, closeAnimationDuration());
  // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
  const renderingShouldJoinToSend = usePrevDuringAnimation(props.shouldJoinToSend, closeAnimationDuration());
  // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
  const renderingShouldSendJoinRequest = usePrevDuringAnimation(props.shouldSendJoinRequest, closeAnimationDuration());
  // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
  const renderingIsChannelMuteBar = usePrevDuringAnimation(props.isChannelMuteBar, closeAnimationDuration());
  // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
  const renderingIsMuted = usePrevDuringAnimation(props.isMuted, closeAnimationDuration());
  // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
  const renderingLinkedMonoforumId = usePrevDuringAnimation(props.linkedMonoforumId, closeAnimationDuration());
  // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
  const renderingAreGiftsAvailable = usePrevDuringAnimation(props.areGiftsAvailable, closeAnimationDuration());
  // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
  const renderingHandleIntersectPinnedMessage = usePrevDuringAnimation(
    props.chatId ? handleIntersectPinnedMessage() : undefined,
    closeAnimationDuration(),
  );

  const prevTransitionKey = previous(() => props.currentTransitionKey);

  const cleanupExceptionKey =
    createMemo(() => prevTransitionKey() !== undefined && prevTransitionKey() < props.currentTransitionKey ? prevTransitionKey() : undefined);

  let middleColumnRef!: HTMLDivElement;
  let dropAreaHideTimeoutRef: number | undefined;
  let isViewportAnimatingRef = false;
  const getIsKeyboardAnimating = () => isViewportAnimatingRef;

  const syncFooterSlide = (footer: HTMLElement) => {
    if (!footer.offsetParent) return;

    const contentHeight = measureFooterContentHeight(footer);
    requestMutation(() => {
      footer.style.setProperty('--middle-footer-content-height', `${contentHeight}px`);
    });

    const scroller = footer.parentElement?.querySelector<HTMLElement>('.MessageList');
    if (scroller) syncMessageListBottomReserve(scroller, getIsKeyboardAnimating());
  };

  const updateFooterHeight = () => {
    const middleColumn = middleColumnRef;
    if (!middleColumn) return;

    middleColumn.querySelectorAll<HTMLElement>('.middle-column-footer').forEach((footer) => {
      syncFooterSlide(footer);
    });
  };

  const markViewportSettled = useDebouncedCallback(
    () => {
      isViewportAnimatingRef = false;
      updateFooterHeight();
    },
    [updateFooterHeight],
    KEYBOARD_SETTLE_DURATION,
    true,
    false,
  );

  createEffect(depsOf(() => [props.currentTransitionKey, renderingChatId, renderingThreadId, updateFooterHeight, syncFooterSlide] as const), ([currentTransitionKey2]) => {
    const middleColumn = middleColumnRef;
    if (!middleColumn) return undefined;

    updateFooterHeight();

    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => syncFooterSlide(entry.target as HTMLElement));
    });
    middleColumn.querySelectorAll<HTMLElement>('.middle-column-footer').forEach((footer) => {
      observer.observe(footer, { box: 'border-box' });
    });

    return () => observer.disconnect();
  });

  const isReadyResult = createMemo(() => useIsReady(
    () => !props.shouldSkipHistoryAnimations && props.withInterfaceAnimations,
    () => props.currentTransitionKey,
    () => prevTransitionKey(),
    () => props.chatId,
    () => props.isMobile,
    () => props.isLeftColumnShown,
    () => middleColumnRef,
  ));
  const isReady = () => isReadyResult().isReady;
  const handleSlideTransitionStop = () => isReadyResult().handleSlideTransitionStop;

  createEffect(depsOf(() => [props.chatId, openChat, props.isRightColumnShown] as const), ([chatId2, , isRightColumnShown2]) => {
    return chatId2
      ? captureEscKeyListener(() => {
          // Let the Right Column (profile, management, etc.) handle Esc first while it is open
          if (isRightColumnShown2) return false;
          openChat({ id: undefined });
          return undefined;
        })
      : undefined;
  });

  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(() => props.chatId, (chatId2) => {
    setDropAreaState(DropAreaState.None);
  });

  // Fix for mobile virtual keyboard
  onMount(() => {
    if (!IS_IOS && !IS_ANDROID) {
      return undefined;
    }

    const { visualViewport } = window;
    if (!visualViewport) {
      return undefined;
    }

    const handleResize = () => {
      isViewportAnimatingRef = true;
      markViewportSettled();

      const isFixNeeded = visualViewport.height !== document.documentElement.clientHeight;

      requestMutation(() => {
        document.body.classList.toggle('keyboard-visible', isFixNeeded);

        requestMeasure(() => {
          if (!isFixNeeded && visualViewport.offsetTop) {
            requestMutation(() => {
              window.scrollTo({ top: 0 });
            });
          }
        });
      });
    };

    visualViewport.addEventListener('resize', handleResize);

    return () => {
      visualViewport.removeEventListener('resize', handleResize);
    };
  });

  createEffect(depsOf(() => [props.chatId, props.isPrivate, loadUser] as const), ([chatId2, isPrivate2]) => {
    if (isPrivate2) {
      loadUser({ userId: chatId2! });
    }
  });

  createEffect(depsOf(() => [props.chatId, props.isPrivate, props.arePeerSettingsLoaded] as const), ([chatId2, isPrivate2, arePeerSettingsLoaded2]) => {
    if (!arePeerSettingsLoaded2) {
      loadPeerSettings({ peerId: chatId2! });
    }
  });

  createEffect(depsOf(() => [props.shouldLoadFullChat, props.chatId, isReady(), loadFullChat] as const), ([shouldLoadFullChat2, chatId2, isReady2]) => {
    if (chatId2 && shouldLoadFullChat2 && isReady2) {
      loadFullChat({ chatId: chatId2 });
    }
  });

  const resizeResult = createMemo(() => useResize(
    props.leftColumnRef,
    (n) =>
      setLeftColumnWidth({
        leftColumnWidth: n,
      }),
    resetLeftColumnWidth,
    () => props.leftColumnWidth,
    '--left-column-width',
  ));
  const initResize = () => resizeResult().initResize;
  const resetResize = () => resizeResult().resetResize;
  const handleMouseUp = () => resizeResult().handleMouseUp;

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    window.clearTimeout(dropAreaHideTimeoutRef);

    if (props.isRichInputExpanded) {
      setDropAreaState(DropAreaState.None);
      return;
    }

    const { items } = e.dataTransfer || {};
    // In Safari, the e.dataTransfer.items list may be empty during dragenter/dragover events,
    // preventing the ability to determine file types in advance. More details: https://bugs.webkit.org/show_bug.cgi?id=223517
    const shouldDrawQuick =
      IS_SAFARI ||
      (items &&
        items.length > 0 &&
        Array.from(items)
          // Filter unnecessary element for drag and drop images in Firefox (https://github.com/Ajaxy/telegram-tt/issues/49)
          // https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types#image
          .filter((item) => item.type !== 'text/uri-list')
          .every((item) => isImage(item) || isVideo(item)));

    setDropAreaState(shouldDrawQuick ? DropAreaState.QuickFile : DropAreaState.Document);
  };

  const handleHideDropArea = () => {
    setDropAreaState(DropAreaState.None);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    const { relatedTarget } = e;
    if (relatedTarget instanceof Node && middleColumnRef!.contains(relatedTarget)) return;

    window.clearTimeout(dropAreaHideTimeoutRef);
    dropAreaHideTimeoutRef = window.setTimeout(handleHideDropArea, DROP_AREA_HIDE_TIMEOUT_MS);
  };

  const handleDragOver = () => {
    window.clearTimeout(dropAreaHideTimeoutRef);
  };

  const handleOpenUnpinModal = () => {
    setIsUnpinModalOpen(true);
  };

  const closeUnpinModal = () => {
    setIsUnpinModalOpen(false);
  };

  const handleUnpinAllMessages = () => {
    unpinAllMessages({ chatId: props.chatId!, threadId: props.threadId! });
    closeUnpinModal();
    openPreviousChat();
  };

  const handleTabletFocus = () => {
    openChat({ id: props.chatId });
  };

  const className = createMemo(() => buildClassName(
    MASK_IMAGE_DISABLED ? 'mask-image-disabled' : 'mask-image-enabled',
    props.isUiReady && 'ui-ready',
  ));

  const messagingDisabledClassName = createMemo(() => buildClassName('messaging-disabled', !props.isSelectModeActive && 'shown'));

  const messageSendingRestrictionReason = createMemo(() => getMessageSendingRestrictionReason(
    oldLang,
    props.currentUserBannedRights,
    props.defaultBannedRights,
  ));
  const forumComposerPlaceholder = createMemo(() => getForumComposerPlaceholder(
    oldLang,
    props.chat,
    props.threadId,
    props.topics,
    Boolean(props.draftReplyInfo),
  ));

  const composerRestrictionMessage =
    createMemo(() => messageSendingRestrictionReason() ||
    forumComposerPlaceholder() ||
    (props.shouldBlockSendInMonoforum ? lang('MonoforumComposerPlaceholder') : undefined) ||
    (props.isContactRequirePremium ? <PremiumRequiredPlaceholder userId={props.chatId!} /> : undefined) ||
    (props.isAccountFrozen && props.freezeAppealChat?.id !== props.chatId ? <FrozenAccountPlaceholder /> : undefined));

  useHistoryBack({
    isActive: () => props.isSelectModeActive,
    onBack: exitMessageSelectMode,
  });

  // Prepare filter beforehand to avoid flickering
  useFluidBackgroundFilter(() => props.actionMessageBg);

  const isMessagingDisabled =
    createMemo(() => Boolean(
      !props.isPinnedMessageList &&
      !props.isSavedDialog &&
      !renderingCanPost() &&
      !renderingCanRestartBot &&
      !renderingCanStartBot &&
      !renderingCanSubscribe &&
      composerRestrictionMessage(),
    ) ||
    (props.isAccountFrozen && props.freezeAppealChat?.id !== props.chatId));
  const hasFooterActionBar = createMemo(() => getHasFooterActionBar({
    isPinnedMessageList: props.isPinnedMessageList,
    canUnpin: props.canUnpin,
    canShowOpenChatButton: props.canShowOpenChatButton,
    canSubscribe: renderingCanSubscribe,
    shouldJoinToSend: renderingShouldJoinToSend,
    shouldSendJoinRequest: renderingShouldSendJoinRequest,
    canStartBot: renderingCanStartBot,
    canRestartBot: renderingCanRestartBot,
    canUnblock: renderingCanUnblock,
    isChannelMuteBar: renderingIsChannelMuteBar,
  }));
  const withMessageListBottomShift = createMemo(() => hasFooterActionBar());
  const withExtraShift = createMemo(() => Boolean(isMessagingDisabled() || props.isSelectModeActive));

  const hasFooter = createMemo(() => getHasMiddleFooter({
    canPost: renderingCanPost(),
    withExtraShift: withExtraShift(),
    isPinnedMessageList: props.isPinnedMessageList,
    canUnpin: props.canUnpin,
    canShowOpenChatButton: props.canShowOpenChatButton,
    canSubscribe: renderingCanSubscribe,
    shouldJoinToSend: renderingShouldJoinToSend,
    shouldSendJoinRequest: renderingShouldSendJoinRequest,
    canStartBot: renderingCanStartBot,
    canRestartBot: renderingCanRestartBot,
    canUnblock: renderingCanUnblock,
    isChannelMuteBar: renderingIsChannelMuteBar,
  }));

  const footerClassName = createMemo(() => buildClassName(
    'middle-column-footer',
    !renderingCanPost() && 'no-composer',
    !hasFooter() && 'no-content',
  ));

  createEffect(depsOf(() => [
    updateFooterHeight,
    renderingChatId,
    renderingThreadId,
    props.currentTransitionKey,
    renderingCanPost(),
    isMessagingDisabled(),
    props.isSelectModeActive,
    withMessageListBottomShift(),
    footerClassName(),
  ] as const), ([, , , currentTransitionKey2, renderingCanPost2, isMessagingDisabled2, isSelectModeActive2, withMessageListBottomShift2, footerClassName2]) => {
    updateFooterHeight();
  });

  return (
    <div
      ref={middleColumnRef}
      id="MiddleColumn"
      class={className()}
      onClick={isTablet && props.isLeftColumnShown ? handleTabletFocus : undefined}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleHideDropArea}
    >
      {isDesktop && (
        <div class="resize-handle" onMouseDown={initResize()} onMouseUp={handleMouseUp()} onDoubleClick={resetResize()} />
      )}
      <div id="middle-column-portals" />
      <AudioPlayer
        isIsland
        isHidden={props.hasActiveMiddleSearch || props.isRichInputExpanded || (isTablet && props.isLeftColumnShown)}
        onPaneStateChange={props.onPlayerPaneStateChange}
      />
      {Boolean(renderingChatId && renderingThreadId) && (
        <>
          <div class="messages-layout" onDragEnter={renderingCanPost() ? handleDragEnter : undefined}>
            <MiddleHeader
              chatId={renderingChatId!}
              threadId={renderingThreadId!}
              messageListType={renderingMessageListType!}
              isComments={props.isComments}
              isMobile={props.isMobile}
              getCurrentPinnedIndex={getCurrentPinnedIndex()}
              getLoadingPinnedId={getLoadingPinnedId()}
              onFocusPinnedMessage={handleFocusPinnedMessage()}
            />
            <MiddleHeaderPanesIsland
              chatId={renderingChatId!}
              threadId={renderingThreadId!}
              messageListType={renderingMessageListType!}
              getCurrentPinnedIndex={getCurrentPinnedIndex()}
              getLoadingPinnedId={getLoadingPinnedId()}
              isChatClosing={!props.chatId}
              onFocusPinnedMessage={handleFocusPinnedMessage()}
            />
            {/* TODO(codemod): <Transition> children: use the render function and render by slide.key (framework guide §6) */}
            <Transition
              name={resolveTransitionName(
                'slide',
                props.animationLevel,
                props.shouldSkipHistoryAnimations || !props.withInterfaceAnimations,
              )}
              activeKey={props.currentTransitionKey}
              shouldCleanup
              cleanupExceptionKey={cleanupExceptionKey()}
              isBlockingAnimation
              onStop={handleSlideTransitionStop()}
            >
              <MessageList
                chatId={renderingChatId!}
                threadId={renderingThreadId!}
                type={renderingMessageListType!}
                isComments={props.isComments}
                canPost={renderingCanPost()!}
                hasFooter={hasFooter()}
                onScrollDownToggle={setIsScrollDownNeeded}
                isReady={isReady()}
                isContactRequirePremium={props.isContactRequirePremium}
                paidMessagesStars={props.paidMessagesStars}
                withBottomShift={withMessageListBottomShift()}
                withDefaultBg={Boolean(!props.customBackground && !props.backgroundColor)}
                onIntersectPinnedMessage={renderingHandleIntersectPinnedMessage}
              />
              <div class={footerClassName()}>
                <FloatingActionButtons withScrollDown={renderingIsScrollDownShown()} isHidden={props.isRichInputExpanded} />
                {renderingCanPost() && !hasFooterActionBar() && (
                  <Composer
                    type="messageList"
                    chatId={renderingChatId!}
                    threadId={renderingThreadId!}
                    messageListType={renderingMessageListType!}
                    dropAreaState={dropAreaState()}
                    onDropHide={handleHideDropArea}
                    isReady={isReady()}
                    isMobile={props.isMobile}
                    editableInputId={EDITABLE_INPUT_ID}
                    editableInputCssSelector={EDITABLE_INPUT_CSS_SELECTOR}
                    inputId="message-input-text"
                  />
                )}
                {isMessagingDisabled() && (
                  <div class={messagingDisabledClassName()}>
                    <div class="messaging-disabled-inner">
                      <span>{composerRestrictionMessage()}</span>
                    </div>
                  </div>
                )}
                {!isMessagingDisabled() && (
                  <FooterActionBar
                    chatId={renderingChatId!}
                    isChannel={renderingIsChannel}
                    canSubscribe={renderingCanSubscribe}
                    shouldJoinToSend={renderingShouldJoinToSend}
                    shouldSendJoinRequest={renderingShouldSendJoinRequest}
                    canStartBot={renderingCanStartBot}
                    canRestartBot={renderingCanRestartBot}
                    canUnblock={renderingCanUnblock}
                    isChannelMuteBar={renderingIsChannelMuteBar}
                    isMuted={renderingIsMuted}
                    linkedMonoforumId={renderingLinkedMonoforumId}
                    areGiftsAvailable={renderingAreGiftsAvailable}
                    canUnpinAll={Boolean(props.isPinnedMessageList && props.canUnpin)}
                    pinnedMessagesCount={props.pinnedMessagesCount}
                    canOpenSavedChat={props.canShowOpenChatButton}
                    savedChatId={props.canShowOpenChatButton ? String(renderingThreadId) : undefined}
                    onUnpinAll={handleOpenUnpinModal}
                  />
                )}
                <MessageSelectToolbar
                  messageListType={renderingMessageListType}
                  isActive={props.isSelectModeActive}
                  canPost={renderingCanPost()}
                />
                <SeenByModal isOpen={props.isSeenByModalOpen} />
                <PrivacySettingsNoticeModal isOpen={props.isPrivacySettingsNoticeModalOpen} />
                <ReactorListModal isOpen={props.isReactorListModalOpen} />
                {IS_TRANSLATION_SUPPORTED && <ChatLanguageModal isOpen={props.isChatLanguageModalOpen} />}
              </div>
            </Transition>
          </div>
          <MiddleSearch isActive={Boolean(props.hasActiveMiddleSearch)} />
        </>
      )}
      {props.chatId && (
        <UnpinAllMessagesModal
          isOpen={isUnpinModalOpen()}
          chatId={props.chatId}
          pinnedMessagesCount={props.pinnedMessagesCount}
          onClose={closeUnpinModal}
          onUnpin={handleUnpinAllMessages}
        />
      )}
      <div>
        <ManualFor each={props.activeEmojiInteractions} keyed={(activeEmojiInteraction) => activeEmojiInteraction.id} orderKey={(activeEmojiInteraction) => i}>{(activeEmojiInteraction, i) => (
          <EmojiInteractionAnimation
            activeEmojiInteraction={activeEmojiInteraction()}
          />
        )}</ManualFor>
      </div>
    </div>
  );
}

const mapStateToProps = (global: GlobalState, { isMobile }: OwnProps): Complete<StateProps> => {
    const theme = selectTheme(global);
    const {
      isBlurred: isBackgroundBlurred,
      background: customBackground,
      backgroundColor,
      patternColor,
    } = selectThemeValues(global, theme) || {};

    const {
      messageLists,
      isLeftColumnShown,
      activeEmojiInteractions,
      seenByModal,
      reactorModal,
      shouldSkipHistoryAnimations,
      chatLanguageModal,
      privacySettingsNoticeModal,
      uiReadyState,
      isRichInputExpanded,
    } = selectTabState(global);
    const currentMessageList = selectCurrentMessageList(global);
    const { leftColumnWidth } = global;

    const state: StateProps = {
      theme,
      customBackground,
      backgroundColor,
      patternColor,
      actionMessageBg: selectActionMessageBg(global),
      isLeftColumnShown,
      isRightColumnShown: selectIsRightColumnShown(global, isMobile),
      isBackgroundBlurred,
      hasActiveMiddleSearch: Boolean(selectCurrentMiddleSearch(global)),
      isRichInputExpanded,
      isSelectModeActive: selectIsInSelectMode(global),
      isSeenByModalOpen: Boolean(seenByModal),
      isPrivacySettingsNoticeModalOpen: Boolean(privacySettingsNoticeModal),
      isReactorListModalOpen: Boolean(reactorModal),
      isChatLanguageModalOpen: Boolean(chatLanguageModal),
      animationLevel: selectSharedSettings(global).animationLevel,
      withInterfaceAnimations: selectCanAnimateInterface(global),
      withRightColumnAnimation: selectCanAnimateRightColumn(global),
      currentTransitionKey: Math.max(0, messageLists.length - 1),
      activeEmojiInteractions,
      leftColumnWidth,
      isUiReady: uiReadyState >= 1,
    };

    if (!currentMessageList) {
      return state as Complete<StateProps>;
    }

    const { chatId, threadId, type: messageListType } = currentMessageList;
    const isPrivate = isUserId(chatId);
    const chat = selectChat(global, chatId);
    const bot = selectBot(global, chatId);
    const pinnedIds = selectPinnedIds(global, chatId, threadId);
    const chatFullInfo = chatId ? selectChatFullInfo(global, chatId) : undefined;
    const userFullInfo = chatId ? selectUserFullInfo(global, chatId) : undefined;

    const editingId = selectEditingId(global, chatId, threadId);

    const threadInfo = selectThreadInfo(global, chatId, threadId);
    const isMessageThread = Boolean(!threadInfo?.isCommentsInfo && threadInfo?.fromChannelId);
    const topic = selectTopic(global, chatId, threadId);
    const canPost = chat && getCanPostInChat(chat, topic, isMessageThread, chatFullInfo);
    const isBotNotStarted = selectIsChatBotNotStarted(global, chatId);
    const isPinnedMessageList = messageListType === 'pinned';
    const isMainThread = messageListType === 'thread' && threadId === MAIN_THREAD_ID;
    const isChannel = Boolean(chat && isChatChannel(chat));
    const canSubscribe = Boolean(
      chat &&
      (isMainThread || chat.isForum) &&
      (isChannel || isChatSuperGroup(chat)) &&
      chat.isNotJoined &&
      !chat.joinRequests &&
      !chat.isMonoforum,
    );
    const shouldJoinToSend = Boolean(chat?.isNotJoined && chat.isJoinToSend);
    const shouldSendJoinRequest = Boolean(chat?.isNotJoined && chat.isJoinRequest);
    const isUserBlocked = isPrivate ? selectIsUserBlocked(global, chatId) : false;
    const canRestartBot = Boolean(bot && isUserBlocked);
    const canStartBot = !canRestartBot && isBotNotStarted;
    const canUnblock = isUserBlocked && !bot;
    const shouldLoadFullChat = Boolean(chat && isChatGroup(chat) && !chatFullInfo);
    const draftReplyInfo = selectDraft(global, chatId, threadId)?.replyInfo;
    const shouldBlockSendInForum = chat?.isForum
      ? threadId === MAIN_THREAD_ID && !draftReplyInfo && selectTopic(global, chatId, GENERAL_TOPIC_ID)?.isClosed
      : false;
    const isMonoforumAdmin = selectIsMonoforumAdmin(global, chatId);
    const shouldBlockSendInMonoforum = Boolean(chat?.isMonoforum && !draftReplyInfo && isMonoforumAdmin && !editingId);
    const topics = selectTopics(global, chatId);

    const isSavedDialog = getIsSavedDialog(chatId, threadId, global.currentUserId);
    const canShowOpenChatButton = isSavedDialog && threadId !== ANONYMOUS_USER_ID && threadId !== global.currentUserId;

    const canUnpin =
      chat &&
      (isPrivate || (!isChannel && !isUserRightBanned(chat, 'pinMessages')) || getHasAdminRight(chat, 'pinMessages'));

    const userFull = selectUserFullInfo(global, chatId);

    const isContactRequirePremium = userFull?.isContactRequirePremium;
    const paidMessagesStars = selectPeerPaidMessagesStars(global, chatId);
    const isAccountFrozen = selectIsCurrentUserFrozen(global);
    const botFreezeAppealId = global.botFreezeAppealId;
    const freezeAppealChat = botFreezeAppealId ? selectChat(global, botFreezeAppealId) : undefined;

    const canPostFooter =
      !isPinnedMessageList &&
      (!chat || canPost) &&
      !isBotNotStarted &&
      !(shouldJoinToSend && chat?.isNotJoined) &&
      !shouldBlockSendInForum &&
      !shouldBlockSendInMonoforum &&
      !isSavedDialog &&
      (!isAccountFrozen || freezeAppealChat?.id === chatId);
    const isMuted = chat
      ? getIsChatMuted(chat, selectNotifyDefaults(global), selectNotifyException(global, chatId))
      : undefined;
    const linkedMonoforumId = chat?.linkedMonoforumId;
    const areGiftsAvailable = chatFullInfo?.areStarGiftsAvailable;
    const isChannelMuteBar = Boolean(isChannel && !chat?.isNotJoined && isMainThread && !canPostFooter);

    return {
      ...state,
      chatId,
      threadId,
      messageListType,
      chat,
      draftReplyInfo,
      isPrivate,
      arePeerSettingsLoaded: Boolean(userFullInfo?.settings),
      isComments: isMessageThread,
      canPost: canPostFooter,
      isPinnedMessageList,
      currentUserBannedRights: chat?.currentUserBannedRights,
      defaultBannedRights: chat?.defaultBannedRights,
      pinnedMessagesCount: pinnedIds ? pinnedIds.length : 0,
      shouldSkipHistoryAnimations,
      isChannel,
      canSubscribe,
      canStartBot,
      canRestartBot,
      shouldJoinToSend,
      shouldSendJoinRequest,
      shouldLoadFullChat,
      pinnedIds,
      canUnpin,
      canUnblock,
      isChannelMuteBar,
      isMuted,
      linkedMonoforumId,
      areGiftsAvailable,
      isSavedDialog,
      canShowOpenChatButton,
      isContactRequirePremium,
      topics,
      paidMessagesStars,
      isAccountFrozen,
      freezeAppealChat,
      shouldBlockSendInMonoforum,
    } as Complete<StateProps>;
  };

export default MiddleColumn;

// TODO(codemod): useIsReady: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
function useIsReady(
  withAnimations?: boolean,
  currentTransitionKey?: number,
  prevTransitionKey?: number,
  chatId?: string,
  isMobile?: boolean,
  isLeftColumnShown?: boolean,
  middleColumnRef?: (el: HTMLDivElement) => void,
) {
  const [isReady, setIsReady] = createSignal(!isMobile);
  // TODO(codemod): useForceUpdate: a component runs once; make the changing value a signal and delete the force update
  const forceUpdate = useForceUpdate();

  const willSwitchMessageList = prevTransitionKey !== undefined && prevTransitionKey !== currentTransitionKey;
  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(depsOf(() => [willSwitchMessageList, withAnimations]), () => {
    if (!willSwitchMessageList) return;
    if (!withAnimations) {
      forceUpdate();
      return undefined;
    }
    setIsReady(false);

    // Make sure to end even if end callback was not called (which was some hardly-reproducible bug)
    window.setTimeout(() => {
      setIsReady(true);
    }, LAYER_ANIMATION_DURATION_MS);
  });

  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(() => withAnimations, () => {
    if (!withAnimations) {
      setIsReady(true);
    }
  });

  // Mobile only: wait until `MiddleColumn` slides in after the left column closes
  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(
    depsOf(() => [isLeftColumnShown, willSwitchMessageList, chatId, isMobile, withAnimations, middleColumnRef]), (_deps, prev) => {
      const [prevIsLeftColumnShown, prevWillSwitchMessageList] = prev ?? [];
      if (!isMobile) {
        return;
      }

      if (!chatId) {
        setIsReady(false);
        return;
      }

      if (!withAnimations) {
        setIsReady(true);
        return;
      }

      if (willSwitchMessageList || prevWillSwitchMessageList) {
        return;
      }

      if (isLeftColumnShown) {
        setIsReady(false);
        return;
      }

      if (prevIsLeftColumnShown !== true) {
        setIsReady(true);
        return;
      }

      waitForTransitionEnd(
        middleColumnRef!.current!,
        () => {
          setIsReady(true);
        },
        'transform',
        LAYER_ANIMATION_DURATION_MS,
      );
    },
  );

  function handleSlideTransitionStop() {
    setIsReady(true);
  }

  return {
    isReady: isReady() && !willSwitchMessageList,
    handleSlideTransitionStop: withAnimations ? handleSlideTransitionStop : undefined,
  };
}
