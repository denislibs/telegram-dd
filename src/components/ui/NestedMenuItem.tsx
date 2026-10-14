import { createEffect, createSignal, onDestroy, requestMeasure } from 'frameact';
import type { JSX } from 'frameact/jsx-runtime';
import { depsOf } from '../../util/effectDeps';

import type { IAnchorPosition } from '../../types';
import type { IconName } from '../../types/icons';

import buildClassName from '../../util/buildClassName';
import { REM } from '../common/helpers/mediaDimensions';

import useFlag from '../../hooks/useFlag';
import useLang from '../../hooks/useLang';
import useUniqueId from '../../hooks/useUniqueId';
import useWindowSize from '../../hooks/window/useWindowSize';

import Icon from '../common/icons/Icon';
import Menu from './Menu';
import MenuItem from './MenuItem';

const OPEN_TIMEOUT = 150;
const CLOSE_TIMEOUT = 150;

type OwnProps = {
  icon?: IconName;
  customIcon?: JSX.Element;
  submenuIcon?: IconName;
  className?: string;
  children: JSX.Element;
  submenu: React.ReactNode;
  submenuClassName?: string;
  disabled?: boolean;
  destructive?: boolean;
  ariaLabel?: string;
  footer?: string;
  hasIconPremiumBadge?: boolean;
};

const NestedMenuItem = (props: OwnProps) => {
  const lang = useLang();

  let itemRef!: HTMLDivElement;
  let closeTimeoutRef: number | undefined;
  let openTimeoutRef: number | undefined;
  const submenuId = useUniqueId();
  let isClosingRef = false;

  const [isSubmenuOpen, openSubmenu, closeSubmenu] = useFlag(false);

  onDestroy(() => {
    clearTimeout(closeTimeoutRef);
    clearTimeout(openTimeoutRef);
  });

  const [submenuAnchor, setSubmenuAnchor] = createSignal<IAnchorPosition | undefined>(undefined);
  const { isResizing } = useWindowSize();

  const updateAnchor = () => {
    requestMeasure(() => {
      if (!itemRef) return;

      const rect = itemRef.getBoundingClientRect();
      const overlap = REM;

      setSubmenuAnchor({
        x: lang.isRtl ? rect.left + overlap : rect.right - overlap,
        y: rect.top,
        width: rect.width - overlap * 2,
        height: rect.height,
      });
    });
  };

  createEffect(
    depsOf(() => [isSubmenuOpen(), lang.isRtl, updateAnchor, isResizing()] as const),
    ([isSubmenuOpen2, , , isResizing2]) => {
      if (isSubmenuOpen2 && !isResizing2) {
        updateAnchor();
      }
    },
  );

  const cancelOpen = () => {
    clearTimeout(openTimeoutRef);
    openTimeoutRef = undefined;
  };

  const cancelClose = () => {
    clearTimeout(closeTimeoutRef);
    closeTimeoutRef = undefined;
  };

  const scheduleOpen = () => {
    cancelClose();
    cancelOpen();
    openTimeoutRef = window.setTimeout(() => {
      openTimeoutRef = undefined;
      // Don't open if the parent menu is closing
      const parentBubble = itemRef?.closest('.bubble');
      if (parentBubble?.classList.contains('closing')) return;
      openSubmenu();
    }, OPEN_TIMEOUT);
  };

  const scheduleClose = () => {
    cancelOpen();
    cancelClose();
    closeTimeoutRef = window.setTimeout(() => {
      closeSubmenu();
      closeTimeoutRef = undefined;
    }, CLOSE_TIMEOUT);
  };

  const handleMouseEnter = () => {
    if (props.disabled) return;
    scheduleOpen();
  };

  const handleSubmenuMouseEnter = () => {
    cancelOpen();
    cancelClose();
  };

  const handleSubmenuMouseLeave = () => {
    scheduleClose();
  };

  const closeParentMenu = () => {
    const parentMenu = itemRef?.closest('.Menu');
    if (parentMenu) {
      const backdrop = parentMenu.querySelector('.backdrop') as HTMLElement;
      if (backdrop) {
        const event = new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          view: window,
        });
        backdrop.dispatchEvent(event);
      }
    }
  };

  const handleSubmenuClose = () => {
    if (isClosingRef) return;
    isClosingRef = true;

    cancelOpen();
    cancelClose();
    closeSubmenu();

    closeParentMenu();

    // Reset after a short delay
    setTimeout(() => {
      isClosingRef = false;
    }, 100);
  };

  const getTriggerElement = () => itemRef;
  const getRootElement = () => document.body;
  const getMenuElement = () => document.getElementById(submenuId)?.querySelector('.bubble') as HTMLElement | undefined;
  const getLayout = () => ({ withPortal: true });

  const handleClick = (e: React.SyntheticEvent<HTMLDivElement | HTMLAnchorElement>) => {
    e.stopPropagation();
    if (props.disabled || isSubmenuOpen()) return;
    openSubmenu();
  };

  return (
    <div onMouseEnter={handleMouseEnter} onMouseLeave={scheduleClose} ref={itemRef}>
      <MenuItem
        icon={props.icon}
        customIcon={props.customIcon}
        className={buildClassName(props.className, 'submenu')}
        disabled={props.disabled}
        destructive={props.destructive}
        ariaLabel={props.ariaLabel}
        hasIconPremiumBadge={props.hasIconPremiumBadge}
        onClick={handleClick}
      >
        {props.children}
        <Icon name={props.submenuIcon || (lang.isRtl ? 'previous' : 'next')} className="submenu-icon" />
        {submenuAnchor() && (
          <Menu
            id={submenuId}
            isOpen={isSubmenuOpen()}
            className={buildClassName('submenu', props.submenuClassName)}
            anchor={submenuAnchor()}
            positionX={lang.isRtl ? 'left' : 'right'}
            getTriggerElement={getTriggerElement}
            getRootElement={getRootElement}
            getMenuElement={getMenuElement}
            getLayout={getLayout}
            autoClose
            nested
            withPortal
            footer={props.footer}
            onClose={handleSubmenuClose}
            onMouseEnter={handleSubmenuMouseEnter}
            onMouseLeave={handleSubmenuMouseLeave}
          >
            {props.submenu}
          </Menu>
        )}
      </MenuItem>
    </div>
  );
};

export default NestedMenuItem;
