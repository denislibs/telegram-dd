import {
  type Accessor,
  createEffect,
  createMeasureEffect,
  createMemo,
  createSignal,
  frozenWhile,
  onDestroy,
  onMount,
  requestMeasure,
  requestMutation,
} from 'frameact';
import { For, Show } from 'frameact/dom';
import { getActions, withGlobal } from '../../global';

import type { ApiChat, ApiChatBannedRights, ApiInputDraftReplyInfo, ApiTopic } from '../../api/types';
import type { GlobalState } from '../../global/types';
import type { TransitionSlide } from '../../lib/kit';
import type { ActiveEmojiInteraction, AnimationLevel, MessageListType, ThemeKey, ThreadId } from '../../types';
import type { PaneState } from './hooks/useHeaderPane';
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
import { depsOf } from '../../util/effectDeps';
import { isUserId } from '../../util/entities/ids';
import { resolveTransitionName } from '../../util/resolveTransitionName';
import getHasMiddleFooter, { getHasFooterActionBar } from './helpers/getHasMiddleFooter';
import { measureFooterContentHeight, syncMessageListBottomReserve } from './helpers/messageListReserves';

import useAppLayout from '../../hooks/useAppLayout';
import useDebouncedCallback from '../../hooks/useDebouncedCallback';
import useHistoryBack from '../../hooks/useHistoryBack';
import useLang from '../../hooks/useLang';
import useOldLang from '../../hooks/useOldLang';
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
  leftColumnRef: () => HTMLDivElement | undefined;
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

// Deviation: `usePrevDuringAnimation` (a hook that is deleted: the framework table maps it to `frozenWhile`/`currentOrPrev`,
// which do not know the "hold for `duration` ms after the value became empty" rule). Same rule as tt: while `source` is
// empty and a value was present before it, that value is held for `duration` ms (mobile layer animation), then the empty
// value shows. Without a `duration` it is `source` itself.
function createRenderingValue<T>(source: Accessor<T>, duration: Accessor<number | undefined>): Accessor<T> {
  const [expiry, bumpExpiry] = createSignal(0);
  let timer: number | undefined;
  let held: T | undefined;
  let phase: 'idle' | 'holding' | 'expired' = 'idle';

  onDestroy(() => {
    window.clearTimeout(timer);
  });

  return createMemo(() => {
    expiry();
    const current = source();

    // eslint-disable-next-line no-null/no-null
    if (current !== undefined && current !== null) {
      window.clearTimeout(timer);
      timer = undefined;
      phase = 'idle';
      held = current;
      return current;
    }

    const ms = duration();
    // eslint-disable-next-line no-null/no-null
    if (phase === 'idle' && ms && held !== undefined && held !== null) {
      phase = 'holding';
      timer = window.setTimeout(() => {
        timer = undefined;
        phase = 'expired';
        bumpExpiry((value) => value + 1);
      }, ms);
    }

    return phase === 'holding' ? (held as T) : current;
  });
}

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

  const { handleIntersectPinnedMessage, handleFocusPinnedMessage, getCurrentPinnedIndex, getLoadingPinnedId } =
    usePinnedMessage(
      () => props.chatId,
      () => props.threadId,
      () => props.pinnedIds,
    );

  const closeAnimationDuration = createMemo(() => (props.isMobile ? LAYER_ANIMATION_DURATION_MS : undefined));

  const renderingChatId = createRenderingValue(() => props.chatId, closeAnimationDuration);
  const renderingThreadId = createRenderingValue(() => props.threadId, closeAnimationDuration);
  const renderingMessageListType = createRenderingValue(() => props.messageListType, closeAnimationDuration);
  const renderingCanSubscribe = createRenderingValue(() => props.canSubscribe, closeAnimationDuration);
  const renderingCanStartBot = createRenderingValue(() => props.canStartBot, closeAnimationDuration);
  const renderingCanRestartBot = createRenderingValue(() => props.canRestartBot, closeAnimationDuration);
  const renderingCanUnblock = createRenderingValue(() => props.canUnblock, closeAnimationDuration);
  const renderingCanPostSource = createRenderingValue(() => props.canPost, closeAnimationDuration);
  const renderingCanPost = createMemo(
    () =>
      renderingCanPostSource() &&
      !renderingCanRestartBot() &&
      !renderingCanStartBot() &&
      !renderingCanSubscribe() &&
      !renderingCanUnblock() &&
      props.chatId !== TMP_CHAT_ID &&
      !props.isContactRequirePremium,
  );
  const renderingIsScrollDownShownSource = createRenderingValue(isScrollDownShown, closeAnimationDuration);
  const renderingIsScrollDownShown = createMemo(
    () => renderingIsScrollDownShownSource() && props.chatId !== TMP_CHAT_ID,
  );
  const renderingIsChannel = createRenderingValue(() => props.isChannel, closeAnimationDuration);
  const renderingShouldJoinToSend = createRenderingValue(() => props.shouldJoinToSend, closeAnimationDuration);
  const renderingShouldSendJoinRequest = createRenderingValue(
    () => props.shouldSendJoinRequest,
    closeAnimationDuration,
  );
  const renderingIsChannelMuteBar = createRenderingValue(() => props.isChannelMuteBar, closeAnimationDuration);
  const renderingIsMuted = createRenderingValue(() => props.isMuted, closeAnimationDuration);
  const renderingLinkedMonoforumId = createRenderingValue(() => props.linkedMonoforumId, closeAnimationDuration);
  const renderingAreGiftsAvailable = createRenderingValue(() => props.areGiftsAvailable, closeAnimationDuration);
  const renderingHandleIntersectPinnedMessage = createRenderingValue(
    () => (props.chatId ? handleIntersectPinnedMessage : undefined),
    closeAnimationDuration,
  );

  // Deviation: `usePreviousDeprecated` is an effect over the key (`previous()` is lazy, and the Transition reads the
  // exception only when a step ends, so it would miss the steps).
  const [cleanupExceptionKey, setCleanupExceptionKey] = createSignal<number | undefined>(undefined);
  createEffect(
    () => props.currentTransitionKey,
    (currentTransitionKey2, prevTransitionKey) => {
      setCleanupExceptionKey(
        prevTransitionKey !== undefined && prevTransitionKey < currentTransitionKey2 ? prevTransitionKey : undefined,
      );
    },
  );

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

  createMeasureEffect(
    depsOf(() => [props.currentTransitionKey, renderingChatId(), renderingThreadId()] as const),
    () => {
      const middleColumn = middleColumnRef;
      if (!middleColumn) return undefined;

      updateFooterHeight();

      const observer = new ResizeObserver((entries) => {
        entries.forEach((entry) => syncFooterSlide(entry.target as HTMLElement));
      });
      const observeFooters = () => {
        middleColumn.querySelectorAll<HTMLElement>('.middle-column-footer').forEach((footer) => {
          observer.observe(footer, { box: 'border-box' });
        });
      };
      observeFooters();
      // Deviation: a slide that a key change creates is attached in the mutate phase of this frame, after this measure
      // task (tt's effect ran after the render committed): the footers are looked up again in the next frame.
      requestMeasure(observeFooters);

      return () => observer.disconnect();
    },
  );

  const withAnimations = () => !props.shouldSkipHistoryAnimations && props.withInterfaceAnimations;

  const { isReady, handleSlideTransitionStop } = useIsReady(
    withAnimations,
    () => props.currentTransitionKey,
    () => props.chatId,
    () => props.isMobile,
    () => props.isLeftColumnShown,
    () => middleColumnRef,
  );

  createEffect(
    depsOf(() => [props.chatId, props.isRightColumnShown] as const),
    ([chatId2, isRightColumnShown2]) => {
      return chatId2
        ? captureEscKeyListener(() => {
            // Let the Right Column (profile, management, etc.) handle Esc first while it is open
            if (isRightColumnShown2) return false;
            openChat({ id: undefined });
            return undefined;
          })
        : undefined;
    },
  );

  // Deviation: `useSyncEffect` ran during the render; the drop area state is reset by an effect on the chat id.
  createEffect(
    () => props.chatId,
    () => {
      setDropAreaState(DropAreaState.None);
    },
  );

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

  createEffect(
    depsOf(() => [props.chatId, props.isPrivate] as const),
    ([chatId2, isPrivate2]) => {
      if (isPrivate2) {
        loadUser({ userId: chatId2! });
      }
    },
  );

  createEffect(
    depsOf(() => [props.chatId, props.isPrivate, props.arePeerSettingsLoaded] as const),
    ([chatId2, , arePeerSettingsLoaded2]) => {
      if (!arePeerSettingsLoaded2) {
        loadPeerSettings({ peerId: chatId2! });
      }
    },
  );

  createEffect(
    depsOf(() => [props.shouldLoadFullChat, props.chatId, isReady()] as const),
    ([shouldLoadFullChat2, chatId2, isReady2]) => {
      if (chatId2 && shouldLoadFullChat2 && isReady2) {
        loadFullChat({ chatId: chatId2 });
      }
    },
  );

  const { initResize, resetResize, handleMouseUp } = useResize(
    props.leftColumnRef,
    (n) =>
      setLeftColumnWidth({
        leftColumnWidth: n,
      }),
    resetLeftColumnWidth,
    () => props.leftColumnWidth,
    '--left-column-width',
  );

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
    if (relatedTarget instanceof Node && middleColumnRef.contains(relatedTarget)) return;

    window.clearTimeout(dropAreaHideTimeoutRef);
    dropAreaHideTimeoutRef = window.setTimeout(handleHideDropArea, DROP_AREA_HIDE_TIMEOUT_MS);
  };

  const handleDragOver = () => {
    window.clearTimeout(dropAreaHideTimeoutRef);
  };

  onDestroy(() => {
    window.clearTimeout(dropAreaHideTimeoutRef);
  });

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

  const className = createMemo(() =>
    buildClassName(MASK_IMAGE_DISABLED ? 'mask-image-disabled' : 'mask-image-enabled', props.isUiReady && 'ui-ready'),
  );

  const messagingDisabledClassName = createMemo(() =>
    buildClassName('messaging-disabled', !props.isSelectModeActive && 'shown'),
  );

  const messageSendingRestrictionReason = createMemo(() =>
    getMessageSendingRestrictionReason(oldLang, props.currentUserBannedRights, props.defaultBannedRights),
  );
  const forumComposerPlaceholder = createMemo(() =>
    getForumComposerPlaceholder(oldLang, props.chat, props.threadId, props.topics, Boolean(props.draftReplyInfo)),
  );
  const isAccountFrozenInChat = () => props.isAccountFrozen && props.freezeAppealChat?.id !== props.chatId;

  // Deviation: tt built `composerRestrictionMessage` once per render (strings or one element). The elements are created
  // per slide, where they are rendered (`renderComposerRestrictionMessage`); this flag has the same truthiness.
  const hasComposerRestrictionMessage = createMemo(() =>
    Boolean(
      messageSendingRestrictionReason() ||
      forumComposerPlaceholder() ||
      props.shouldBlockSendInMonoforum ||
      props.isContactRequirePremium ||
      isAccountFrozenInChat(),
    ),
  );

  const renderComposerRestrictionMessage = () =>
    messageSendingRestrictionReason() ||
    forumComposerPlaceholder() ||
    (props.shouldBlockSendInMonoforum ? lang('MonoforumComposerPlaceholder') : undefined) ||
    (props.isContactRequirePremium ? <PremiumRequiredPlaceholder userId={props.chatId!} /> : undefined) ||
    (isAccountFrozenInChat() ? <FrozenAccountPlaceholder /> : undefined);

  useHistoryBack({
    isActive: () => props.isSelectModeActive,
    onBack: exitMessageSelectMode,
  });

  // Prepare filter beforehand to avoid flickering
  useFluidBackgroundFilter(() => props.actionMessageBg);

  const isMessagingDisabled = createMemo(
    () =>
      Boolean(
        !props.isPinnedMessageList &&
        !props.isSavedDialog &&
        !renderingCanPost() &&
        !renderingCanRestartBot() &&
        !renderingCanStartBot() &&
        !renderingCanSubscribe() &&
        hasComposerRestrictionMessage(),
      ) || Boolean(isAccountFrozenInChat()),
  );
  const hasFooterActionBar = createMemo(() =>
    getHasFooterActionBar({
      isPinnedMessageList: props.isPinnedMessageList,
      canUnpin: props.canUnpin,
      canShowOpenChatButton: props.canShowOpenChatButton,
      canSubscribe: renderingCanSubscribe(),
      shouldJoinToSend: renderingShouldJoinToSend(),
      shouldSendJoinRequest: renderingShouldSendJoinRequest(),
      canStartBot: renderingCanStartBot(),
      canRestartBot: renderingCanRestartBot(),
      canUnblock: renderingCanUnblock(),
      isChannelMuteBar: renderingIsChannelMuteBar(),
    }),
  );
  const withMessageListBottomShift = hasFooterActionBar;
  const withExtraShift = createMemo(() => Boolean(isMessagingDisabled() || props.isSelectModeActive));

  const hasFooter = createMemo(() =>
    getHasMiddleFooter({
      canPost: renderingCanPost(),
      withExtraShift: withExtraShift(),
      isPinnedMessageList: props.isPinnedMessageList,
      canUnpin: props.canUnpin,
      canShowOpenChatButton: props.canShowOpenChatButton,
      canSubscribe: renderingCanSubscribe(),
      shouldJoinToSend: renderingShouldJoinToSend(),
      shouldSendJoinRequest: renderingShouldSendJoinRequest(),
      canStartBot: renderingCanStartBot(),
      canRestartBot: renderingCanRestartBot(),
      canUnblock: renderingCanUnblock(),
      isChannelMuteBar: renderingIsChannelMuteBar(),
    }),
  );

  const footerClassName = createMemo(() =>
    buildClassName('middle-column-footer', !renderingCanPost() && 'no-composer', !hasFooter() && 'no-content'),
  );

  createMeasureEffect(
    depsOf(
      () =>
        [
          renderingChatId(),
          renderingThreadId(),
          props.currentTransitionKey,
          renderingCanPost(),
          isMessagingDisabled(),
          props.isSelectModeActive,
          withMessageListBottomShift(),
          footerClassName(),
        ] as const,
    ),
    () => {
      updateFooterHeight();
    },
  );

  // Deviation: tt kept the last render of an inactive `Transition` slide, so a slide that is not the active one must
  // not follow the props (the chat that slides away keeps its list and footer): each value the slide uses is read through
  // `frozenWhile`, which holds the value from before the slide stopped being the active one.
  const renderSlide = (slide: TransitionSlide) => {
    const frozen = <T,>(source: Accessor<T>) => frozenWhile(source, () => !slide.isActive());

    const chatId = frozen(renderingChatId);
    const threadId = frozen(renderingThreadId);
    const messageListType = frozen(renderingMessageListType);
    const isComments = frozen(() => props.isComments);
    const canPost = frozen(renderingCanPost);
    const slideHasFooter = frozen(hasFooter);
    const slideIsReady = frozen(isReady);
    const isContactRequirePremium = frozen(() => props.isContactRequirePremium);
    const paidMessagesStars = frozen(() => props.paidMessagesStars);
    const withBottomShift = frozen(withMessageListBottomShift);
    const withDefaultBg = frozen(() => Boolean(!props.customBackground && !props.backgroundColor));
    const onIntersectPinnedMessage = frozen(renderingHandleIntersectPinnedMessage);
    const slideFooterClassName = frozen(footerClassName);
    const withScrollDown = frozen(renderingIsScrollDownShown);
    const isRichInputExpanded = frozen(() => props.isRichInputExpanded);
    const slideHasFooterActionBar = frozen(hasFooterActionBar);
    const slideDropAreaState = frozen(dropAreaState);
    const slideIsMessagingDisabled = frozen(isMessagingDisabled);
    const slideMessagingDisabledClassName = frozen(messagingDisabledClassName);
    const isChannel = frozen(renderingIsChannel);
    const canSubscribe = frozen(renderingCanSubscribe);
    const shouldJoinToSend = frozen(renderingShouldJoinToSend);
    const shouldSendJoinRequest = frozen(renderingShouldSendJoinRequest);
    const canStartBot = frozen(renderingCanStartBot);
    const canRestartBot = frozen(renderingCanRestartBot);
    const canUnblock = frozen(renderingCanUnblock);
    const isChannelMuteBar = frozen(renderingIsChannelMuteBar);
    const isMuted = frozen(renderingIsMuted);
    const linkedMonoforumId = frozen(renderingLinkedMonoforumId);
    const areGiftsAvailable = frozen(renderingAreGiftsAvailable);
    const isPinnedMessageList = frozen(() => props.isPinnedMessageList);
    const canUnpin = frozen(() => props.canUnpin);
    const pinnedMessagesCount = frozen(() => props.pinnedMessagesCount);
    const canShowOpenChatButton = frozen(() => props.canShowOpenChatButton);
    const isSelectModeActive = frozen(() => props.isSelectModeActive);
    // Deviation: the text of the restriction bar is held like the rest of the slide while it slides out (it reads the live
    // chat, the rights and the flags of the new list)
    const slideRestrictionMessage = frozen(renderComposerRestrictionMessage);
    const isSeenByModalOpen = frozen(() => props.isSeenByModalOpen);
    const isPrivacySettingsNoticeModalOpen = frozen(() => props.isPrivacySettingsNoticeModalOpen);
    const isReactorListModalOpen = frozen(() => props.isReactorListModalOpen);
    const isChatLanguageModalOpen = frozen(() => props.isChatLanguageModalOpen);

    // `key={...}` of tt: a new chat, thread or list type remounts the list (and disposes the old one).
    const messageListKey = createMemo(() => `${chatId()}-${threadId()}-${messageListType()}`);

    return (
      <>
        <Show when={{ key: messageListKey() }} keyed>
          {(_key) => (
            <MessageList
              chatId={chatId()!}
              threadId={threadId()!}
              type={messageListType()!}
              isComments={isComments()}
              canPost={canPost()!}
              hasFooter={slideHasFooter()}
              onScrollDownToggle={setIsScrollDownNeeded}
              isReady={slideIsReady()}
              isContactRequirePremium={isContactRequirePremium()}
              paidMessagesStars={paidMessagesStars()}
              withBottomShift={withBottomShift()}
              withDefaultBg={withDefaultBg()}
              onIntersectPinnedMessage={onIntersectPinnedMessage()}
            />
          )}
        </Show>
        <div class={slideFooterClassName()}>
          <FloatingActionButtons withScrollDown={Boolean(withScrollDown())} isHidden={isRichInputExpanded()} />
          <Show when={canPost() && !slideHasFooterActionBar()}>
            <Composer
              type="messageList"
              chatId={chatId()!}
              threadId={threadId()!}
              messageListType={messageListType()!}
              dropAreaState={slideDropAreaState()}
              onDropHide={handleHideDropArea}
              isReady={slideIsReady()}
              isMobile={props.isMobile}
              editableInputId={EDITABLE_INPUT_ID}
              editableInputCssSelector={EDITABLE_INPUT_CSS_SELECTOR}
              inputId="message-input-text"
            />
          </Show>
          <Show when={slideIsMessagingDisabled()}>
            <div class={slideMessagingDisabledClassName()}>
              <div class="messaging-disabled-inner">
                <span>{slideRestrictionMessage()}</span>
              </div>
            </div>
          </Show>
          <Show when={!slideIsMessagingDisabled()}>
            <FooterActionBar
              chatId={chatId()!}
              isChannel={isChannel()}
              canSubscribe={canSubscribe()}
              shouldJoinToSend={shouldJoinToSend()}
              shouldSendJoinRequest={shouldSendJoinRequest()}
              canStartBot={canStartBot()}
              canRestartBot={canRestartBot()}
              canUnblock={canUnblock()}
              isChannelMuteBar={isChannelMuteBar()}
              isMuted={isMuted()}
              linkedMonoforumId={linkedMonoforumId()}
              areGiftsAvailable={areGiftsAvailable()}
              canUnpinAll={Boolean(isPinnedMessageList() && canUnpin())}
              pinnedMessagesCount={pinnedMessagesCount()}
              canOpenSavedChat={canShowOpenChatButton()}
              savedChatId={canShowOpenChatButton() ? String(threadId()) : undefined}
              onUnpinAll={handleOpenUnpinModal}
            />
          </Show>
          <MessageSelectToolbar
            messageListType={messageListType()}
            isActive={isSelectModeActive()}
            canPost={canPost()}
          />
          <SeenByModal isOpen={isSeenByModalOpen()} />
          <PrivacySettingsNoticeModal isOpen={isPrivacySettingsNoticeModalOpen()} />
          <ReactorListModal isOpen={isReactorListModalOpen()} />
          {IS_TRANSLATION_SUPPORTED && <ChatLanguageModal isOpen={isChatLanguageModalOpen()} />}
        </div>
      </>
    );
  };

  return (
    <div
      ref={middleColumnRef}
      id="MiddleColumn"
      class={className()}
      onClick={() => {
        if (isTablet() && props.isLeftColumnShown) handleTabletFocus();
      }}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleHideDropArea}
    >
      {isDesktop() && (
        <div class="resize-handle" onMouseDown={initResize} onMouseUp={handleMouseUp} onDblClick={resetResize} />
      )}
      <div id="middle-column-portals" />
      <AudioPlayer
        isIsland
        isHidden={props.hasActiveMiddleSearch || props.isRichInputExpanded || (isTablet() && props.isLeftColumnShown)}
        onPaneStateChange={props.onPlayerPaneStateChange}
      />
      <Show when={Boolean(renderingChatId() && renderingThreadId())}>
        <>
          <div
            class="messages-layout"
            onDragEnter={(e) => {
              if (renderingCanPost()) handleDragEnter(e);
            }}
          >
            <MiddleHeader
              chatId={renderingChatId()!}
              threadId={renderingThreadId()!}
              messageListType={renderingMessageListType()!}
              isComments={props.isComments}
              isMobile={props.isMobile}
              getCurrentPinnedIndex={getCurrentPinnedIndex}
              getLoadingPinnedId={getLoadingPinnedId}
              onFocusPinnedMessage={handleFocusPinnedMessage}
            />
            <MiddleHeaderPanesIsland
              chatId={renderingChatId()!}
              threadId={renderingThreadId()!}
              messageListType={renderingMessageListType()!}
              getCurrentPinnedIndex={getCurrentPinnedIndex}
              getLoadingPinnedId={getLoadingPinnedId}
              isChatClosing={!props.chatId}
              onFocusPinnedMessage={handleFocusPinnedMessage}
            />
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
              onStop={handleSlideTransitionStop}
            >
              {renderSlide}
            </Transition>
          </div>
          <MiddleSearch isActive={Boolean(props.hasActiveMiddleSearch)} />
        </>
      </Show>
      <Show when={props.chatId}>
        {(chatId) => (
          <UnpinAllMessagesModal
            isOpen={isUnpinModalOpen()}
            chatId={chatId()}
            pinnedMessagesCount={props.pinnedMessagesCount}
            onClose={closeUnpinModal}
            onUnpin={handleUnpinAllMessages}
          />
        )}
      </Show>
      {/* Deviation: `teactFastList` + `teactOrderKey={i}` is the array order: an ordinary keyed `<For>`. */}
      <div>
        <For each={props.activeEmojiInteractions} keyed={(activeEmojiInteraction) => activeEmojiInteraction.id}>
          {(activeEmojiInteraction) => <EmojiInteractionAnimation activeEmojiInteraction={activeEmojiInteraction()} />}
        </For>
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

// Deviation: a hook of the file that runs once, with accessors. tt kept `isReady` in a `useState` and read the transient
// `willSwitchMessageList` (previous render's key !== this render's key) during the render; here `settledKey` is the key whose
// switch the effect below has processed, so the flag is true from the key change until then.
function useIsReady(
  withAnimations: Accessor<boolean | undefined>,
  currentTransitionKey: Accessor<number>,
  chatId: Accessor<string | undefined>,
  isMobile: Accessor<boolean | undefined>,
  isLeftColumnShown: Accessor<boolean | undefined>,
  middleColumnRef: Accessor<HTMLDivElement | undefined>,
) {
  const [isReady, setIsReady] = createSignal(!isMobile());
  const [settledKey, setSettledKey] = createSignal(currentTransitionKey());

  const willSwitchMessageList = () => settledKey() !== currentTransitionKey();

  createEffect(
    depsOf(() => [willSwitchMessageList(), withAnimations()] as const),
    ([willSwitchMessageList2, withAnimations2]) => {
      if (!willSwitchMessageList2) return undefined;
      setSettledKey(currentTransitionKey());
      if (!withAnimations2) {
        return undefined;
      }
      setIsReady(false);

      // Make sure to end even if end callback was not called (which was some hardly-reproducible bug)
      window.setTimeout(() => {
        setIsReady(true);
      }, LAYER_ANIMATION_DURATION_MS);

      return undefined;
    },
  );

  createEffect(
    () => withAnimations(),
    (withAnimations2) => {
      if (!withAnimations2) {
        setIsReady(true);
      }
    },
  );

  // Mobile only: wait until `MiddleColumn` slides in after the left column closes
  createEffect(
    depsOf(() => [isLeftColumnShown(), willSwitchMessageList(), chatId(), isMobile(), withAnimations()] as const),
    ([isLeftColumnShown2, willSwitchMessageList2, chatId2, isMobile2, withAnimations2], prev) => {
      const [prevIsLeftColumnShown, prevWillSwitchMessageList] = prev ?? [];
      if (!isMobile2) {
        return;
      }

      if (!chatId2) {
        setIsReady(false);
        return;
      }

      if (!withAnimations2) {
        setIsReady(true);
        return;
      }

      if (willSwitchMessageList2 || prevWillSwitchMessageList) {
        return;
      }

      if (isLeftColumnShown2) {
        setIsReady(false);
        return;
      }

      if (prevIsLeftColumnShown !== true) {
        setIsReady(true);
        return;
      }

      waitForTransitionEnd(
        middleColumnRef()!,
        () => {
          setIsReady(true);
        },
        'transform',
        LAYER_ANIMATION_DURATION_MS,
      );
    },
  );

  function handleSlideTransitionStop() {
    if (withAnimations()) setIsReady(true);
  }

  return {
    isReady: () => isReady() && !willSwitchMessageList(),
    handleSlideTransitionStop,
  };
}
