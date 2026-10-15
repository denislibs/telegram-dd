import { createEffect, createMemo, createSignal, onMount } from 'frameact';
import { Show } from 'frameact/dom';
import { getActions, withGlobal } from '../../global';

import type { GlobalState } from '../../global/types';
import type { FoldersActions } from '../../hooks/reducers/useFoldersReducer';
import type { ReducerAction } from '../../hooks/useReducer';
import type { TransitionSlide } from '../../lib/kit';
import { type AnimationLevel, LeftColumnContent, SettingsScreens } from '../../types';

import {
  selectCurrentChat,
  selectIsChatListPanelOpen,
  selectIsCurrentUserFrozen,
  selectIsForumPanelOpen,
  selectPeerHasProfileBackground,
  selectTabState,
} from '../../global/selectors';
import { selectSharedSettings } from '../../global/selectors/sharedState';
import { IS_APP, IS_FIREFOX, IS_MAC_OS, IS_TOUCH_ENV } from '../../util/browser/windowEnvironment';
import captureEscKeyListener from '../../util/captureEscKeyListener';
import { depsOf } from '../../util/effectDeps';
import { resolveTransitionName } from '../../util/resolveTransitionName';
import { captureControlledSwipe } from '../../util/swipeController';
import { isComposerHasSelection } from '../middle/composer/helpers/selection';

import useFoldersReducer from '../../hooks/reducers/useFoldersReducer';
import { useHotkeys } from '../../hooks/useHotkeys';

import Transition from '../ui/Transition';
import ArchivedChats from './ArchivedChats.async';
import LeftMain from './main/LeftMain';
import NewChat from './newChat/NewChat.async';
import Settings from './settings/Settings.async';

import './LeftColumn.scss';

interface OwnProps {
  ref: (el: HTMLDivElement) => void;
  isFoldersSidebarShown: boolean;
}

type StateProps = {
  contentKey: LeftColumnContent;
  settingsScreen: SettingsScreens;
  searchQuery?: string;
  searchDate?: number;
  isFirstChatFolderActive: boolean;
  animationLevel: AnimationLevel;
  shouldSkipHistoryAnimations?: boolean;
  currentUserId?: string;
  hasPasscode?: boolean;
  nextFoldersAction?: ReducerAction<FoldersActions>;
  isChatOpen: boolean;
  isAppUpdateAvailable?: boolean;
  isForumPanelOpen?: boolean;
  isChatListPanelOpen?: boolean;
  forumPanelChatId?: string;
  isClosingSearch?: boolean;
  archiveSettings: GlobalState['archiveSettings'];
  isArchivedStoryRibbonShown?: boolean;
  isAccountFrozen?: boolean;
  hasProfileBackground?: boolean;
};

enum ContentType {
  Main,

  // eslint-disable-next-line @typescript-eslint/no-shadow
  Settings,
  Archived,

  NewGroup,

  NewChannel,
}

const RENDER_COUNT = Object.keys(ContentType).length / 2;
const RESET_TRANSITION_DELAY_MS = 250;

function LeftColumn(ownProps: OwnProps) {
  const props = withGlobal(ownProps, mapStateToProps);
  const {
    setGlobalSearchQuery,
    setGlobalSearchClosing,
    setGlobalSearchChatId,
    resetChatCreation,
    setGlobalSearchDate,
    loadPasswordInfo,
    clearTwoFaError,
    openChat,
    openLeftColumnContent,
    openSettingsScreen,
    openQuickChatPicker,
  } = getActions();

  const [contactsFilter, setContactsFilter] = createSignal<string>('');
  const [foldersState, foldersDispatch] = useFoldersReducer();

  // Used to reset child components in background.
  const [lastResetTime, setLastResetTime] = createSignal<number>(0);

  const contentType = createMemo(() => {
    switch (props.contentKey) {
      case LeftColumnContent.Archived:
        return ContentType.Archived;
      case LeftColumnContent.Settings:
        return ContentType.Settings;
      case LeftColumnContent.NewChannelStep1:
      case LeftColumnContent.NewChannelStep2:
        return ContentType.NewChannel;
      case LeftColumnContent.NewGroupStep1:
      case LeftColumnContent.NewGroupStep2:
        return ContentType.NewGroup;
      default:
        return ContentType.Main;
    }
  });

  const handleReset = (forceReturnToChatList?: true | Event) => {
    function fullReset() {
      openLeftColumnContent({ contentKey: undefined });
      openSettingsScreen({ screen: undefined });
      setContactsFilter('');
      setGlobalSearchClosing({ isClosing: true });
      resetChatCreation();
      setTimeout(() => {
        setGlobalSearchQuery({ query: '' });
        setGlobalSearchDate({ date: undefined });
        setGlobalSearchChatId({ id: undefined });
        setGlobalSearchClosing({ isClosing: false });
        setLastResetTime(Date.now());
      }, RESET_TRANSITION_DELAY_MS);
    }

    if (forceReturnToChatList === true) {
      fullReset();
      return;
    }

    if (props.contentKey === LeftColumnContent.NewGroupStep2) {
      openLeftColumnContent({ contentKey: LeftColumnContent.NewGroupStep1 });
      return;
    }

    if (props.contentKey === LeftColumnContent.NewChannelStep2) {
      openLeftColumnContent({ contentKey: LeftColumnContent.NewChannelStep1 });
      return;
    }

    if (props.contentKey === LeftColumnContent.NewGroupStep1) {
      const pickerSearchInput = document.getElementById('new-group-picker-search');
      if (pickerSearchInput) {
        pickerSearchInput.blur();
      }
    }

    if (props.contentKey === LeftColumnContent.Settings) {
      switch (props.settingsScreen) {
        case SettingsScreens.EditProfile:
        case SettingsScreens.Folders:
        case SettingsScreens.General:
        case SettingsScreens.Notifications:
        case SettingsScreens.DataStorage:
        case SettingsScreens.Privacy:
        case SettingsScreens.Performance:
        case SettingsScreens.ActiveSessions:
        case SettingsScreens.Language:
        case SettingsScreens.Stickers:
        case SettingsScreens.Experimental:
          openSettingsScreen({ screen: SettingsScreens.Main });
          return;

        case SettingsScreens.GeneralChatBackground:
          openSettingsScreen({ screen: SettingsScreens.General });
          return;
        case SettingsScreens.GeneralChatBackgroundColor:
          openSettingsScreen({ screen: SettingsScreens.GeneralChatBackground });
          return;

        case SettingsScreens.PrivacyPhoneNumber:
        case SettingsScreens.PrivacyAddByPhone:
        case SettingsScreens.PrivacyLastSeen:
        case SettingsScreens.PrivacyProfilePhoto:
        case SettingsScreens.PrivacyBio:
        case SettingsScreens.PrivacyBirthday:
        case SettingsScreens.PrivacyGifts:
        case SettingsScreens.PrivacySavedMusic:
        case SettingsScreens.PrivacyPhoneCall:
        case SettingsScreens.PrivacyPhoneP2P:
        case SettingsScreens.PrivacyForwarding:
        case SettingsScreens.PrivacyGroupChats:
        case SettingsScreens.PrivacyVoiceMessages:
        case SettingsScreens.PrivacyMessages:
        case SettingsScreens.AutoDeleteMessages:
        case SettingsScreens.PrivacyBlockedUsers:
        case SettingsScreens.ActiveWebsites:
        case SettingsScreens.TwoFaDisabled:
        case SettingsScreens.TwoFaEnabled:
        case SettingsScreens.TwoFaCongratulations:
        case SettingsScreens.PasscodeDisabled:
        case SettingsScreens.PasscodeEnabled:
        case SettingsScreens.PasscodeCongratulations:
        case SettingsScreens.Passkeys:
          openSettingsScreen({ screen: SettingsScreens.Privacy });
          return;

        case SettingsScreens.PasscodeNewPasscode:
          openSettingsScreen({
            screen: props.hasPasscode ? SettingsScreens.PasscodeEnabled : SettingsScreens.PasscodeDisabled,
          });
          return;

        case SettingsScreens.PasscodeChangePasscodeCurrent:
        case SettingsScreens.PasscodePasskeyAddConfirm:
        case SettingsScreens.PasscodePasskeyRemoveConfirm:
        case SettingsScreens.PasscodeTurnOff:
          openSettingsScreen({ screen: SettingsScreens.PasscodeEnabled });
          return;

        case SettingsScreens.PasscodeNewPasscodeConfirm:
          openSettingsScreen({ screen: SettingsScreens.PasscodeNewPasscode });
          return;

        case SettingsScreens.PasscodeChangePasscodeNew:
          openSettingsScreen({ screen: SettingsScreens.PasscodeChangePasscodeCurrent });
          return;

        case SettingsScreens.PasscodeChangePasscodeConfirm:
          openSettingsScreen({ screen: SettingsScreens.PasscodeChangePasscodeNew });
          return;

        case SettingsScreens.PrivacyPhoneNumberAllowedContacts:
        case SettingsScreens.PrivacyPhoneNumberDeniedContacts:
          openSettingsScreen({ screen: SettingsScreens.PrivacyPhoneNumber });
          return;
        case SettingsScreens.PrivacyLastSeenAllowedContacts:
        case SettingsScreens.PrivacyLastSeenDeniedContacts:
          openSettingsScreen({ screen: SettingsScreens.PrivacyLastSeen });
          return;
        case SettingsScreens.PrivacyProfilePhotoAllowedContacts:
        case SettingsScreens.PrivacyProfilePhotoDeniedContacts:
          openSettingsScreen({ screen: SettingsScreens.PrivacyProfilePhoto });
          return;
        case SettingsScreens.PrivacyBioAllowedContacts:
        case SettingsScreens.PrivacyBioDeniedContacts:
          openSettingsScreen({ screen: SettingsScreens.PrivacyBio });
          return;
        case SettingsScreens.PrivacyBirthdayAllowedContacts:
        case SettingsScreens.PrivacyBirthdayDeniedContacts:
          openSettingsScreen({ screen: SettingsScreens.PrivacyBirthday });
          return;
        case SettingsScreens.PrivacyGiftsAllowedContacts:
        case SettingsScreens.PrivacyGiftsDeniedContacts:
          openSettingsScreen({ screen: SettingsScreens.PrivacyGifts });
          return;
        case SettingsScreens.PrivacySavedMusicAllowedContacts:
        case SettingsScreens.PrivacySavedMusicDeniedContacts:
          openSettingsScreen({ screen: SettingsScreens.PrivacySavedMusic });
          return;
        case SettingsScreens.PrivacyPhoneCallAllowedContacts:
        case SettingsScreens.PrivacyPhoneCallDeniedContacts:
          openSettingsScreen({ screen: SettingsScreens.PrivacyPhoneCall });
          return;
        case SettingsScreens.PrivacyPhoneP2PAllowedContacts:
        case SettingsScreens.PrivacyPhoneP2PDeniedContacts:
          openSettingsScreen({ screen: SettingsScreens.PrivacyPhoneP2P });
          return;
        case SettingsScreens.PrivacyForwardingAllowedContacts:
        case SettingsScreens.PrivacyForwardingDeniedContacts:
          openSettingsScreen({ screen: SettingsScreens.PrivacyForwarding });
          return;
        case SettingsScreens.PrivacyVoiceMessagesAllowedContacts:
        case SettingsScreens.PrivacyVoiceMessagesDeniedContacts:
          openSettingsScreen({ screen: SettingsScreens.PrivacyVoiceMessages });
          return;
        case SettingsScreens.PrivacyGroupChatsAllowedContacts:
        case SettingsScreens.PrivacyGroupChatsDeniedContacts:
          openSettingsScreen({ screen: SettingsScreens.PrivacyGroupChats });
          return;
        case SettingsScreens.TwoFaNewPassword:
          openSettingsScreen({ screen: SettingsScreens.TwoFaDisabled });
          return;
        case SettingsScreens.TwoFaNewPasswordConfirm:
          openSettingsScreen({ screen: SettingsScreens.TwoFaNewPassword });
          return;
        case SettingsScreens.TwoFaNewPasswordHint:
          openSettingsScreen({ screen: SettingsScreens.TwoFaNewPasswordConfirm });
          return;
        case SettingsScreens.TwoFaNewPasswordEmail:
          openSettingsScreen({ screen: SettingsScreens.TwoFaNewPasswordHint });
          return;
        case SettingsScreens.TwoFaNewPasswordEmailCode:
          openSettingsScreen({ screen: SettingsScreens.TwoFaNewPasswordEmail });
          return;
        case SettingsScreens.TwoFaChangePasswordCurrent:
        case SettingsScreens.TwoFaTurnOff:
        case SettingsScreens.TwoFaRecoveryEmailCurrentPassword:
          openSettingsScreen({ screen: SettingsScreens.TwoFaEnabled });
          return;
        case SettingsScreens.TwoFaChangePasswordNew:
          openSettingsScreen({ screen: SettingsScreens.TwoFaChangePasswordCurrent });
          return;
        case SettingsScreens.TwoFaChangePasswordConfirm:
          openSettingsScreen({ screen: SettingsScreens.TwoFaChangePasswordNew });
          return;
        case SettingsScreens.TwoFaChangePasswordHint:
          openSettingsScreen({ screen: SettingsScreens.TwoFaChangePasswordConfirm });
          return;
        case SettingsScreens.TwoFaRecoveryEmail:
          openSettingsScreen({ screen: SettingsScreens.TwoFaRecoveryEmailCurrentPassword });
          return;
        case SettingsScreens.TwoFaRecoveryEmailCode:
          openSettingsScreen({ screen: SettingsScreens.TwoFaRecoveryEmail });
          return;

        case SettingsScreens.FoldersCreateFolder:
        case SettingsScreens.FoldersEditFolder:
          openSettingsScreen({ screen: SettingsScreens.Folders });
          return;

        case SettingsScreens.FoldersShare:
          openSettingsScreen({ screen: SettingsScreens.FoldersEditFolder });
          return;

        case SettingsScreens.FoldersIncludedChatsFromChatList:
        case SettingsScreens.FoldersExcludedChatsFromChatList:
          openSettingsScreen({ screen: SettingsScreens.FoldersEditFolderFromChatList });
          return;

        case SettingsScreens.FoldersEditFolderFromChatList:
        case SettingsScreens.FoldersEditFolderInvites:
          openLeftColumnContent({ contentKey: LeftColumnContent.ChatList });
          openSettingsScreen({ screen: SettingsScreens.Main });
          return;

        case SettingsScreens.QuickReaction:
        case SettingsScreens.CustomEmoji:
          openSettingsScreen({ screen: SettingsScreens.Stickers });
          return;

        case SettingsScreens.DoNotTranslate:
          openSettingsScreen({ screen: SettingsScreens.Language });
          return;

        case SettingsScreens.PrivacyNoPaidMessages:
          openSettingsScreen({ screen: SettingsScreens.PrivacyMessages });
          return;

        default:
          break;
      }
    }

    if (props.contentKey === LeftColumnContent.ChatList && props.isFirstChatFolderActive) {
      openLeftColumnContent({ contentKey: LeftColumnContent.GlobalSearch });

      return;
    }

    fullReset();
  };

  const handleSearchQuery = (query: string) => {
    if (props.contentKey === LeftColumnContent.Contacts) {
      setContactsFilter(query);
      return;
    }

    openLeftColumnContent({ contentKey: LeftColumnContent.GlobalSearch });

    if (query !== props.searchQuery) {
      setGlobalSearchQuery({ query });
    }
  };

  const handleTopicSearch = () => {
    openLeftColumnContent({ contentKey: LeftColumnContent.GlobalSearch });
    setGlobalSearchQuery({ query: '' });
    setGlobalSearchChatId({ id: props.forumPanelChatId });
  };

  createEffect(
    depsOf(
      () => [props.isFirstChatFolderActive, props.contentKey, props.isChatOpen, props.isChatListPanelOpen] as const,
    ),
    ([isFirstChatFolderActive2, contentKey2, isChatOpen2, isChatListPanelOpen2]) => {
      const isArchived = contentKey2 === LeftColumnContent.Archived;
      const isChatList = contentKey2 === LeftColumnContent.ChatList;
      const noChatOrPanelOpen = !isChatOpen2 && !isChatListPanelOpen2;
      // We listen for escape key only in these cases:
      // 1. When we are in archived chats and no chat or chat-list panel is open.
      // 2. When we are in any other screen except chat list and archived chat list.
      // 3. When we are in chat list and first chat folder is active and no chat or chat-list panel is open.
      if (
        (isArchived && noChatOrPanelOpen) ||
        (!isChatList && !isArchived) ||
        (isFirstChatFolderActive2 && noChatOrPanelOpen)
      ) {
        return captureEscKeyListener(() => {
          handleReset();
        });
      } else {
        return undefined;
      }
    },
  );

  const handleHotkeySearch = (e: KeyboardEvent) => {
    if (props.contentKey === LeftColumnContent.GlobalSearch) {
      return;
    }

    e.preventDefault();
    openLeftColumnContent({ contentKey: LeftColumnContent.GlobalSearch });
  };

  const handleHotkeySavedMessages = (e: KeyboardEvent) => {
    e.preventDefault();
    openChat({ id: props.currentUserId, shouldReplaceHistory: true });
  };

  const handleArchivedChats = (e: KeyboardEvent) => {
    e.preventDefault();
    openLeftColumnContent({ contentKey: LeftColumnContent.Archived });
  };

  const handleHotkeySettings = (e: KeyboardEvent) => {
    e.preventDefault();
    openLeftColumnContent({ contentKey: LeftColumnContent.Settings });
  };

  const handleQuickChatPicker = (e: KeyboardEvent) => {
    if (isComposerHasSelection()) return;

    e.preventDefault();
    openQuickChatPicker();
  };

  useHotkeys({
    'Mod+Shift+F': handleHotkeySearch,
    'Mod+K': handleQuickChatPicker,
    // https://support.mozilla.org/en-US/kb/take-screenshots-firefox
    ...(!IS_FIREFOX && {
      'Mod+Shift+S': handleHotkeySavedMessages,
    }),
    ...(IS_APP && {
      'Mod+0': handleHotkeySavedMessages,
      'Mod+9': handleArchivedChats,
    }),
    ...(IS_MAC_OS && IS_APP && { 'Mod+,': handleHotkeySettings }),
  });

  createEffect(
    () => props.settingsScreen,
    (settingsScreen2) => {
      clearTwoFaError();

      if (settingsScreen2 === SettingsScreens.Privacy) {
        loadPasswordInfo();
      }
    },
  );

  // Deviation: tt's `useSyncEffect` dispatched during render; an effect dispatches at the end of the tick.
  createEffect(
    () => props.nextFoldersAction,
    (nextFoldersAction2) => {
      if (nextFoldersAction2) {
        foldersDispatch(nextFoldersAction2);
      }
    },
  );

  // The settings screen of the previous change (tt: `usePrevious` in a state ref), kept by an effect so that the swipe's
  // `onCancel` handler reads it at event time.
  let prevSettingsScreen: SettingsScreens | -1 | undefined;
  let lastSettingsScreen: SettingsScreens | -1 | undefined;
  createEffect(
    () => (contentType() === ContentType.Settings ? props.settingsScreen : -1),
    (settingsScreen2) => {
      prevSettingsScreen = lastSettingsScreen;
      lastSettingsScreen = settingsScreen2;
    },
  );

  let leftColumnEl: HTMLDivElement | undefined;
  onMount(() => {
    if (!IS_TOUCH_ENV) {
      return undefined;
    }

    return captureControlledSwipe(leftColumnEl!, {
      excludedClosestSelector: '.ProfileInfo, .color-picker, .hue-picker, .TabList',
      selectorToPreventScroll: '#Settings .custom-scroll',
      onSwipeRightStart: handleReset,
      onCancel: () => {
        openLeftColumnContent({ contentKey: LeftColumnContent.Settings });
        openSettingsScreen({ screen: prevSettingsScreen as SettingsScreens });
      },
    });
  });

  function renderContent(slide: TransitionSlide) {
    const isActive = () => slide.isActive();
    switch (slide.key as ContentType) {
      case ContentType.Archived:
        return (
          <ArchivedChats
            isActive={isActive()}
            onReset={handleReset}
            onTopicSearch={handleTopicSearch}
            foldersDispatch={foldersDispatch}
            isForumPanelOpen={props.isForumPanelOpen}
            archiveSettings={props.archiveSettings}
            isStoryRibbonShown={props.isArchivedStoryRibbonShown}
          />
        );
      case ContentType.Settings:
        return (
          <Settings
            isActive={isActive()}
            currentScreen={props.settingsScreen}
            foldersState={foldersState()}
            foldersDispatch={foldersDispatch}
            animationLevel={props.animationLevel}
            shouldSkipTransition={props.shouldSkipHistoryAnimations}
            hasProfileBackground={props.hasProfileBackground}
            onReset={handleReset}
          />
        );
      case ContentType.NewChannel:
        return (
          // `key={lastResetTime}` of tt: a new `when` object remounts the screen after every reset.
          <Show when={{ resetTime: lastResetTime() }} keyed>
            {(_key) => (
              <NewChat
                isActive={isActive()}
                isChannel
                content={props.contentKey}
                animationLevel={props.animationLevel}
                onReset={handleReset}
              />
            )}
          </Show>
        );
      case ContentType.NewGroup:
        return (
          <Show when={{ resetTime: lastResetTime() }} keyed>
            {(_key) => (
              <NewChat
                isActive={isActive()}
                content={props.contentKey}
                animationLevel={props.animationLevel}
                onReset={handleReset}
              />
            )}
          </Show>
        );
      default:
        return (
          <LeftMain
            content={props.contentKey}
            isClosingSearch={props.isClosingSearch}
            searchQuery={props.searchQuery}
            searchDate={props.searchDate}
            contactsFilter={contactsFilter()}
            foldersDispatch={foldersDispatch}
            onSearchQuery={handleSearchQuery}
            onReset={handleReset}
            shouldSkipTransition={props.shouldSkipHistoryAnimations}
            isAppUpdateAvailable={props.isAppUpdateAvailable}
            isForumPanelOpen={props.isForumPanelOpen}
            onTopicSearch={handleTopicSearch}
            isAccountFrozen={props.isAccountFrozen}
            isFoldersSidebarShown={props.isFoldersSidebarShown}
          />
        );
    }
  }

  return (
    <Transition
      ref={(el) => {
        leftColumnEl = el;
        props.ref(el);
      }}
      name={resolveTransitionName('layers', props.animationLevel, props.shouldSkipHistoryAnimations)}
      renderCount={RENDER_COUNT}
      activeKey={contentType()}
      shouldCleanup
      cleanupExceptionKey={ContentType.Main}
      shouldWrap
      wrapExceptionKey={ContentType.Main}
      id="LeftColumn"
      withSwipeControl
    >
      {renderContent}
    </Transition>
  );
}

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  const tabState = selectTabState(global);
  const {
    globalSearch: { query, minDate },
    shouldSkipHistoryAnimations,
    activeChatFolder,
    leftColumn,
    nextFoldersAction,
    storyViewer: { isArchivedRibbonShown },
  } = tabState;
  const {
    currentUserId,
    passcode: { hasPasscode },
    isAppUpdateAvailable,
    archiveSettings,
  } = global;

  const { animationLevel } = selectSharedSettings(global);
  const currentChat = selectCurrentChat(global);
  const isChatOpen = Boolean(currentChat?.id);
  const isForumPanelOpen = selectIsForumPanelOpen(global);
  const isChatListPanelOpen = selectIsChatListPanelOpen(global);
  const forumPanelChatId = tabState.forumPanelChatId;
  const isAccountFrozen = selectIsCurrentUserFrozen(global);

  return {
    searchQuery: query,
    searchDate: minDate,
    isFirstChatFolderActive: activeChatFolder === 0,
    animationLevel,
    shouldSkipHistoryAnimations,
    currentUserId,
    hasPasscode,
    nextFoldersAction,
    isChatOpen,
    isAppUpdateAvailable,
    isForumPanelOpen,
    isChatListPanelOpen,
    forumPanelChatId,
    isClosingSearch: tabState.globalSearch.isClosing,
    archiveSettings,
    isArchivedStoryRibbonShown: isArchivedRibbonShown,
    isAccountFrozen,
    hasProfileBackground: currentUserId ? selectPeerHasProfileBackground(global, currentUserId) : undefined,
    contentKey: leftColumn.contentKey,
    settingsScreen: leftColumn.settingsScreen,
  };
};

export default LeftColumn;
