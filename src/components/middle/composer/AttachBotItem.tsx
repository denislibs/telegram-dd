import { createMemo, createSignal } from 'frameact';
import { getActions } from '../../../global';

import type { ApiAttachBot } from '../../../api/types';
import type { IAnchorPosition, ThemeKey, ThreadId } from '../../../types';

import useFlag from '../../../hooks/useFlag';
import useOldLang from '../../../hooks/useOldLang';

import Menu from '../../ui/Menu';
import MenuItem from '../../ui/MenuItem';
import AttachBotIcon from './AttachBotIcon';

type OwnProps = {
  bot: ApiAttachBot;
  theme: ThemeKey;
  isInSideMenu?: true;
  chatId?: string;
  threadId?: ThreadId;
  canShowNew?: boolean;
  onMenuOpened: VoidFunction;
  onMenuClosed: VoidFunction;
};

const AttachBotItem = (props: OwnProps) => {
  const { callAttachBot, toggleAttachBot } = getActions();

  const lang = useOldLang();

  const icon = createMemo(() => {
    return props.bot.icons.find(({ name }) => name === 'default_static')?.document;
  });

  const [isMenuOpen, openMenu, closeMenu] = useFlag();
  const [menuPosition, setMenuPosition] = createSignal<IAnchorPosition | undefined>(undefined);

  const handleContextMenu = (e: React.UIEvent) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPosition({ x: rect.right, y: rect.bottom });
    props.onMenuOpened();
    openMenu();
  };

  const handleClick = () => {
    if (props.isInSideMenu) {
      callAttachBot({
        bot: props.bot,
        isFromSideMenu: true,
      });
    } else {
      callAttachBot({
        bot: props.bot,
        chatId: props.chatId!,
        threadId: props.threadId,
      });
    }
  };

  const handleCloseMenu = () => {
    closeMenu();
    props.onMenuClosed();
  };

  const handleCloseAnimationEnd = () => {
    setMenuPosition(undefined);
  };

  const handleRemoveBot = () => {
    toggleAttachBot({
      botId: props.bot.id,
      isEnabled: false,
    });
  };

  return (
    <MenuItem
      customIcon={icon() && <AttachBotIcon icon={icon()!} theme={props.theme} />}
      icon={!icon() ? 'bots' : undefined}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {props.bot.shortName}
      {props.canShowNew && props.bot.isDisclaimerNeeded && <span class="menu-item-badge">{lang('New')}</span>}
      {menuPosition() && (
        <Menu
          isOpen={isMenuOpen()}
          positionX="right"
          style={`left: ${menuPosition()?.x}px;top: ${menuPosition()?.y}px;`}
          className="bot-attach-context-menu"
          autoClose
          withPortal
          onClose={handleCloseMenu}
          onCloseAnimationEnd={handleCloseAnimationEnd}
        >
          <MenuItem icon="stop" destructive onClick={handleRemoveBot}>
            {lang('WebApp.RemoveBot')}
          </MenuItem>
        </Menu>
      )}
    </MenuItem>
  );
};

export default AttachBotItem;
