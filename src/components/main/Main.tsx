import '../../global/actions/all';

import {
  beginHeavyAnimation,
  createEffect,
  createMemo,
  createSignal,
  onFullyIdle,
  requestNextMutation,
} from 'frameact';
import { getActions, getGlobal, withGlobal } from '../../global';

import type { ApiStarGiftAuctionState } from '../../api/types';
import type { GlobalState } from '../../global/types';

import { BASE_EMOJI_KEYWORD_LANG, DEBUG, FOLDERS_POSITION_LEFT, INACTIVE_MARKER } from '../../config';
import { createShowTransition } from '../../lib/kit';
import {
  selectAreFoldersPresent,
  selectCanAnimateInterface,
  selectCurrentMessageList,
  selectIsCurrentUserFrozen,
  selectIsCurrentUserPremium,
  selectIsMediaViewerOpen,
  selectIsRightColumnShown,
  selectIsStoryViewerOpen,
  selectPerformanceSettingsValue,
  selectTabSelectedGiftAuction,
  selectTabState,
  selectUser,
} from '../../global/selectors';
import { selectSharedSettings } from '../../global/selectors/sharedState';
import { IS_TAURI } from '../../util/browser/globalEnvironment';
import { IS_ANDROID, IS_MAC_OS } from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';
import { waitForTransitionEnd } from '../../util/cssAnimationEndListeners';
import { processDeepLink } from '../../util/deeplink';
import { depsOf } from '../../util/effectDeps';
import { Bundles, loadBundle } from '../../util/moduleLoader';
import { parseInitialLocationHash, parseLocationHash } from '../../util/routing';
import updateIcon from '../../util/updateIcon';

import useInterval from '../../hooks/schedulers/useInterval';
import useTimeout from '../../hooks/schedulers/useTimeout';
import useTauriEvent from '../../hooks/tauri/useTauriEvent';
import useAppLayout from '../../hooks/useAppLayout';
import useLang from '../../hooks/useLang';
import usePreventPinchZoomGesture from '../../hooks/usePreventPinchZoomGesture';
import useBackgroundMode from '../../hooks/window/useBackgroundMode';
import useBeforeUnload from '../../hooks/window/useBeforeUnload';
import { useFullscreenStatus } from '../../hooks/window/useFullscreen';

import UnreadCount from '../common/UnreadCounter';
import Wallpaper from '../common/Wallpaper';
import LeftColumn from '../left/LeftColumn';
import MessageListHistoryHandler from '../middle/MessageListHistoryHandler';
import MiddleColumn from '../middle/MiddleColumn';
import RightColumn from '../right/RightColumn';

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
  shouldSkipHistoryAnimations?: boolean;
  wasTimeFormatSetManually?: boolean;
  addedSetIds?: string[];
  addedCustomEmojiIds?: string[];
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
    loadConfig,
    loadAppConfig,
    loadAttachBots,
    loadWalletState,
    loadContactList,
    loadCustomEmojis,
    loadGenericEmojiEffects,
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
      const giftId = auctionGiftId();
      if (giftId) {
        loadGiftAuction({ giftId });
      }
    },
    () => {
      const timeout = auctionTimeout();
      return timeout ? timeout * 1000 : undefined;
    },
  );

  // Deviation: tt restored the `Transition_slide-active` class on `#Main` after async rendering (its Transition had no
  // slide wrapper for it). The kit's Transition always wraps a slide and owns that class, so nothing is restored.

  const leftColumnTransition = createShowTransition({
    isOpen: () => props.isLeftColumnOpen,
    noCloseTransition: () => props.shouldSkipHistoryAnimations,
    prefix: 'left-column-',
  });
  const [willAnimateLeftColumn, setWillAnimateLeftColumn] = createSignal(false);

  // Handle opening middle column
  // Deviation: tt's `useSyncEffect` ran during render; an effect runs at the end of the tick.
  createEffect(
    depsOf(() => [props.isLeftColumnOpen, props.withInterfaceAnimations] as const),
    ([isLeftColumnOpen2, withInterfaceAnimations2], prev) => {
      const [prevIsLeftColumnOpen] = prev ?? [];
      if (
        prevIsLeftColumnOpen === undefined ||
        isLeftColumnOpen2 === prevIsLeftColumnOpen ||
        !withInterfaceAnimations2
      ) {
        return;
      }

      setWillAnimateLeftColumn(true);

      if (IS_ANDROID) {
        requestNextMutation(() => {
          document.body.classList.toggle('android-left-blackout-open', !isLeftColumnOpen2);
        });
      }

      const endHeavyAnimation = beginHeavyAnimation();

      waitForTransitionEnd(document.getElementById('MiddleColumn')!, () => {
        endHeavyAnimation();
        setWillAnimateLeftColumn(false);
      });
    },
  );

  const rightColumnTransition = createShowTransition({
    isOpen: () => props.isRightColumnOpen,
    noMountTransition: true,
    noCloseTransition: () => props.shouldSkipHistoryAnimations,
    prefix: 'right-column-',
  });
  const [willAnimateRightColumn, setWillAnimateRightColumn] = createSignal(false);
  const [isNarrowMessageList, setIsNarrowMessageList] = createSignal(props.isRightColumnOpen);

  const isFullscreen = useFullscreenStatus();

  // Handle opening right column
  createEffect(
    depsOf(() => [props.isMiddleColumnOpen, props.isRightColumnOpen, props.noRightColumnAnimation] as const),
    ([, isRightColumnOpen2, noRightColumnAnimation2], prev) => {
      const [prevIsMiddleColumnOpen, prevIsRightColumnOpen] = prev ?? [];
      if (prevIsRightColumnOpen === undefined || isRightColumnOpen2 === prevIsRightColumnOpen) {
        return;
      }

      if (!prevIsMiddleColumnOpen || noRightColumnAnimation2) {
        setIsNarrowMessageList(isRightColumnOpen2);
        return;
      }

      setWillAnimateRightColumn(true);

      const endHeavyAnimation = beginHeavyAnimation();

      waitForTransitionEnd(document.getElementById('RightColumn')!, () => {
        endHeavyAnimation();
        setWillAnimateRightColumn(false);
        setIsNarrowMessageList(isRightColumnOpen2);
      });
    },
  );

  const bgClassName = createMemo(() =>
    buildClassName(!props.noRightColumnAnimation && backgroundStyles.withTransition),
  );

  const className = createMemo(() =>
    buildClassName(
      willAnimateLeftColumn() && 'left-column-animating',
      willAnimateRightColumn() && 'right-column-animating',
      isNarrowMessageList() && 'narrow-message-list',
      props.shouldSkipHistoryAnimations && 'history-animation-disabled',
      isFullscreen() && 'is-fullscreen',
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

  // TODO(port): the audio player pane reserve (`handlePlayerPaneStateChange`) comes with the middle column.

  // Online status and browser tab indicators
  useBackgroundMode(handleBlur, handleFocus, IS_TAURI);
  useBeforeUnload(handleBlur);
  usePreventPinchZoomGesture(() => props.isMediaViewerOpen || props.isStoryViewerOpen);

  return (
    <Wallpaper
      containerRef={(el) => {
        leftColumnTransition.ref(el);
        rightColumnTransition.ref(el);
      }}
      id="Main"
      className={className()}
      bgClassName={bgClassName()}
    >
      {IS_TAURI && IS_MAC_OS && <div class="tauri-drag-region" data-tauri-drag-region />}
      {/* TODO(port): FoldersSidebar (`foldersPosition: left`) */}
      <LeftColumn ref={(el) => (leftColumnRef = el)} isFoldersSidebarShown={props.isFoldersSidebarShown} />
      <MiddleColumn leftColumnRef={() => leftColumnRef} isMobile={props.isMobile} />
      <RightColumn isMobile={props.isMobile} />
      {/* TODO(port): MediaViewer, StoryViewer, recipient pickers, Dialogs, AudioPlayer, ModalContainer, HistoryCalendar,
          sticker set / custom emoji set / premium / payment modals, calls, GameModal, DownloadManager, visual effects */}
      <UnreadCount isForAppBadge />
      <MessageListHistoryHandler />
    </Wallpaper>
  );
};

const mapStateToProps = (global: GlobalState, { isMobile }: OwnProps): Complete<StateProps> => {
  const { currentUserId } = global;

  const { isMasterTab, shouldSkipHistoryAnimations, isLeftColumnShown } = selectTabState(global);

  const selectedGiftAuction = selectTabSelectedGiftAuction(global);

  const { wasTimeFormatSetManually, foldersPosition } = selectSharedSettings(global);

  const { chatId } = selectCurrentMessageList(global) || {};
  const noRightColumnAnimation =
    !selectPerformanceSettingsValue(global, 'rightColumnAnimations') || !selectCanAnimateInterface(global);

  const isAccountFrozen = selectIsCurrentUserFrozen(global);

  return {
    currentUserId,
    hasCurrentUser: Boolean(selectUser(global, currentUserId!)),
    isLeftColumnOpen: isLeftColumnShown,
    isMiddleColumnOpen: Boolean(chatId),
    isRightColumnOpen: selectIsRightColumnShown(global, isMobile),
    isMediaViewerOpen: selectIsMediaViewerOpen(global),
    isStoryViewerOpen: selectIsStoryViewerOpen(global),
    shouldSkipHistoryAnimations,
    withInterfaceAnimations: selectCanAnimateInterface(global),
    wasTimeFormatSetManually,
    addedSetIds: global.stickers.added.setIds,
    addedCustomEmojiIds: global.customEmojis.added.setIds,
    isCurrentUserPremium: selectIsCurrentUserPremium(global),
    isMasterTab,
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
