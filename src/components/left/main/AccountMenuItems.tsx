import { createMemo } from 'frameact';
import { For } from 'frameact/dom';
import { getActions } from '../../../global';

import type { ApiUser } from '../../../api/types';
import type { AccountInfo, CustomPeer } from '../../../types';

import { temporarilySuspendCacheUpdate } from '../../../global/cache';
import { getCurrentMaxAccountCount, getCurrentProdAccountCount } from '../../../global/helpers';
import { IS_SAFARI } from '../../../util/browser/windowEnvironment';
import { getAccountSlotUrl } from '../../../util/multiaccount';
import { REM } from '../../common/helpers/mediaDimensions';

import useLang from '../../../hooks/useLang';
import useMultiaccountInfo from '../../../hooks/useMultiaccountInfo';

import Avatar from '../../common/Avatar';
import FullNameTitle from '../../common/FullNameTitle';
import MenuItem from '../../ui/MenuItem';
import MenuSeparator from '../../ui/MenuSeparator';

type OwnProps = {
  currentUser: ApiUser;
  totalLimit: number;
  onSelectCurrent?: VoidFunction;
  onSwitchAccount: (url: string) => void;
};

const NOTIFICATION_DURATION = 7000;

const AccountMenuItems = (props: OwnProps) => {
  const { showNotification } = getActions();
  const lang = useLang();
  const accounts = useMultiaccountInfo(() => props.currentUser);

  // Deviation: tt read these on every render, which followed the `accounts` refreshes; here they re-read with them.
  const currentCount = createMemo(() => {
    accounts();
    return getCurrentProdAccountCount();
  });
  const maxCount = createMemo(() => {
    accounts();
    return getCurrentMaxAccountCount();
  });

  const currentAccountInfo = createMemo(() => {
    return Object.values(accounts()).find((account) => account.userId === props.currentUser.id);
  });

  const shouldShowLimit = () => currentCount() >= maxCount();

  const handleAccountClick = (account: AccountInfo, e: React.SyntheticEvent<HTMLElement>) => {
    if (account.userId === props.currentUser.id) {
      props.onSelectCurrent?.();
      return;
    }

    handleAccountNavigation(e);
  };

  const handleNewAccountClick = (e: React.SyntheticEvent<HTMLElement>) => {
    if (shouldShowLimit()) {
      showNotification({
        title: lang('PremiumLimitAccountsTitle'),
        message: props.currentUser.isPremium ? lang('PremiumLimitAccounts') : lang('PremiumLimitAccountsNoPremium'),
        duration: NOTIFICATION_DURATION,
      });
      return;
    }

    handleAccountNavigation(e);
  };

  function handleAccountNavigation(e: React.SyntheticEvent<HTMLElement>) {
    if (
      !(e instanceof MouseEvent) ||
      e.button !== 0 ||
      e.ctrlKey ||
      e.metaKey ||
      e.shiftKey ||
      e.altKey ||
      !(e.currentTarget instanceof HTMLAnchorElement)
    ) {
      return;
    }

    e.preventDefault();
    // IDB locks up if we write large payload on navigation
    if (IS_SAFARI) temporarilySuspendCacheUpdate();
    props.onSwitchAccount(e.currentTarget.href);
  }

  const newAccountUrl = createMemo(() => {
    if (!Object.values(accounts()).length) {
      return undefined;
    }

    if (currentCount() === props.totalLimit) {
      return undefined;
    }

    let freeIndex = 1;
    while (accounts()[freeIndex]) {
      freeIndex += 1;
    }

    return getAccountSlotUrl(freeIndex, true);
  });

  const sortedAccounts = createMemo(() =>
    Object.entries(accounts() || {}).sort(([, account]) => (account.userId === props.currentUser.id ? -1 : 1)),
  );

  return (
    <>
      <For each={sortedAccounts()} keyed={([slot]) => slot}>
        {(entry) => {
          const mockUser = createMemo((): CustomPeer => {
            const account = entry()[1];
            const isSameServer = account.isTest === currentAccountInfo()?.isTest;

            return {
              title: [account.firstName, account.lastName].filter(Boolean).join(' '),
              isCustomPeer: true,
              peerColorId: account.color,
              emojiStatusId: isSameServer ? account.emojiStatusId : undefined,
              isPremium: account.isPremium,
            };
          });

          const hasSeparator = () =>
            entry()[1].userId === props.currentUser.id && (newAccountUrl() || sortedAccounts().length > 1);

          return (
            <>
              <MenuItem
                className="account-menu-item"
                customIcon={
                  <Avatar size="mini" className="account-avatar" peer={mockUser()} previewUrl={entry()[1].avatarUri} />
                }
                onClick={(e) => handleAccountClick(entry()[1], e)}
                href={entry()[1].userId !== props.currentUser.id ? getAccountSlotUrl(Number(entry()[0])) : undefined}
              >
                {entry()[1].isTest && <span class="account-menu-item-test">T</span>}
                <FullNameTitle peer={mockUser()} withEmojiStatus emojiStatusSize={REM} />
              </MenuItem>
              {hasSeparator() && <MenuSeparator />}
            </>
          );
        }}
      </For>
      {newAccountUrl() && (
        <MenuItem
          icon="add"
          rel="noopener" // Allow referrer to be passed
          href={!shouldShowLimit() ? newAccountUrl() : undefined}
          onClick={handleNewAccountClick}
        >
          {lang('MenuAddAccount')}
        </MenuItem>
      )}
    </>
  );
};

export default AccountMenuItems;
