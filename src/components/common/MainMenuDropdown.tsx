import type { JSX } from 'frameact/jsx-runtime';
import { APP_REVISION } from 'virtual:git-info';
import { getActions, getGlobal } from '../../global';

import type { TabState } from '../../global/types';
import { LeftColumnContent, SettingsScreens } from '../../types';

import { APP_NAME, DEBUG, IS_BETA } from '../../config';
import { selectTabState } from '../../global/selectors';
import { IS_VIEW_TRANSITION_SUPPORTED } from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';

import useFlag from '../../hooks/useFlag';
import useLang from '../../hooks/useLang';
import useLeftHeaderButtonRtlForumTransition from '../left/main/hooks/useLeftHeaderButtonRtlForumTransition';

import LeftSideMenuItems from '../left/main/LeftSideMenuItems';
import DropdownMenu from '../ui/DropdownMenu';

type OwnProps = {
  trigger?: (props: { onTrigger: () => void; isOpen?: boolean }) => JSX.Element;
  shouldHideSearch?: boolean;
  className?: string;
};

const LeftSideMenuDropdown = (props: OwnProps) => {
  const { openLeftColumnContent, closeForumPanel, closeCommunityPanel, openSettingsScreen, setIsUiReady } =
    getActions();
  let pendingAccountSwitchRef: VoidFunction | undefined;
  let isSwitchingAccountRef = false;
  const [isBotMenuOpen, markBotMenuOpen, unmarkBotMenuOpen] = useFlag();
  const [isSwitchingAccount, markSwitchingAccount, unmarkSwitchingAccount] = useFlag();
  const lang = useLang();

  const versionString = IS_BETA ? `${APP_VERSION} Beta (${APP_REVISION})` : DEBUG ? APP_REVISION : APP_VERSION;

  // Disable dropdown menu RTL animation for resize
  const { shouldDisableDropdownMenuTransition, handleDropdownMenuTransitionEnd } =
    useLeftHeaderButtonRtlForumTransition(() => props.shouldHideSearch);

  const handleSelectSettings = () => {
    openSettingsScreen({ screen: SettingsScreens.Main });
  };

  const handleSelectContacts = () => {
    openLeftColumnContent({ contentKey: LeftColumnContent.Contacts });
  };

  const handleSelectArchived = () => {
    openLeftColumnContent({ contentKey: LeftColumnContent.Archived });
    closeForumPanel();
    closeCommunityPanel();
  };

  const handleSwitchAccount = (url: string) => {
    if (isSwitchingAccountRef) return;

    // Only mask the UI when canceled navigation can restore it
    if (!window.navigation) {
      window.location.replace(url);
      return;
    }

    const { uiReadyState } = selectTabState(getGlobal());
    // Lock before rendering so rapid selections cannot capture the masked UI state
    isSwitchingAccountRef = true;
    setIsUiReady({ uiReadyState: 0 });
    if (IS_VIEW_TRANSITION_SUPPORTED && 'onpagereveal' in window) {
      // The view transition captures the open menu and owns its closing animation
      markSwitchingAccount();
      navigateToAccount(url, uiReadyState);
    } else {
      pendingAccountSwitchRef = () => navigateToAccount(url, uiReadyState);
    }
  };

  const handleMenuHide = () => {
    const pendingAccountSwitch = pendingAccountSwitchRef;
    if (!pendingAccountSwitch) return;

    pendingAccountSwitchRef = undefined;
    pendingAccountSwitch();
  };

  function navigateToAccount(url: string, uiReadyState: TabState['uiReadyState']) {
    window.addEventListener('pageshow', handlePageShow);

    try {
      // Account navigation replaces the menu's temporary history entry
      const { committed, finished } = window.navigation.navigate(url, { history: 'replace' });
      // Cross-document navigation settles in this document only when canceled
      Promise.all([committed, finished]).catch(restoreUi);
    } catch {
      restoreUi();
    }

    function handlePageShow(e: PageTransitionEvent) {
      if (!e.persisted) return;

      // Cross-document navigation promises remain pending when this page returns from BFCache
      restoreUi();
    }

    function restoreUi() {
      window.removeEventListener('pageshow', handlePageShow);
      setIsUiReady({ uiReadyState });
      isSwitchingAccountRef = false;
      unmarkSwitchingAccount();
    }
  }

  return (
    <DropdownMenu
      trigger={props.trigger}
      className={buildClassName(
        'main-menu',
        lang.isRtl && 'rtl',
        props.shouldHideSearch && lang.isRtl && 'right-aligned',
        shouldDisableDropdownMenuTransition() && lang.isRtl && 'disable-transition',
        props.className,
      )}
      forceOpen={isBotMenuOpen() || isSwitchingAccount()}
      positionX={props.shouldHideSearch && lang.isRtl ? 'right' : 'left'}
      transformOriginX={90}
      transformOriginY={100}
      withPortal
      onHide={handleMenuHide}
      onTransitionEnd={lang.isRtl ? handleDropdownMenuTransitionEnd : undefined}
    >
      <LeftSideMenuItems
        onSelectArchived={handleSelectArchived}
        onSelectContacts={handleSelectContacts}
        onSelectSettings={handleSelectSettings}
        onBotMenuOpened={markBotMenuOpen}
        onBotMenuClosed={unmarkBotMenuOpen}
        onSwitchAccount={handleSwitchAccount}
        footer={`${APP_NAME} ${versionString}`}
      />
    </DropdownMenu>
  );
};

export default LeftSideMenuDropdown;
