import { createEffect, createMemo } from 'frameact';
import type { JSX } from 'frameact/jsx-runtime';
import { getActions, getGlobal, getPromiseActions } from '../../global';
import { depsOf } from '../../util/effectDeps';

import type { GlobalState } from '../../global/types';
import { ApiMessageEntityTypes } from '../../api/types';

import { toNonBounceableAddress } from '../../lib/ton/address';
import { getUserFullName } from '../../global/helpers';
import { selectIsWalletAvailable, selectTonExplorerUrl, selectWalletAddressOwner } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import { copyTextToClipboard } from '../../util/clipboard';
import { parseTonTransferAddress } from '../../util/tonAddress';

import useSelector from '../../hooks/data/useSelector';
import useContextMenuHandlers from '../../hooks/useContextMenuHandlers';
import useFlag from '../../hooks/useFlag';
import useLang from '../../hooks/useLang';

import Menu from '../ui/Menu';
import MenuItem, { MenuItemSubtitle, MenuItemTitle } from '../ui/MenuItem';
import MenuSeparator from '../ui/MenuSeparator';
import Skeleton from '../ui/placeholder/Skeleton';
import Avatar, { AVATAR_SIZES } from './Avatar';

import styles from './TonAddressLink.module.scss';

type OwnProps = {
  address: string;
  noCopy?: boolean;
  children?: JSX.Element;
};

// Under the line heights of the title and the subtitle, so the skeleton does not make the item taller
const NAME_SKELETON_WIDTH = 80;
const NAME_SKELETON_HEIGHT = 12;
const LINK_SKELETON_WIDTH = 64;
const LINK_SKELETON_HEIGHT = 10;

const TonAddressLink = (props: OwnProps) => {
  const { showNotification, openWalletTransferLink, openUrl, openChatWithInfo } = getActions();
  const lang = useLang();

  let ref!: HTMLAnchorElement;
  let menuRef!: HTMLDivElement;

  const [isOwnerLookupDone, markOwnerLookupDone, unmarkOwnerLookupDone] = useFlag();

  const nonBounceableAddress = createMemo(() => {
    return parseTonTransferAddress(props.address) ? toNonBounceableAddress(props.address) : undefined;
  });

  const isWalletAvailable = useSelector(selectIsWalletAvailable);
  const ownerSelector = (global: GlobalState) => {
      return nonBounceableAddress() ? selectWalletAddressOwner(global, nonBounceableAddress()) : undefined;
    };
  const owner = useSelector(ownerSelector);
  const ownerUser = createMemo(() => owner() || undefined);

  // In a protected chat an address the wallet cannot take leaves no items; the last flag stops a long tap here
  const contextMenuHandlersResult = createMemo(() => useContextMenuHandlers(() => ref, () => props.noCopy && !nonBounceableAddress(), undefined, undefined, undefined, true));
  const isContextMenuOpen = () => contextMenuHandlersResult().isContextMenuOpen;
  const contextMenuAnchor = () => contextMenuHandlersResult().contextMenuAnchor;
  const handleContextMenu = () => contextMenuHandlersResult().handleContextMenu;
  const handleContextMenuClose = () => contextMenuHandlersResult().handleContextMenuClose;
  const handleContextMenuHide = () => contextMenuHandlersResult().handleContextMenuHide;

  createEffect(depsOf(() => [isContextMenuOpen(), nonBounceableAddress(), owner()] as const), ([isContextMenuOpen2, nonBounceableAddress2, owner2]) => {
    if (!isContextMenuOpen2 || !nonBounceableAddress2 || owner2 !== undefined) return undefined;

    let isCancelled = false;

    getPromiseActions()
      .loadWalletUserAddresses({ addresses: [nonBounceableAddress2] })
      .then(() => {
        // `owner` catches up with the global only at the end of the tick, so only a lookup that stored nothing is marked
        if (!isCancelled && selectWalletAddressOwner(getGlobal(), nonBounceableAddress2) === undefined) {
          markOwnerLookupDone();
        }
      });

    return () => {
      isCancelled = true;
    };
  });

  const getTriggerElement = () => ref;
  const getRootElement = () => document.body;
  const getMenuElement = () => menuRef;
  const getLayout = () => ({ withPortal: true });

  const handleMenuHide = () => {
    handleContextMenuHide()();
    unmarkOwnerLookupDone();
  };

  const handleSendMoney = () => {
    openWalletTransferLink({ to: props.address });
  };

  const handleCopy = () => {
    copyTextToClipboard(props.address);
    showNotification({ message: { key: 'WalletAddressCopied' } });
  };

  // A URL from the app config needs no open-link prompt, as for gift links
  const handleOpenInExplorer = () => {
    openUrl({ url: `${selectTonExplorerUrl(getGlobal())}${encodeURIComponent(props.address)}`, shouldSkipModal: true });
  };

  const handleOpenProfile = () => {
    openChatWithInfo({ id: ownerUser()!.id });
  };

  const isOwnerMissing = createMemo(() => !ownerUser() && (owner() === false || isOwnerLookupDone()));

  // One item serves all three states, so the open menu keeps its size
  function renderOwnerRow() {
    const warning = (
      <div class={buildClassName(styles.noAccount, isOwnerMissing() ? styles.appear : styles.invisible)}>
        {lang('WalletAddressNoLinkedAccount', undefined, { withNodes: true, renderTextFilters: ['br'] })}
      </div>
    );

    if (ownerUser()) {
      return (
        <MenuItem
          className={styles.appear}
          customIcon={<Avatar size="small" peer={ownerUser()} className={styles.avatar} />}
          onClick={handleOpenProfile}
        >
          <MenuItemTitle>{getUserFullName(ownerUser())}</MenuItemTitle>
          <MenuItemSubtitle>{lang('HeaderMenuViewProfile')}</MenuItemSubtitle>
          {warning}
        </MenuItem>
      );
    }

    const skeletonClassName = isOwnerMissing() ? styles.invisible : undefined;

    return (
      <MenuItem
        className={styles.placeholder}
        customIcon={
          <Skeleton
            variant="round"
            animation="wave"
            width={AVATAR_SIZES.small}
            height={AVATAR_SIZES.small}
            className={buildClassName(styles.avatar, skeletonClassName)}
          />
        }
      >
        <MenuItemTitle>
          <Skeleton
            inline
            animation="wave"
            width={NAME_SKELETON_WIDTH}
            height={NAME_SKELETON_HEIGHT}
            className={buildClassName(styles.lineSkeleton, skeletonClassName)}
          />
        </MenuItemTitle>
        <MenuItemSubtitle>
          <Skeleton
            inline
            animation="wave"
            width={LINK_SKELETON_WIDTH}
            height={LINK_SKELETON_HEIGHT}
            className={buildClassName(styles.lineSkeleton, skeletonClassName)}
          />
        </MenuItemSubtitle>
        {warning}
      </MenuItem>
    );
  }

  return (
    <a
      ref={ref}
      onClick={handleContextMenu()}
      onContextMenu={handleContextMenu()}
      class="text-entity-link"
      dir="auto"
      data-entity-type={ApiMessageEntityTypes.TonAddress}
    >
      {props.children}
      <Menu
        ref={menuRef}
        isOpen={isContextMenuOpen()}
        anchor={contextMenuAnchor()}
        getTriggerElement={getTriggerElement}
        getRootElement={getRootElement}
        getMenuElement={getMenuElement}
        getLayout={getLayout}
        onClose={handleContextMenuClose()}
        onCloseAnimationEnd={handleMenuHide}
        withPortal
        autoClose
      >
        {nonBounceableAddress() && isWalletAvailable() && (
          <MenuItem icon="gram-outline" onClick={handleSendMoney}>
            {lang('WalletSendMoney')}
          </MenuItem>
        )}
        {!props.noCopy && (
          <MenuItem icon="copy" onClick={handleCopy}>
            {lang('WalletCopyAddress')}
          </MenuItem>
        )}
        {nonBounceableAddress() && (
          <>
            <MenuItem icon="search" onClick={handleOpenInExplorer}>
              {lang('WalletViewInExplorer')}
            </MenuItem>
            <MenuSeparator />
            {renderOwnerRow()}
          </>
        )}
      </Menu>
    </a>
  );
};

export default TonAddressLink;
