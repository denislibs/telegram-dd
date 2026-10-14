import { createMemo } from 'frameact';
import { getActions, withGlobal } from '../../../global';

import type { ApiUser } from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { AnimationLevel, ThemeKey } from '../../../types';
import { SettingsScreens } from '../../../types';

import {
  ANIMATION_LEVEL_MAX,
  ANIMATION_LEVEL_MIN,
  ARCHIVED_FOLDER_ID,
  BETA_CHANGELOG_URL,
  FEEDBACK_URL,
  IS_BETA,
  IS_TEST,
  PRODUCTION_HOSTNAME,
  WEB_VERSION_BASE,
} from '../../../config';
import {
  INITIAL_PERFORMANCE_STATE_MAX,
  INITIAL_PERFORMANCE_STATE_MED,
  INITIAL_PERFORMANCE_STATE_MIN,
} from '../../../global/initialState';
import { selectTabState, selectTheme, selectUser, selectWalletBotId } from '../../../global/selectors';
import { selectPremiumLimit } from '../../../global/selectors/limits';
import { selectSharedSettings } from '../../../global/selectors/sharedState';
import { IS_MULTIACCOUNT_SUPPORTED, IS_TAURI } from '../../../util/browser/globalEnvironment';
import { getPromptInstall } from '../../../util/installPrompt';
import { switchPermanentWebVersion } from '../../../util/permanentWebVersion';
import { getSystemTheme } from '../../../util/systemTheme';

import useFlag from '../../../hooks/useFlag';
import { useFolderManagerForUnreadCounters } from '../../../hooks/useFolderManager';
import useLang from '../../../hooks/useLang';

import AttachBotItem from '../../middle/composer/AttachBotItem';
import ConfirmDialog from '../../ui/ConfirmDialog';
import MenuItem from '../../ui/MenuItem';
import MenuSeparator from '../../ui/MenuSeparator';
import NestedMenuItem from '../../ui/NestedMenuItem';
import Switcher from '../../ui/Switcher';
import Toggle from '../../ui/Toggle';
import AccountMenuItems from './AccountMenuItems';

type OwnProps = {
  onSelectSettings: NoneToVoidFunction;
  onSelectContacts: NoneToVoidFunction;
  onSelectArchived: NoneToVoidFunction;
  onBotMenuOpened: NoneToVoidFunction;
  onBotMenuClosed: NoneToVoidFunction;
  onSwitchAccount: (url: string) => void;
  footer?: string;
};

type StateProps = {
  animationLevel: AnimationLevel;
  currentUser?: ApiUser;
  theme: ThemeKey;
  canInstall?: boolean;
  attachBots: GlobalState['attachMenu']['bots'];
  accountsTotalLimit: number;
  hasPasscode?: boolean;
  isWalletAvailable?: boolean;
  walletBotId?: string;
} & Pick<GlobalState, 'currentUserId' | 'archiveSettings'>;

const LeftSideMenuItems = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const {
    openChat,
    setSharedSettingOption,
    updatePerformanceSettings,
    openChatByUsername,
    openUrl,
    openChatWithInfo,
    openSettingsScreen,
    openWalletModal,
  } = getActions();
  const lang = useLang();
  const [isSwitchToWebKDialogOpen, openSwitchToWebKDialog, closeSwitchToWebKDialog] = useFlag();

  const animationLevelValue = createMemo(() =>
    props.animationLevel !== ANIMATION_LEVEL_MIN
      ? props.animationLevel === ANIMATION_LEVEL_MAX
        ? 'max'
        : 'mid'
      : 'min',
  );

  const withOtherVersions = !IS_TAURI && (window.location.hostname === PRODUCTION_HOSTNAME || IS_TEST);

  const archivedUnreadChatsCount = useFolderManagerForUnreadCounters()[ARCHIVED_FOLDER_ID]?.chatsCount || 0;

  // TODO(codemod): dependency on a container (attachBots) keeps its identity while its content changes: the memo must read the fields it needs (store contract §12.7)
  const bots = createMemo(() =>
    Object.values(props.attachBots).filter(
      (bot) => bot.isForSideMenu && !(props.isWalletAvailable && bot.id === props.walletBotId),
    ),
  );

  const handleOpenWallet = () => {
    openWalletModal();
  };

  const handleSelectMyProfile = () => {
    openChatWithInfo({ id: props.currentUserId, shouldReplaceHistory: true, isOwnProfile: true });
  };

  const handleSelectSaved = () => {
    openChat({ id: props.currentUserId, shouldReplaceHistory: true });
  };

  const handleDarkModeToggle = (e: React.SyntheticEvent<HTMLElement>) => {
    e.stopPropagation();
    const newTheme = props.theme === 'light' ? 'dark' : 'light';
    const shouldUseSystemTheme = newTheme === getSystemTheme();

    setSharedSettingOption({ theme: newTheme });
    setSharedSettingOption({ shouldUseSystemTheme });
  };

  const handleAnimationLevelChange = (e: React.SyntheticEvent<HTMLElement>) => {
    e.stopPropagation();

    let newLevel = props.animationLevel + 1;
    if (newLevel > ANIMATION_LEVEL_MAX) {
      newLevel = ANIMATION_LEVEL_MIN;
    }
    const performanceSettings =
      newLevel === ANIMATION_LEVEL_MIN
        ? INITIAL_PERFORMANCE_STATE_MIN
        : newLevel === ANIMATION_LEVEL_MAX
          ? INITIAL_PERFORMANCE_STATE_MAX
          : INITIAL_PERFORMANCE_STATE_MED;

    setSharedSettingOption({ animationLevel: newLevel as AnimationLevel, wasAnimationLevelSetManually: true });
    updatePerformanceSettings(performanceSettings);
  };

  const handleChangelogClick = () => {
    window.open(BETA_CHANGELOG_URL, '_blank', 'noopener,noreferrer');
  };

  const handleSwitchToWebK = (e: React.SyntheticEvent<HTMLElement>) => {
    e.preventDefault();
    if (props.hasPasscode) {
      openSwitchToWebKDialog();
      return;
    }

    switchPermanentWebVersion('K');
  };

  const handleOpenPasscodeSettings = () => {
    closeSwitchToWebKDialog();
    openSettingsScreen({ screen: SettingsScreens.PasscodeTurnOff });
  };

  const handleOpenTipsChat = () => {
    openChatByUsername({ username: lang('TelegramFeaturesUsername') });
  };

  const handleBugReportClick = () => {
    openUrl({ url: FEEDBACK_URL });
  };

  return (
    <>
      {IS_MULTIACCOUNT_SUPPORTED && props.currentUser && (
        <>
          <AccountMenuItems
            currentUser={props.currentUser}
            totalLimit={props.accountsTotalLimit}
            onSelectCurrent={props.onSelectSettings}
            onSwitchAccount={props.onSwitchAccount}
          />
          <MenuSeparator />
        </>
      )}
      <MenuItem icon="user" onClick={handleSelectMyProfile}>
        {lang('MenuMyProfile')}
      </MenuItem>
      <MenuItem icon="saved-messages" onClick={handleSelectSaved}>
        {lang('MenuSavedMessages')}
      </MenuItem>
      {props.archiveSettings.isHidden && (
        <MenuItem icon="archive" onClick={props.onSelectArchived}>
          <span class="menu-item-name">{lang('MenuArchivedChats')}</span>
          {archivedUnreadChatsCount > 0 && <div class="right-badge">{archivedUnreadChatsCount}</div>}
        </MenuItem>
      )}
      <MenuItem icon="group" onClick={props.onSelectContacts}>
        {lang('MenuContacts')}
      </MenuItem>
      {props.isWalletAvailable && (
        <MenuItem icon="gram-outline" onClick={handleOpenWallet}>
          {lang('WalletMenuItem')}
        </MenuItem>
      )}
      {bots().map((bot) => (
        <AttachBotItem
          bot={bot}
          theme={props.theme}
          isInSideMenu
          canShowNew
          onMenuOpened={props.onBotMenuOpened}
          onMenuClosed={props.onBotMenuClosed}
        />
      ))}
      <MenuItem icon="settings" onClick={props.onSelectSettings}>
        {lang('MenuSettings')}
      </MenuItem>
      <NestedMenuItem
        icon="more"
        footer={props.footer}
        submenu={
          <>
            <MenuItem icon="darkmode" onClick={handleDarkModeToggle}>
              <span class="menu-item-name">{lang('MenuNightMode')}</span>
              <Switcher
                id="darkmode"
                label={lang(props.theme === 'dark' ? 'AriaMenuDisableNightMode' : 'AriaMenuEnableNightMode')}
                checked={props.theme === 'dark'}
                noAnimation
              />
            </MenuItem>
            <MenuItem icon="animations" onClick={handleAnimationLevelChange}>
              <span class="menu-item-name capitalize">{lang('MenuUIFeaturesSwitch')}</span>
              <Toggle value={animationLevelValue()} />
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon="help" onClick={handleOpenTipsChat}>
              {lang('MenuTelegramFeatures')}
            </MenuItem>
            <MenuItem icon="bug" onClick={handleBugReportClick}>
              {lang('MenuReportBug')}
            </MenuItem>
            {IS_BETA && (
              <MenuItem icon="permissions" onClick={handleChangelogClick}>
                {lang('MenuBetaChangelog')}
              </MenuItem>
            )}
            {withOtherVersions && (
              <MenuItem icon="K" isCharIcon href={`${WEB_VERSION_BASE}k`} onClick={handleSwitchToWebK}>
                {lang('MenuSwitchToK')}
              </MenuItem>
            )}
            {props.canInstall && (
              <MenuItem icon="install" onClick={getPromptInstall()}>
                {lang('MenuInstallApp')}
              </MenuItem>
            )}
          </>
        }
      >
        {lang('MenuMore')}
      </NestedMenuItem>
      <ConfirmDialog
        isOpen={isSwitchToWebKDialogOpen()}
        title={lang('MenuSwitchToK')}
        text={lang('PasscodeSwitchToKInfo')}
        confirmLabel={lang('Continue')}
        confirmHandler={handleOpenPasscodeSettings}
        onClose={closeSwitchToWebKDialog}
      />
    </>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  const tabState = selectTabState(global);
  const { currentUserId, archiveSettings } = global;
  const { animationLevel } = selectSharedSettings(global);
  const attachBots = global.attachMenu.bots;

  return {
    currentUserId,
    currentUser: selectUser(global, currentUserId!),
    theme: selectTheme(global),
    animationLevel,
    canInstall: Boolean(tabState.canInstall),
    archiveSettings,
    attachBots,
    walletBotId: selectWalletBotId(global),
    accountsTotalLimit: selectPremiumLimit(global, 'moreAccounts'),
    hasPasscode: global.passcode.hasPasscode,
    isWalletAvailable: Boolean(global.appConfig.isWalletAvailable),
  };
};

export default LeftSideMenuItems;
