import { createEffect, createMemo, createSignal } from 'frameact';
import { getActions } from '../../global';

import buildClassName from '../../util/buildClassName';

import useOldLang from '../../hooks/useOldLang';

import Icon from '../common/icons/Icon';
import Button from '../ui/Button';
import Menu from '../ui/Menu';
import MenuItem from '../ui/MenuItem';

import './NewChatButton.scss';

type OwnProps = {
  isShown: boolean;
  onNewPrivateChat: () => void;
  onNewChannel: () => void;
  onNewGroup: () => void;
  isAccountFrozen?: boolean;
};

const NewChatButton = (props: OwnProps) => {
  const [isMenuOpen, setIsMenuOpen] = createSignal(false);
  const { openFrozenAccountModal } = getActions();

  const shouldRender = createMemo(() => props.isShown || isMenuOpen());

  createEffect(
    () => shouldRender(),
    (shouldRender2) => {
      if (!shouldRender2) {
        setIsMenuOpen(false);
      }
    },
  );

  const lang = useOldLang();

  const fabClassName = createMemo(() =>
    buildClassName('NewChatButton', shouldRender() && 'revealed', isMenuOpen() && 'menu-is-open'),
  );

  const toggleIsMenuOpen = () => {
    if (props.isAccountFrozen) {
      openFrozenAccountModal();
      return;
    }
    setIsMenuOpen(!isMenuOpen());
  };

  const handleClose = () => {
    setIsMenuOpen(false);
  };

  const menuItems = createMemo(() => (
    <>
      <MenuItem icon="channel" onClick={props.onNewChannel}>
        {lang('NewChannel')}
      </MenuItem>
      <MenuItem icon="group" onClick={props.onNewGroup}>
        {lang('NewGroup')}
      </MenuItem>
      <MenuItem icon="user" onClick={props.onNewPrivateChat}>
        {lang('NewMessageTitle')}
      </MenuItem>
    </>
  ));

  return (
    <div class={fabClassName()} dir={lang.isRtl ? 'rtl' : undefined}>
      <Button
        round
        color="primary"
        className={isMenuOpen() ? 'active' : ''}
        onClick={toggleIsMenuOpen}
        ariaLabel={lang(isMenuOpen() ? 'Close' : 'NewMessageTitle')}
        tabIndex={-1}
      >
        <Icon name="new-chat-filled" />
        <Icon name="close" />
      </Button>
      <Menu
        isOpen={isMenuOpen()}
        positionX={lang.isRtl ? 'left' : 'right'}
        positionY="bottom"
        autoClose
        onClose={handleClose}
      >
        {menuItems()}
      </Menu>
    </div>
  );
};

export default NewChatButton;
