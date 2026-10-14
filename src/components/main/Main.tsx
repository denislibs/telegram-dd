import '../../global/actions/all';

import {
  beginHeavyAnimation,
  createEffect,
  createMemo,
  createSignal,
  onFullyIdle,
  onMount,
  requestNextMutation,
} from 'frameact';
import { addExtraClass, setExtraStyles } from 'frameact/dom';
import { getActions, getGlobal, withGlobal } from '../../global';
import { depsOf } from '../../util/effectDeps';
import { createShowTransition } from '../../lib/kit';

import type { ApiChatFolder, ApiLimitTypeWithModal, ApiStarGiftAuctionState, ApiUser } from '../../api/types';
import type { GlobalState, TabState } from '../../global/types';

import { BASE_EMOJI_KEYWORD_LANG, DEBUG, FOLDERS_POSITION_LEFT, INACTIVE_MARKER } from '../../config';
import {
  selectAreFoldersPresent,
  selectCanAnimateInterface,
  selectChatFolder,
  selectChatMessage,
  selectCurrentMessageList,
  selectIsCurrentUserFrozen,
  selectIsCurrentUserPremium,
  selectIsForwardModalOpen,
  selectIsMediaViewerOpen,
  selectIsReactionPickerOpen,
  selectIsRightColumnShown,
  selectIsStoryViewerOpen,
  selectPerformanceSettingsValue,
  selectTabSelectedGiftAuction,
  selectTabState,
  selectUser,
} from '../../global/selectors';
import { selectSharedSettings } from '../../global/selectors/sharedState';
import { IS_TAURI } from '../../util/browser/globalEnvironment';
import { IS_ANDROID, IS_MAC_OS, IS_WAVE_TRANSFORM_SUPPORTED } from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';
import { waitForTransitionEnd } from '../../util/cssAnimationEndListeners';
import { processDeepLink } from '../../util/deeplink';
import { Bundles, loadBundle } from '../../util/moduleLoader';
import { parseInitialLocationHash, parseLocationHash } from '../../util/routing';
import updateIcon from '../../util/updateIcon';
import { REM } from '../common/helpers/mediaDimensions';
import { updateTopReserveWithScrollCompensation } from '../middle/helpers/messageListReserves';

import useInterval from '../../hooks/schedulers/useInterval';
import useTimeout from '../../hooks/schedulers/useTimeout';
import useTauriEvent from '../../hooks/tauri/useTauriEvent';
import useAppLayout from '../../hooks/useAppLayout';
import useForceUpdate from '../../hooks/useForceUpdate';
import useLang from '../../hooks/useLang';
import usePreventPinchZoomGesture from '../../hooks/usePreventPinchZoomGesture';
import useBackgroundMode from '../../hooks/window/useBackgroundMode';
import useBeforeUnload from '../../hooks/window/useBeforeUnload';
import { useFullscreenStatus } from '../../hooks/window/useFullscreen';
import { PANE_GAP_REM, type PaneState } from '../middle/hooks/useHeaderPane';

import ActiveCallHeader from '../calls/ActiveCallHeader.async';
import GroupCall from '../calls/group/GroupCall.async';
import PhoneCall from '../calls/phone/PhoneCall.async';
import RatePhoneCallModal from '../calls/phone/RatePhoneCallModal.async';
import CustomEmojiSetsModal from '../common/CustomEmojiSetsModal.async';
import DeleteMessageModal from '../common/DeleteMessageModal.async';
import StickerSetModal from '../common/StickerSetModal.async';
import UnreadCount from '../common/UnreadCounter';
import Wallpaper from '../common/Wallpaper';
import LeftColumn from '../left/LeftColumn';
import MediaViewer from '../mediaViewer/MediaViewer.async';
import ReactionPicker from '../middle/message/reactions/ReactionPicker.async';
import MessageListHistoryHandler from '../middle/MessageListHistoryHandler';
import MiddleColumn from '../middle/MiddleColumn';
import AudioPlayer from '../middle/panes/AudioPlayer';
import ModalContainer from '../modals/ModalContainer';
import PaymentModal from '../payment/PaymentModal.async';
import ReceiptModal from '../payment/ReceiptModal.async';
import RightColumn from '../right/RightColumn';
import StoryViewer from '../story/StoryViewer.async';
import AttachBotRecipientPicker from './AttachBotRecipientPicker.async';
import BotTrustModal from './BotTrustModal.async';
import DeleteFolderDialog from './DeleteFolderDialog.async';
import Dialogs from './Dialogs';
import DownloadManager from './DownloadManager';
import DraftRecipientPicker from './DraftRecipientPicker.async';
import FoldersSidebar from './FoldersSidebar';
import ForwardRecipientPicker from './ForwardRecipientPicker.async';
import GameModal from './GameModal';
import HistoryCalendar from './HistoryCalendar.async';
import NewContactModal from './NewContactModal.async';
import PremiumLimitReachedModal from './premium/common/PremiumLimitReachedModal.async';
import GiveawayModal from './premium/GiveawayModal.async';
import PremiumMainModal from './premium/PremiumMainModal.async';
import StarsGiftingPickerModal from './premium/StarsGiftingPickerModal.async';
import ConfettiContainer from './visualEffects/ConfettiContainer';
import SnapEffectContainer from './visualEffects/SnapEffectContainer';
import WaveContainer from './visualEffects/WaveContainer';

import './Main.scss';
import backgroundStyles from '../../styles/_patternBackground.module.scss';

export interface OwnProps {
  isMobile?: boolean;
}

type StateProps = {
  isMasterTab?: boolean;
  currentUserId?: string;
  hasCurrentUser?: boolean;
  isLeftColumnOpen: boolean;
  isMiddleColumnOpen: boolean;
  isRightColumnOpen: boolean;
  isMediaViewerOpen: boolean;
  isStoryViewerOpen: boolean;
  isForwardModalOpen: boolean;
  isHistoryCalendarOpen: boolean;
  shouldSkipHistoryAnimations?: boolean;
  openedStickerSetShortName?: string;
  openedCustomEmojiSetIds?: string[];
  activeGroupCallId?: string;
  wasTimeFormatSetManually?: boolean;
  isPhoneCallActive?: boolean;
  addedSetIds?: string[];
  addedCustomEmojiIds?: string[];
  newContactUserId?: string;
  newContactByPhoneNumber?: boolean;
  openedGame?: TabState['openedGame'];
  gameTitle?: string;
  isRatePhoneCallModalOpen?: boolean;
  isPremiumModalOpen?: boolean;
  botTrustRequest?: TabState['botTrustRequest'];
  botTrustRequestBot?: ApiUser;
  requestedAttachBotInChat?: TabState['requestedAttachBotInChat'];
  requestedBotStartGroup?: TabState['requestedBotStartGroup'];
  requestedDraft?: TabState['requestedDraft'];
  limitReached?: ApiLimitTypeWithModal;
  deleteFolderDialog?: ApiChatFolder;
  isPaymentModalOpen?: boolean;
  isReceiptModalOpen?: boolean;
  isReactionPickerOpen: boolean;
  isGiveawayModalOpen?: boolean;
  isDeleteMessageModalOpen?: boolean;
  isStarsGiftingPickerModal?: boolean;
  isCurrentUserPremium?: boolean;
  noRightColumnAnimation?: boolean;
  withInterfaceAnimations?: boolean;
  isSynced?: boolean;
  isAccountFrozen?: boolean;
  isAppConfigLoaded?: boolean;
  isFoldersSidebarShown: boolean;
  diceEmojies?: string[];
  selectedGiftAuction?: ApiStarGiftAuctionState;
};

const APP_OUTDATED_TIMEOUT_MS = 5 * 60 * 1000; // 5 min
const CALL_BUNDLE_LOADING_DELAY_MS = 5000; // 5 sec
const EDITOR_BUNDLE_LOADING_DELAY_MS = 10000; // 10 sec

let DEBUG_isLogged = false;

const Main = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const {
    initMain,
    loadAnimatedEmojis,
    loadBirthdayNumbersStickers,
    loadRestrictedEmojiStickers,
    loadNotificationSettings,
    loadNotificationExceptions,
    updateIsOnline,
    onTabFocusChange,
    loadTopPeers,
    loadEmojiKeywords,
    loadCountryList,
    loadAvailableReactions,
    loadStickerSets,
    loadDiceStickers,
    loadPremiumGifts,
    loadTonGifts,
    loadStarGifts,
    loadMyUniqueGifts,
    loadDefaultTopicIcons,
    loadAddedStickers,
    loadFavoriteStickers,
    loadDefaultStatusIcons,
    ensureTimeFormat,
    closeStickerSetModal,
    closeCustomEmojiSets,
    loadConfig,
    loadAppConfig,
    loadAttachBots,
    loadWalletState,
    loadContactList,
    loadCustomEmojis,
    loadGenericEmojiEffects,
    closePaymentModal,
    clearReceipt,
    checkAppVersion,
    openThread,
    toggleLeftColumn,
    loadRecentEmojiStatuses,
    loadUserCollectibleStatuses,
    updatePageTitle,
    loadTopReactions,
    loadRecentReactions,
    loadDefaultTagReactions,
    loadFeaturedEmojiStickers,
    loadAuthorizations,
    loadPeerColors,
    loadSavedReactionTags,
    loadTimezones,
    loadAiComposeTones,
    loadQuickReplies,
    loadStarStatus,
    loadAvailableEffects,
    loadPaidReactionPrivacy,
    loadPasswordInfo,
    loadBotFreezeAppeal,
    loadAllChats,
    loadAllStories,
    loadAllHiddenStories,
    loadContentSettings,
    loadGiftAuction,
    loadPromoData,
    loadActiveGiftAuctions,
  } = getActions();

  if (DEBUG && !DEBUG_isLogged) {
    DEBUG_isLogged = true;
    // eslint-disable-next-line no-console
    console.log('>>> RENDER MAIN');
  }

  const lang = useLang();

  // Preload Calls bundle to initialize sounds for iOS
  useTimeout(() => {
    void loadBundle(Bundles.Calls);
  }, CALL_BUNDLE_LOADING_DELAY_MS);

  useTimeout(
    () => {
      onFullyIdle(() => {
        void loadBundle(Bundles.Editor);
      });
    },
    () => (props.isSynced ? EDITOR_BUNDLE_LOADING_DELAY_MS : undefined),
  );

  let containerRef!: HTMLDivElement;
  let leftColumnRef!: HTMLDivElement;

  const { isDesktop } = useAppLayout();
  createEffect(
    depsOf(
      () => [isDesktop, props.isLeftColumnOpen, props.isMiddleColumnOpen, props.isMobile, toggleLeftColumn] as const,
    ),
    ([, isLeftColumnOpen2, isMiddleColumnOpen2, isMobile2]) => {
      if (!isLeftColumnOpen2 && !isMiddleColumnOpen2 && !isDesktop) {
        // Always display at least one column
        toggleLeftColumn();
      } else if (isLeftColumnOpen2 && isMiddleColumnOpen2 && isMobile2) {
        // Can't have two active columns at the same time
        toggleLeftColumn();
      }
    },
  );

  createEffect(
    () => props.isMobile,
    (isMobile2) => {
      if (IS_TAURI && IS_MAC_OS) {
        window.tauri?.markTitleBarOverlay(true, isMobile2);
      }
    },
  );

  useInterval(checkAppVersion, () => (props.isMasterTab ? APP_OUTDATED_TIMEOUT_MS : undefined), true);

  // Initial API calls
  createEffect(
    depsOf(() => [props.isMasterTab, props.isSynced] as const),
    ([isMasterTab2, isSynced2]) => {
      if (isMasterTab2 && isSynced2) {
        updateIsOnline({ isOnline: true });
        loadConfig();
        loadAppConfig();
        loadPeerColors();
        initMain();
        loadContactList();
        checkAppVersion();
        loadAuthorizations();
        loadPasswordInfo();
      }
    },
  );

  // Initial API calls
  createEffect(
    depsOf(() => [props.isMasterTab, props.isSynced, props.isAppConfigLoaded, props.isAccountFrozen] as const),
    ([isMasterTab2, isSynced2, isAppConfigLoaded2, isAccountFrozen2]) => {
      if (isMasterTab2 && isSynced2 && isAppConfigLoaded2 && !isAccountFrozen2) {
        loadAllStories();
        loadAllHiddenStories();
        loadPromoData();
        loadContentSettings();
        loadRecentReactions();
        loadDefaultTagReactions();
        loadAttachBots();

        // `wallet.getState` creates the wallet on first call, so it is only made where the wallet is rolled out
        if (getGlobal().appConfig.isWalletAvailable) {
          loadWalletState();
        }

        loadNotificationSettings();
        loadNotificationExceptions();
        loadTopPeers({ category: 'botsInline' });
        loadTopReactions();
        loadStarStatus();
        loadEmojiKeywords({ language: BASE_EMOJI_KEYWORD_LANG });
        loadFeaturedEmojiStickers();
        loadSavedReactionTags();
        loadTopPeers({ category: 'botsApp' });
        loadTopPeers({ category: 'botsGuestChat' });
        loadPaidReactionPrivacy();
        loadDefaultTopicIcons();
        loadAnimatedEmojis();
        loadAvailableReactions();
        loadUserCollectibleStatuses();
        loadGenericEmojiEffects();
        loadPremiumGifts();
        loadTonGifts();
        loadStarGifts();
        loadMyUniqueGifts();
        loadAvailableEffects();
        loadBirthdayNumbersStickers();
        loadRestrictedEmojiStickers();
        loadQuickReplies();
        loadTimezones();
        loadAiComposeTones();
        loadActiveGiftAuctions();
      }
    },
  );

  // The saved list is keyed on the current user, who may land in the global after the first sync
  createEffect(
    depsOf(
      () =>
        [
          props.isMasterTab,
          props.isSynced,
          props.isAppConfigLoaded,
          props.isAccountFrozen,
          props.hasCurrentUser,
        ] as const,
    ),
    ([isMasterTab2, isSynced2, isAppConfigLoaded2, isAccountFrozen2, hasCurrentUser2]) => {
      if (isMasterTab2 && isSynced2 && isAppConfigLoaded2 && !isAccountFrozen2 && hasCurrentUser2) {
        loadAllChats({ listType: 'saved' });
      }
    },
  );

  // Initial Premium API calls
  createEffect(
    depsOf(
      () => [props.isCurrentUserPremium, props.isMasterTab, props.isAppConfigLoaded, props.isAccountFrozen] as const,
    ),
    ([isCurrentUserPremium2, isMasterTab2, isAppConfigLoaded2, isAccountFrozen2]) => {
      if (isMasterTab2 && isCurrentUserPremium2 && isAppConfigLoaded2 && !isAccountFrozen2) {
        loadDefaultStatusIcons();
        loadRecentEmojiStatuses();
      }
    },
  );

  // Language-based API calls
  createEffect(
    depsOf(() => [lang.code, props.isMasterTab] as const),
    ([, isMasterTab2]) => {
      if (isMasterTab2) {
        if (lang.code !== BASE_EMOJI_KEYWORD_LANG) {
          loadEmojiKeywords({ language: lang.code });
        }

        loadCountryList({ langCode: lang.code });
      }
    },
  );

  // Re-fetch cached saved emoji for `localDb`
  createEffect(
    () => props.isMasterTab,
    (isMasterTab2) => {
      if (isMasterTab2) {
        loadCustomEmojis({
          ids: Object.keys(getGlobal().customEmojis.byId),
          ignoreCache: true,
        });
      }
    },
  );

  // Sticker sets
  createEffect(
    depsOf(
      () =>
        [
          props.addedSetIds,
          props.addedCustomEmojiIds,
          props.isMasterTab,
          props.isSynced,
          props.isAppConfigLoaded,
          props.isAccountFrozen,
        ] as const,
    ),
    ([addedSetIds2, addedCustomEmojiIds2, isMasterTab2, isSynced2, isAppConfigLoaded2, isAccountFrozen2]) => {
      if (isMasterTab2 && isSynced2 && isAppConfigLoaded2 && !isAccountFrozen2) {
        if (!addedSetIds2 || !addedCustomEmojiIds2) {
          loadStickerSets();
          loadFavoriteStickers();
        }

        if (addedSetIds2 && addedCustomEmojiIds2) {
          loadAddedStickers();
        }
      }
    },
  );

  createEffect(
    depsOf(
      () =>
        [props.isMasterTab, props.isSynced, props.isAppConfigLoaded, props.isAccountFrozen, props.diceEmojies] as const,
    ),
    ([isMasterTab2, isSynced2, isAppConfigLoaded2, isAccountFrozen2, diceEmojies2]) => {
      if (isMasterTab2 && isSynced2 && isAppConfigLoaded2 && !isAccountFrozen2 && diceEmojies2) {
        loadDiceStickers();
      }
    },
  );

  createEffect(
    () => props.isAppConfigLoaded,
    (isAppConfigLoaded2) => {
      loadBotFreezeAppeal();
    },
  );

  // Ensure time format
  createEffect(
    () => props.wasTimeFormatSetManually,
    (wasTimeFormatSetManually2) => {
      if (!wasTimeFormatSetManually2) {
        ensureTimeFormat();
      }
    },
  );

  // Parse deep link
  createEffect(
    () => props.isSynced,
    (isSynced2) => {
      if (!isSynced2) return;
      updatePageTitle();

      const parsedInitialLocationHash = parseInitialLocationHash();
      if (parsedInitialLocationHash?.tgaddr) {
        processDeepLink(parsedInitialLocationHash.tgaddr, { type: 'inner' });
      }
    },
  );

  useTauriEvent<string>('deeplink', (event) => {
    try {
      const url = event.payload || '';
      const decodedUrl = decodeURIComponent(url);
      processDeepLink(decodedUrl, { type: 'inner' });
    } catch (e) {
      if (DEBUG) {
        // eslint-disable-next-line no-console
        console.error('Failed to process deep link', e);
      }
    }
  });

  createEffect(
    () => props.currentUserId,
    (currentUserId2) => {
      const parsedLocationHash = parseLocationHash(currentUserId2);
      if (!parsedLocationHash) return;

      openThread({
        chatId: parsedLocationHash.chatId,
        threadId: parsedLocationHash.threadId,
        type: parsedLocationHash.type,
      });
    },
  );

  // Refresh gift auction subscription
  const auctionTimeout = createMemo(() =>
    props.selectedGiftAuction?.state.type === 'active' ? props.selectedGiftAuction?.timeout : undefined,
  );
  const auctionGiftId = createMemo(() => props.selectedGiftAuction?.gift.id);
  useInterval(
    () => {
      if (auctionGiftId()) {
        loadGiftAuction({ giftId: auctionGiftId() });
      }
    },
    () => (auctionTimeout() ? auctionTimeout() * 1000 : undefined),
  );

  // Restore Transition slide class after async rendering
  onMount(() => {
    const container = containerRef!;
    if (container.parentNode!.childElementCount === 1) {
      addExtraClass(container, 'Transition_slide-active');
    }
  });

  createShowTransition({
    // TODO(codemod): ref option: hand the result `ref` to the element (ref={t.ref}) instead
    ref: () => containerRef,
    isOpen: () => props.isLeftColumnOpen,
    noCloseTransition: () => props.shouldSkipHistoryAnimations,
    prefix: 'left-column-',
  });
  let willAnimateLeftColumnRef = false;
  // TODO(codemod): useForceUpdate: a component runs once; make the changing value a signal and delete the force update
  const forceUpdate = useForceUpdate();

  // Handle opening middle column
  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(
    depsOf(() => [props.isLeftColumnOpen, props.withInterfaceAnimations, forceUpdate]),
    (_deps, prev) => {
      const [prevIsLeftColumnOpen] = prev ?? [];
      if (
        prevIsLeftColumnOpen === undefined ||
        props.isLeftColumnOpen === prevIsLeftColumnOpen ||
        !props.withInterfaceAnimations
      ) {
        return;
      }

      willAnimateLeftColumnRef = true;

      if (IS_ANDROID) {
        requestNextMutation(() => {
          document.body.classList.toggle('android-left-blackout-open', !props.isLeftColumnOpen);
        });
      }

      const endHeavyAnimation = beginHeavyAnimation();

      waitForTransitionEnd(document.getElementById('MiddleColumn')!, () => {
        endHeavyAnimation();
        willAnimateLeftColumnRef = false;
        forceUpdate();
      });
    },
  );

  createShowTransition({
    // TODO(codemod): ref option: hand the result `ref` to the element (ref={t.ref}) instead
    ref: () => containerRef,
    isOpen: () => props.isRightColumnOpen,
    noMountTransition: true,
    noCloseTransition: () => props.shouldSkipHistoryAnimations,
    prefix: 'right-column-',
  });
  let willAnimateRightColumnRef = false;
  const [isNarrowMessageList, setIsNarrowMessageList] = createSignal(props.isRightColumnOpen);

  const isFullscreen = useFullscreenStatus();

  // Handle opening right column
  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(
    depsOf(() => [props.isMiddleColumnOpen, props.isRightColumnOpen, props.noRightColumnAnimation, forceUpdate]),
    (_deps, prev) => {
      const [prevIsMiddleColumnOpen, prevIsRightColumnOpen] = prev ?? [];
      if (prevIsRightColumnOpen === undefined || props.isRightColumnOpen === prevIsRightColumnOpen) {
        return;
      }

      if (!prevIsMiddleColumnOpen || props.noRightColumnAnimation) {
        setIsNarrowMessageList(props.isRightColumnOpen);
        return;
      }

      willAnimateRightColumnRef = true;

      const endHeavyAnimation = beginHeavyAnimation();

      waitForTransitionEnd(document.getElementById('RightColumn')!, () => {
        endHeavyAnimation();
        willAnimateRightColumnRef = false;
        forceUpdate();
        setIsNarrowMessageList(props.isRightColumnOpen);
      });
    },
  );

  const bgClassName = createMemo(() =>
    buildClassName(!props.noRightColumnAnimation && backgroundStyles.withTransition),
  );

  const className = createMemo(() =>
    buildClassName(
      willAnimateLeftColumnRef && 'left-column-animating',
      willAnimateRightColumnRef && 'right-column-animating',
      isNarrowMessageList() && 'narrow-message-list',
      props.shouldSkipHistoryAnimations && 'history-animation-disabled',
      isFullscreen && 'is-fullscreen',
      props.isFoldersSidebarShown && 'folders-sidebar-visible',
    ),
  );

  const handleBlur = () => {
    onTabFocusChange({ isBlurred: true });
  };

  const handleFocus = () => {
    onTabFocusChange({ isBlurred: false });

    if (!document.title.includes(INACTIVE_MARKER)) {
      updatePageTitle();
    }

    updateIcon(false);
  };

  let playerReserveRef = 0;
  const handlePlayerPaneStateChange = ({ height }: PaneState) => {
    const main = containerRef;
    const middleColumn = document.getElementById('MiddleColumn');
    if (!main || !middleColumn) return;
    const occupiedHeight = height ? height + PANE_GAP_REM * REM : 0;
    const heightDelta = occupiedHeight - playerReserveRef;
    if (!heightDelta) return;
    playerReserveRef = occupiedHeight;
    const parkedShift = occupiedHeight ? '0px' : 'var(--middle-panel-inline-padding)';
    updateTopReserveWithScrollCompensation(
      middleColumn,
      heightDelta,
      () => {
        setExtraStyles(main, {
          '--middle-header-player-height': `${occupiedHeight}px`,
          '--middle-header-player-parked': parkedShift,
        });
        setExtraStyles(middleColumn, {
          '--middle-header-player-height': `${occupiedHeight}px`,
          '--middle-header-player-parked': parkedShift,
        });
      },
      [main],
    );
  };

  const handleStickerSetModalClose = () => {
    closeStickerSetModal();
  };

  const handleCustomEmojiSetsModalClose = () => {
    closeCustomEmojiSets();
  };

  // Online status and browser tab indicators
  useBackgroundMode(handleBlur, handleFocus, IS_TAURI);
  useBeforeUnload(handleBlur);
  usePreventPinchZoomGesture(() => props.isMediaViewerOpen || props.isStoryViewerOpen);

  return (
    <Wallpaper
      containerRef={(el) => {
        containerRef = el;
      }}
      id="Main"
      className={className()}
      bgClassName={bgClassName()}
    >
      {IS_TAURI && IS_MAC_OS && <div class="tauri-drag-region" data-tauri-drag-region />}
      <FoldersSidebar isMobile={props.isMobile} isActive={props.isFoldersSidebarShown} />
      <LeftColumn ref={leftColumnRef} isFoldersSidebarShown={props.isFoldersSidebarShown} />
      <MiddleColumn
        leftColumnRef={(el) => {
          leftColumnRef = el;
        }}
        isMobile={props.isMobile}
        onPlayerPaneStateChange={handlePlayerPaneStateChange}
      />
      <RightColumn isMobile={props.isMobile} />
      <MediaViewer isOpen={props.isMediaViewerOpen} />
      <StoryViewer isOpen={props.isStoryViewerOpen} />
      <ForwardRecipientPicker isOpen={props.isForwardModalOpen} />
      <DraftRecipientPicker requestedDraft={props.requestedDraft} />
      <Dialogs />
      <AudioPlayer noUi />
      <ModalContainer />
      <HistoryCalendar isOpen={props.isHistoryCalendarOpen} />
      <StickerSetModal
        isOpen={Boolean(props.openedStickerSetShortName)}
        onClose={handleStickerSetModalClose}
        stickerSetShortName={props.openedStickerSetShortName}
      />
      <CustomEmojiSetsModal
        customEmojiSetIds={props.openedCustomEmojiSetIds}
        onClose={handleCustomEmojiSetsModalClose}
      />
      {props.activeGroupCallId && <GroupCall groupCallId={props.activeGroupCallId} />}
      <ActiveCallHeader isActive={Boolean(props.activeGroupCallId || props.isPhoneCallActive)} />
      <NewContactModal
        isOpen={Boolean(props.newContactUserId || props.newContactByPhoneNumber)}
        userId={props.newContactUserId}
        isByPhoneNumber={props.newContactByPhoneNumber}
      />
      <GameModal openedGame={props.openedGame} gameTitle={props.gameTitle} />
      <DownloadManager />
      <ConfettiContainer />
      {IS_WAVE_TRANSFORM_SUPPORTED && <WaveContainer />}
      <SnapEffectContainer />
      <PhoneCall isActive={props.isPhoneCallActive} />
      <UnreadCount isForAppBadge />
      <RatePhoneCallModal isOpen={props.isRatePhoneCallModalOpen} />
      <BotTrustModal
        bot={props.botTrustRequestBot}
        type={props.botTrustRequest?.type}
        shouldRequestWriteAccess={props.botTrustRequest?.shouldRequestWriteAccess}
      />
      <AttachBotRecipientPicker
        requestedAttachBotInChat={props.requestedAttachBotInChat}
        requestedBotStartGroup={props.requestedBotStartGroup}
      />
      <MessageListHistoryHandler />
      <PremiumMainModal isOpen={props.isPremiumModalOpen} />
      <GiveawayModal isOpen={props.isGiveawayModalOpen} />
      <StarsGiftingPickerModal isOpen={props.isStarsGiftingPickerModal} />
      <PremiumLimitReachedModal limit={props.limitReached} />
      <PaymentModal isOpen={props.isPaymentModalOpen} onClose={closePaymentModal} />
      <ReceiptModal isOpen={props.isReceiptModalOpen} onClose={clearReceipt} />
      <DeleteFolderDialog folder={props.deleteFolderDialog} />
      <ReactionPicker isOpen={props.isReactionPickerOpen} />
      <DeleteMessageModal isOpen={props.isDeleteMessageModalOpen} />
    </Wallpaper>
  );
};

const mapStateToProps = (global: GlobalState, { isMobile }: OwnProps): Complete<StateProps> => {
  const { currentUserId } = global;

  const {
    botTrustRequest,
    requestedAttachBotInChat,
    requestedBotStartGroup,
    requestedDraft,
    openedStickerSetShortName,
    openedCustomEmojiSetIds,
    shouldSkipHistoryAnimations,
    openedGame,
    isLeftColumnShown,
    historyCalendarSelectedAt,
    newContact,
    ratingPhoneCall,
    premiumModal,
    giveawayModal,
    deleteMessageModal,
    starsGiftingPickerModal,
    isMasterTab,
    payment,
    limitReachedModal,
    deleteFolderDialogModal,
  } = selectTabState(global);

  const selectedGiftAuction = selectTabSelectedGiftAuction(global);

  const { wasTimeFormatSetManually, foldersPosition } = selectSharedSettings(global);

  const gameMessage = openedGame && selectChatMessage(global, openedGame.chatId, openedGame.messageId);
  const gameTitle = gameMessage?.content.game?.title;
  const { chatId } = selectCurrentMessageList(global) || {};
  const noRightColumnAnimation =
    !selectPerformanceSettingsValue(global, 'rightColumnAnimations') || !selectCanAnimateInterface(global);

  const deleteFolderDialog = deleteFolderDialogModal ? selectChatFolder(global, deleteFolderDialogModal) : undefined;
  const isAccountFrozen = selectIsCurrentUserFrozen(global);

  return {
    currentUserId,
    hasCurrentUser: Boolean(selectUser(global, currentUserId!)),
    isLeftColumnOpen: isLeftColumnShown,
    isMiddleColumnOpen: Boolean(chatId),
    isRightColumnOpen: selectIsRightColumnShown(global, isMobile),
    isMediaViewerOpen: selectIsMediaViewerOpen(global),
    isStoryViewerOpen: selectIsStoryViewerOpen(global),
    isForwardModalOpen: selectIsForwardModalOpen(global),
    isReactionPickerOpen: selectIsReactionPickerOpen(global),
    isHistoryCalendarOpen: Boolean(historyCalendarSelectedAt),
    shouldSkipHistoryAnimations,
    openedStickerSetShortName,
    openedCustomEmojiSetIds,
    activeGroupCallId: isMasterTab ? global.groupCalls.activeGroupCallId : undefined,
    withInterfaceAnimations: selectCanAnimateInterface(global),
    wasTimeFormatSetManually,
    isPhoneCallActive: isMasterTab ? Boolean(global.phoneCall) : undefined,
    addedSetIds: global.stickers.added.setIds,
    addedCustomEmojiIds: global.customEmojis.added.setIds,
    newContactUserId: newContact?.userId,
    newContactByPhoneNumber: newContact?.isByPhoneNumber,
    openedGame,
    gameTitle,
    isRatePhoneCallModalOpen: Boolean(ratingPhoneCall),
    botTrustRequest,
    botTrustRequestBot: botTrustRequest && selectUser(global, botTrustRequest.botId),
    requestedAttachBotInChat,
    requestedBotStartGroup,
    isCurrentUserPremium: selectIsCurrentUserPremium(global),
    isPremiumModalOpen: premiumModal?.isOpen,
    isGiveawayModalOpen: giveawayModal?.isOpen,
    isDeleteMessageModalOpen: Boolean(deleteMessageModal),
    isStarsGiftingPickerModal: starsGiftingPickerModal?.isOpen,
    limitReached: limitReachedModal?.limit,
    isPaymentModalOpen: payment.isPaymentModalOpen,
    isReceiptModalOpen: Boolean(payment.receipt),
    deleteFolderDialog,
    isMasterTab,
    requestedDraft,
    noRightColumnAnimation,
    isSynced: global.isSynced,
    isAccountFrozen,
    isAppConfigLoaded: global.isAppConfigLoaded,
    isFoldersSidebarShown: foldersPosition === FOLDERS_POSITION_LEFT && !isMobile && selectAreFoldersPresent(global),
    diceEmojies: global.appConfig?.diceEmojies,
    selectedGiftAuction,
  };
};

export default Main;
