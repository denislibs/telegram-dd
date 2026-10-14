import { createMeasureEffect, createMemo, createMutationEffect, requestForcedReflow, requestMutation } from 'frameact';
import { For } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';
import { depsOf } from '../../util/effectDeps';

import type { MenuItemContextAction } from './ListItem';

import { MouseButton } from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';
import forceReflow from '../../util/forceReflow';
import renderText from '../common/helpers/renderText';

import useContextMenuHandlers from '../../hooks/useContextMenuHandlers';
import { useFastClick } from '../../hooks/useFastClick';

import Icon from '../common/icons/Icon';
import Menu from './Menu';
import MenuItem from './MenuItem';
import MenuSeparator from './MenuSeparator';

import './Tab.scss';

type OwnProps = {
  className?: string;
  title: JSX.Element;
  isActive?: boolean;
  isBlocked?: boolean;
  badgeCount?: number;
  isBadgeActive?: boolean;
  previousActiveTab?: number;
  onClick?: (arg: number) => void;
  clickArg?: number;
  contextActions?: MenuItemContextAction[];
  contextRootElementSelector?: string;
  icon?: JSX.Element;
};

const classNames = {
  active: 'Tab--active',
  badgeActive: 'Tab__badge--active',
};

const Tab = (props: OwnProps) => {
  let tabRef!: HTMLDivElement;

  createMutationEffect(
    depsOf(() => [props.isActive, props.previousActiveTab] as const),
    ([isActive2, previousActiveTab2]) => {
      // Set initial active state
      if (isActive2 && previousActiveTab2 === undefined && tabRef) {
        tabRef.classList.add(classNames.active);
      }
    },
  );

  createMeasureEffect(
    depsOf(() => [props.isActive, props.previousActiveTab] as const),
    ([isActive2, previousActiveTab2]) => {
      if (!isActive2 || previousActiveTab2 === undefined) {
        return;
      }

      const tabEl = tabRef!;
      const prevTabEl = tabEl.parentElement!.children[previousActiveTab2];
      if (!prevTabEl) {
        // The number of tabs in the parent component has decreased. It is necessary to add the active tab class name.
        if (isActive2 && !tabEl.classList.contains(classNames.active)) {
          requestMutation(() => {
            tabEl.classList.add(classNames.active);
          });
        }
        return;
      }

      const platformEl = tabEl.querySelector<HTMLElement>('.platform')!;
      const prevPlatformEl = prevTabEl.querySelector<HTMLElement>('.platform')!;

      // We move and resize the platform, so it repeats the position and size of the previous one
      const shiftLeft = prevPlatformEl.parentElement!.offsetLeft - platformEl.parentElement!.offsetLeft;
      const scaleFactor = prevPlatformEl.clientWidth / platformEl.clientWidth;

      requestMutation(() => {
        prevPlatformEl.classList.remove('animate');
        platformEl.classList.remove('animate');
        platformEl.style.transform = `translate3d(${shiftLeft}px, 0, 0) scale3d(${scaleFactor}, 1, 1)`;

        requestForcedReflow(() => {
          forceReflow(platformEl);

          return () => {
            platformEl.classList.add('animate');
            platformEl.style.transform = 'none';

            prevTabEl.classList.remove(classNames.active);
            tabEl.classList.add(classNames.active);
          };
        });
      });
    },
  );

  const contextMenuHandlersResult = createMemo(() =>
    useContextMenuHandlers(
      () => tabRef,
      () => !props.contextActions,
    ),
  );
  const contextMenuAnchor = () => contextMenuHandlersResult().contextMenuAnchor;
  const handleContextMenu = () => contextMenuHandlersResult().handleContextMenu;
  const handleBeforeContextMenu = () => contextMenuHandlersResult().handleBeforeContextMenu;
  const handleContextMenuClose = () => contextMenuHandlersResult().handleContextMenuClose;
  const handleContextMenuHide = () => contextMenuHandlersResult().handleContextMenuHide;
  const isContextMenuOpen = () => contextMenuHandlersResult().isContextMenuOpen;

  const fastClickResult = createMemo(() =>
    useFastClick((e: React.MouseEvent<HTMLDivElement>) => {
      if (props.contextActions && (e.button === MouseButton.Secondary || !props.onClick)) {
        handleBeforeContextMenu()(e);
      }

      if (e.type === 'mousedown' && e.button !== MouseButton.Main) {
        return;
      }

      props.onClick?.(props.clickArg!);
    }),
  );
  const handleClick = () => fastClickResult().handleClick;
  const handleMouseDown = () => fastClickResult().handleMouseDown;

  const getTriggerElement = () => tabRef;
  const getRootElement = () =>
    props.contextRootElementSelector ? tabRef!.closest(props.contextRootElementSelector) : document.body;
  const getMenuElement = () => document.querySelector('#portals')!.querySelector('.Tab-context-menu .bubble');
  const getLayout = () => ({ withPortal: true });

  return (
    <div
      class={buildClassName('Tab', props.onClick && 'Tab--interactive', props.className)}
      onClick={handleClick()}
      onMouseDown={handleMouseDown()}
      onContextMenu={handleContextMenu()}
      ref={tabRef}
    >
      {props.icon}
      <span class="Tab_inner">
        {typeof props.title === 'string' ? renderText(props.title) : props.title}
        {Boolean(props.badgeCount) && (
          <span class={buildClassName('badge', props.isBadgeActive && classNames.badgeActive)}>{props.badgeCount}</span>
        )}
        {props.isBlocked && <Icon name="lock-filled" className="blocked" />}
        <i class="platform" />
      </span>

      {props.contextActions && contextMenuAnchor() !== undefined && (
        <Menu
          isOpen={isContextMenuOpen()}
          anchor={contextMenuAnchor()}
          getTriggerElement={getTriggerElement}
          getRootElement={getRootElement}
          getMenuElement={getMenuElement}
          getLayout={getLayout}
          className="Tab-context-menu"
          autoClose
          onClose={handleContextMenuClose()}
          onCloseAnimationEnd={handleContextMenuHide()}
          withPortal
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
                  {action.title}
                </MenuItem>
              )
            }
          </For>
        </Menu>
      )}
    </div>
  );
};

export default Tab;
