import { createEffect, createMemo } from 'frameact';
import { getActions, withGlobal } from '../../../global';
import { depsOf } from '../../../util/effectDeps';

import type { GlobalState } from '../../../global/types';
import type { ThemeKey } from '../../../types';
import { LeftColumnContent, SettingsScreens } from '../../../types';

import {
  selectCanSetPasscode,
  selectCurrentMessageList,
  selectIsCurrentUserPremium,
  selectIsForumPanelOpen,
  selectTabState,
  selectTheme,
} from '../../../global/selectors';
import { selectSharedSettings } from '../../../global/selectors/sharedState';
import { IS_TAURI } from '../../../util/browser/globalEnvironment';
import { IS_APP, IS_MAC_OS } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import captureEscKeyListener from '../../../util/captureEscKeyListener';
import { formatDateToString } from '../../../util/dates/oldDateFormat';

import useAppLayout from '../../../hooks/useAppLayout';
import useConnectionStatus from '../../../hooks/useConnectionStatus';
import { useHotkeys } from '../../../hooks/useHotkeys';
import useLang from '../../../hooks/useLang';
import useOldLang from '../../../hooks/useOldLang';

import Icon from '../../common/icons/Icon';
import MainMenuDropdown from '../../common/MainMenuDropdown';
import PeerChip from '../../common/PeerChip';
import StoryToggler from '../../story/StoryToggler';
import Button from '../../ui/Button';
import SearchInput from '../../ui/SearchInput';
import ShowTransition from '../../ui/ShowTransition';
import ConnectionStatusOverlay from '../ConnectionStatusOverlay';
import StatusButton from './StatusButton';

import './LeftMainHeader.scss';

type OwnProps = {
  shouldHideSearch?: boolean;
  content: LeftColumnContent;
  contactsFilter: string;
  isClosingSearch?: boolean;
  shouldSkipTransition?: boolean;
  isFoldersSidebarShown?: boolean;
  onSearchQuery: (query: string) => void;
  onReset: NoneToVoidFunction;
};

type StateProps = {
  searchQuery?: string;
  isLoading: boolean;
  globalSearchChatId?: string;
  searchDate?: number;
  theme: ThemeKey;
  isMessageListOpen: boolean;
  isCurrentUserPremium?: boolean;
  isConnectionStatusMinimized?: boolean;
  areChatsLoaded?: boolean;
  hasPasscode?: boolean;
  canSetPasscode?: boolean;
  isForumPanelOpen?: boolean;
} & Pick<GlobalState, 'connectionState' | 'isSyncing' | 'isFetchingDifference'>;

const CLEAR_DATE_SEARCH_PARAM = { date: undefined };
const CLEAR_CHAT_SEARCH_PARAM = { id: undefined };

const IS_WITH_WINDOW_BUTTONS = IS_TAURI && IS_MAC_OS;

const LeftMainHeader = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const {
    setGlobalSearchDate,
    setSharedSettingOption,
    setGlobalSearchChatId,
    lockScreen,
    openSettingsScreen,
    searchMessagesGlobal,
    closeForumPanel,
  } = getActions();

  const oldLang = useOldLang();
  const lang = useLang();
  const { isMobile } = useAppLayout();

  const areContactsVisible = createMemo(() => props.content === LeftColumnContent.Contacts);
  const hasMenu = createMemo(() => props.content === LeftColumnContent.ChatList);

  const isSearchButton = createMemo(
    () => props.isForumPanelOpen && props.isFoldersSidebarShown && !IS_WITH_WINDOW_BUTTONS,
  );

  const selectedSearchDate = createMemo(() => {
    return props.searchDate ? formatDateToString(new Date(props.searchDate * 1000)) : undefined;
  });

  const connectionStatusResult = createMemo(() =>
    useConnectionStatus(
      lang,
      () => props.connectionState,
      () => props.isSyncing || props.isFetchingDifference,
      () => props.isMessageListOpen,
      () => props.isConnectionStatusMinimized,
      () => !props.areChatsLoaded,
    ),
  );
  const connectionStatus = () => connectionStatusResult().connectionStatus;
  const connectionStatusText = () => connectionStatusResult().connectionStatusText;
  const connectionStatusPosition = () => connectionStatusResult().connectionStatusPosition;

  const handleLockScreenHotkey = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (props.hasPasscode) {
      lockScreen();
    } else {
      openSettingsScreen({ screen: SettingsScreens.PasscodeDisabled });
    }
  };

  const handleForumSearchClick = () => {
    closeForumPanel();
  };

  useHotkeys(() =>
    createMemo(() =>
      props.canSetPasscode
        ? {
            'Ctrl+Shift+L': handleLockScreenHotkey,
            'Alt+Shift+L': handleLockScreenHotkey,
            'Meta+Shift+L': handleLockScreenHotkey,
            ...(IS_APP && { 'Mod+L': handleLockScreenHotkey }),
          }
        : undefined,
    ),
  );

  const MainButton: FC<{ onTrigger: () => void; isOpen?: boolean }> = createMemo(() => {
    return ({ onTrigger, isOpen }) => (
      <Button
        round
        ripple={hasMenu() && !isMobile}
        size="smaller"
        color="translucent"
        className={buildClassName(isOpen && 'active')}

        onClick={isSearchButton() ? handleForumSearchClick : hasMenu() ? onTrigger : () => props.onReset()}
        ariaLabel={hasMenu() ? lang('AriaLabelOpenMenu') : lang('AriaLabelBackChatList')}
      >
        {isSearchButton() ? (
          <Icon name="search" />
        ) : (
          <div
            class={buildClassName(
              'animated-menu-icon',
              !hasMenu() && 'state-back',
              props.shouldSkipTransition && 'no-animation',
            )}
          />
        )}
      </Button>
    );
  });

  const handleSearchFocus = () => {
    if (!props.searchQuery) {
      props.onSearchQuery('');
    }
  };

  const toggleConnectionStatus = () => {
    setSharedSettingOption({ isConnectionStatusMinimized: !props.isConnectionStatusMinimized });
  };

  const handleLockScreen = () => {
    lockScreen();
  };

  const handleSearchEnter = () => {
    if (props.searchQuery && props.content === LeftColumnContent.GlobalSearch) {
      searchMessagesGlobal({
        type: 'publicPosts',
        shouldResetResultsByType: true,
      });
    }
  };

  const isSearchRelevant = createMemo(
    () =>
      Boolean(props.globalSearchChatId) ||
      props.content === LeftColumnContent.GlobalSearch ||
      props.content === LeftColumnContent.Contacts,
  );

  const isSearchFocused = createMemo(() =>
    isMobile ? !props.isMessageListOpen && isSearchRelevant() : isSearchRelevant(),
  );

  createEffect(
    depsOf(() => [isSearchFocused(), props.onReset] as const),
    ([isSearchFocused2, onReset2]) => (isSearchFocused2 ? captureEscKeyListener(() => onReset2()) : undefined),
  );

  const searchInputPlaceholder = createMemo(() =>
    props.content === LeftColumnContent.Contacts ? lang('SearchFriends') : lang('Search'),
  );

  const withStoryToggler = createMemo(
    () => !isSearchFocused() && !selectedSearchDate() && !props.globalSearchChatId && !areContactsVisible(),
  );

  const searchContent = createMemo(() => {
    return (
      <>
        {selectedSearchDate() && (
          <PeerChip
            icon="calendar"
            title={selectedSearchDate()}
            canClose
            isMinimized={Boolean(props.globalSearchChatId)}
            className="left-search-picker-item"
            onClick={setGlobalSearchDate}
            isCloseNonDestructive
            clickArg={CLEAR_DATE_SEARCH_PARAM}
          />
        )}
        {props.globalSearchChatId && (
          <PeerChip
            className="left-search-picker-item"
            peerId={props.globalSearchChatId}
            onClick={setGlobalSearchChatId}
            canClose
            isMinimized
            clickArg={CLEAR_CHAT_SEARCH_PARAM}
          />
        )}
      </>
    );
  });

  return (
    <div class="LeftMainHeader">
      <div id="LeftMainHeader" class="left-header" data-tauri-drag-region={IS_WITH_WINDOW_BUTTONS ? true : undefined}>
        {lang.isRtl && <div class="DropdownMenuFiller" />}
        <MainMenuDropdown
          trigger={MainButton()}
          className={buildClassName(
            hasMenu() &&
              props.isFoldersSidebarShown &&
              !IS_WITH_WINDOW_BUTTONS &&
              !isSearchButton() &&
              'hide-menu-button',
            isSearchButton() && 'forum-search-button',
          )}
        />
        <SearchInput
          inputId="telegram-search-input"
          resultsItemSelector=".LeftSearch .ListItem-button"
          className={buildClassName(
            props.globalSearchChatId || props.searchDate ? 'with-picker-item' : undefined,
            props.shouldHideSearch && 'SearchInput--hidden',
            hasMenu() && props.isFoldersSidebarShown && !IS_WITH_WINDOW_BUTTONS && 'SearchInput--no-left-margin',
          )}
          value={props.isClosingSearch ? undefined : props.contactsFilter || props.searchQuery}
          focused={isSearchFocused()}
          isLoading={props.isLoading || connectionStatusPosition() === 'minimized'}
          spinnerColor={connectionStatusPosition() === 'minimized' ? 'yellow' : undefined}
          spinnerBackgroundColor={
            connectionStatusPosition() === 'minimized' && props.theme === 'light' ? 'light' : undefined
          }
          placeholder={searchInputPlaceholder()}
          autoComplete="off"
          canClose={Boolean(props.globalSearchChatId || props.searchDate)}
          onChange={props.onSearchQuery}
          onReset={props.onReset}
          onFocus={handleSearchFocus}
          onSpinnerClick={connectionStatusPosition() === 'minimized' ? toggleConnectionStatus : undefined}
          onEnter={handleSearchEnter}
        >
          {searchContent()}
          <StoryToggler canShow={withStoryToggler()} />
        </SearchInput>
        {props.isCurrentUserPremium && <StatusButton />}
        {props.hasPasscode && (
          <Button
            round
            ripple={!isMobile}
            size="smaller"
            color="translucent"
            ariaLabel={`${oldLang('ShortcutsController.Others.LockByPasscode')} (Ctrl+Shift+L)`}
            onClick={handleLockScreen}
            className={buildClassName(!props.isCurrentUserPremium && 'extra-spacing')}
            iconName="unlock"
          />
        )}
        <ShowTransition isOpen={connectionStatusPosition() === 'overlay'} isCustom className="connection-state-wrapper">
          <ConnectionStatusOverlay
            connectionStatus={connectionStatus()}
            connectionStatusText={connectionStatusText()!}
            onClick={toggleConnectionStatus}
          />
        </ShowTransition>
      </div>
    </div>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  const tabState = selectTabState(global);
  const { query: searchQuery, fetchingStatus, chatId, minDate } = tabState.globalSearch;
  const { connectionState, isSyncing, isFetchingDifference } = global;
  const { isConnectionStatusMinimized } = selectSharedSettings(global);
  const isForumPanelOpen = selectIsForumPanelOpen(global);

  return {
    searchQuery,
    isLoading: fetchingStatus
      ? Boolean(fetchingStatus.chats || fetchingStatus.messages || fetchingStatus.publicPosts)
      : false,
    globalSearchChatId: chatId,
    searchDate: minDate,
    theme: selectTheme(global),
    connectionState,
    isSyncing,
    isFetchingDifference,
    isMessageListOpen: Boolean(selectCurrentMessageList(global)),
    isConnectionStatusMinimized,
    isCurrentUserPremium: selectIsCurrentUserPremium(global),
    areChatsLoaded: Boolean(global.chats.listIds.active),
    hasPasscode: Boolean(global.passcode.hasPasscode),
    canSetPasscode: selectCanSetPasscode(global),
    isForumPanelOpen,
  };
};

export default LeftMainHeader;
