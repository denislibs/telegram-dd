import { createMemo, requestMeasure } from 'frameact';
import { For } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import type { IconName } from '../../types/icons';

import { IS_TOUCH_ENV, MouseButton } from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';
import renderText from '../common/helpers/renderText';

import useContextMenuHandlers from '../../hooks/useContextMenuHandlers';
import { useFastClick } from '../../hooks/useFastClick';
import { useFileHoverOpenHandler } from '../../hooks/useFileHoverOpen';
import useFlag from '../../hooks/useFlag';
import useLang from '../../hooks/useLang';

import Icon from '../common/icons/Icon';
import IconBackdrop, { type IconBackdropColor } from '../gili/primitives/IconBackdrop';
import Button from './Button';
import Menu from './Menu';
import MenuItem from './MenuItem';
import MenuSeparator from './MenuSeparator';
import RippleEffect from './RippleEffect';

import './ListItem.scss';

type MenuItemContextActionItem = {
  title: string;
  icon: IconName;
  destructive?: boolean;
  handler?: () => void;
};

type MenuItemContextActionSeparator = {
  isSeparator: true;
  key?: string;
};

export type MenuItemContextAction = MenuItemContextActionItem | MenuItemContextActionSeparator;

interface OwnProps {
  ref?: (el: HTMLDivElement) => void;
  buttonRef?: (el: HTMLDivElement | HTMLAnchorElement) => void;
  icon?: IconName;
  iconClassName?: string;
  iconBg?: IconBackdropColor;
  leftElement?: JSX.Element;
  secondaryIcon?: IconName;
  secondaryIconClassName?: string;
  rightElement?: JSX.Element;
  buttonClassName?: string;
  className?: string;
  style?: string;
  children: React.ReactNode;
  disabled?: boolean;
  allowDisabledClick?: boolean;
  ripple?: boolean;
  narrow?: boolean;
  inactive?: boolean;
  focus?: boolean;
  destructive?: boolean;
  withPrimaryColor?: boolean;
  multiline?: boolean;
  isStatic?: boolean;
  allowSelection?: boolean;
  withColorTransition?: boolean;
  contextActions?: MenuItemContextAction[];
  withPortalForMenu?: boolean;
  menuBubbleClassName?: string;
  href?: string;
  nonInteractive?: boolean;
  onClick?: (e: React.MouseEvent<HTMLElement>, arg?: any) => void;
  clickArg?: any;
  onMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLElement>) => void;
  onSecondaryIconClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onFileHoverOpen?: NoneToVoidFunction;
}

const ListItem = (props: OwnProps) => {
  let containerRef!: HTMLDivElement;
  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (props.ref) {
    // TODO(codemod): "containerRef" was a ref object and is reassigned here (a forwarded ref?): use a callback ref
    containerRef = props.ref;
  }
  let menuRef!: HTMLDivElement;
  const [isTouched, markIsTouched, unmarkIsTouched] = useFlag();
  const handleFileHoverOpen = useFileHoverOpenHandler(props.onFileHoverOpen);

  const contextMenuHandlersResult = createMemo(() =>
    useContextMenuHandlers(
      () => containerRef,
      () => !props.contextActions,
    ),
  );
  const isContextMenuOpen = () => contextMenuHandlersResult().isContextMenuOpen;
  const contextMenuAnchor = () => contextMenuHandlersResult().contextMenuAnchor;
  const handleBeforeContextMenu = () => contextMenuHandlersResult().handleBeforeContextMenu;
  const handleContextMenu = () => contextMenuHandlersResult().handleContextMenu;
  const handleContextMenuClose = () => contextMenuHandlersResult().handleContextMenuClose;
  const handleContextMenuHide = () => contextMenuHandlersResult().handleContextMenuHide;

  const getTriggerElement = () => containerRef;
  const getRootElement = () => containerRef!.closest('.custom-scroll');
  const getMenuElement = () => menuRef;
  const getLayout = () => ({ withPortal: props.withPortalForMenu });

  const handleClickEvent = (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
    const hasModifierKey = e.ctrlKey || e.metaKey || e.shiftKey;
    if (!hasModifierKey && e.button === MouseButton.Main) {
      if (props.href && !props.onClick) return; // Allow default behavior for opening links
      e.preventDefault();
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
    if (props.disabled && !props.allowDisabledClick) {
      return;
    }

    if (props.href) {
      // Allow default behavior for opening links in new tab
      const hasModifierKey = e.ctrlKey || e.metaKey || e.shiftKey;
      if ((hasModifierKey && e.button === MouseButton.Main) || e.button === MouseButton.Auxiliary) {
        return;
      }

      if (props.onClick) e.preventDefault();
    }

    if (!props.onClick) return;

    props.onClick(e, props.clickArg);

    if (IS_TOUCH_ENV && !props.ripple) {
      markIsTouched();
      requestMeasure(unmarkIsTouched);
    }
  };

  const fastClickResult = createMemo(() =>
    useFastClick((e: React.MouseEvent<HTMLButtonElement>) => {
      if (
        (props.disabled && !props.allowDisabledClick) ||
        e.button !== 0 ||
        (!props.onSecondaryIconClick && !props.contextActions)
      )
        return;

      e.stopPropagation();

      if (props.onSecondaryIconClick) {
        props.onSecondaryIconClick(e);
      } else {
        handleContextMenu()(e);
      }
    }),
  );
  const handleSecondaryIconClick = () => fastClickResult().handleClick;
  const handleSecondaryIconMouseDown = () => fastClickResult().handleMouseDown;

  const handleMouseDown = (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
    if (props.inactive || IS_TOUCH_ENV) {
      return;
    }
    if (props.contextActions && (e.button === MouseButton.Secondary || !props.onClick)) {
      handleBeforeContextMenu()(e);
    }
    if (e.button === MouseButton.Main) {
      if (!props.onClick) {
        handleContextMenu()(e);
      } else {
        handleClick(e);
      }
    }
  };

  const lang = useLang();

  const fullClassName = createMemo(() =>
    buildClassName(
      'ListItem',
      props.className,
      props.allowSelection && 'allow-selection',
      props.ripple && 'has-ripple',
      props.narrow && 'narrow',
      props.disabled && 'disabled',
      props.allowDisabledClick && 'click-allowed',
      props.inactive && 'inactive',
      contextMenuAnchor() && 'has-menu-open',
      props.focus && 'focus',
      props.destructive && 'destructive',
      props.withPrimaryColor && 'primary',
      props.multiline && 'multiline',
      props.isStatic && 'is-static',
      props.withColorTransition && 'with-color-transition',
    ),
  );

  const ButtonElementTag = createMemo(() => (props.href ? 'a' : 'div'));

  return (
    <div
      ref={containerRef}
      class={fullClassName()}
      dir={lang.isRtl ? 'rtl' : undefined}
      style={props.style}
      onMouseDown={(e) => props.onMouseDown?.(e)}
      data-file-hover-open={props.onFileHoverOpen ? true : undefined}
      onFileHoverOpen={props.onFileHoverOpen ? handleFileHoverOpen : undefined}
    >
      {/* TODO(codemod): <ButtonElementTag> is a reactive value now: render it with <Dynamic component={ButtonElementTag()}> */}
      <ButtonElementTag
        className={buildClassName('ListItem-button', isTouched() && 'active', props.buttonClassName)}
        role={!props.isStatic && !props.href ? 'button' : undefined}
        href={props.href}
        // @ts-expect-error TS requires specific types for refs
        ref={props.buttonRef}
        rel={props.href ? 'noopener noreferrer' : undefined}
        tabIndex={!props.isStatic ? 0 : undefined}
        onClick={!props.inactive && IS_TOUCH_ENV ? handleClick : handleClickEvent}
        onMouseDown={handleMouseDown}
        onContextMenu={
          props.onContextMenu || (!props.inactive && props.contextActions ? handleContextMenu() : undefined)
        }
        aria-disabled={props.disabled || undefined}
      >
        {!props.disabled && !props.inactive && props.ripple && <RippleEffect />}
        {props.leftElement}
        {props.icon &&
          (props.iconBg ? (
            <IconBackdrop
              className={buildClassName('ListItem-main-icon', props.iconClassName)}
              color={props.iconBg}
              icon={props.icon}
            />
          ) : (
            <Icon name={props.icon} className={buildClassName('ListItem-main-icon', props.iconClassName)} />
          ))}
        {props.multiline && <div class="multiline-item">{props.children}</div>}
        {!props.multiline && props.children}
        {props.secondaryIcon && (
          <Button
            nonInteractive={props.nonInteractive}
            className={buildClassName('secondary-icon', props.secondaryIconClassName)}
            round
            color="translucent"
            size="smaller"
            onClick={handleSecondaryIconClick()}
            onMouseDown={handleSecondaryIconMouseDown()}
            iconName={props.secondaryIcon}
          />
        )}
        {props.rightElement}
      </ButtonElementTag>
      {props.contextActions && contextMenuAnchor() !== undefined && (
        <Menu
          ref={menuRef}
          isOpen={isContextMenuOpen()}
          anchor={contextMenuAnchor()}
          getTriggerElement={getTriggerElement}
          getRootElement={getRootElement}
          getMenuElement={getMenuElement}
          getLayout={getLayout}
          className="ListItem-context-menu with-menu-transitions"
          autoClose
          onClose={handleContextMenuClose()}
          onCloseAnimationEnd={handleContextMenuHide()}
          withPortal={props.withPortalForMenu}
          bubbleClassName={props.menuBubbleClassName}
        >
          <For each={props.contextActions}>
            {(action) =>
              'isSeparator' in action ? (
                <MenuSeparator />
              ) : (
                <MenuItem
                  icon={action.icon}
                  destructive={action.destructive}
                  disabled={!action.handler}
                  onClick={action.handler}
                >
                  <span class="list-item-ellipsis">{renderText(action.title)}</span>
                </MenuItem>
              )
            }
          </For>
        </Menu>
      )}
    </div>
  );
};

export default ListItem;
