import { createEffect, createMemo, createSignal } from 'frameact';
import { For, Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';
import { depsOf } from '../../util/effectDeps';

import type { IAnchorPosition } from '../../types';
import type { MenuItemContextAction } from './ListItem';
import type { TabWithProperties } from './SquareTabList';

export type { TabWithProperties };

import buildClassName from '../../util/buildClassName';
import renderText from '../common/helpers/renderText';

import { handleFileHoverOpenEvent } from '../../hooks/useFileHoverOpen';
import useFlag from '../../hooks/useFlag';
import useHorizontalScroll from '../../hooks/useHorizontalScroll';
import useResizeObserver from '../../hooks/useResizeObserver';
import useScrollToActiveTab from '../../hooks/useScrollToActiveTab';

import CustomEmoji from '../common/CustomEmoji';
import Icon from '../common/icons/Icon';
import Menu from './Menu';
import MenuItem from './MenuItem';
import MenuSeparator from './MenuSeparator';

import styles from './TabList.module.scss';

const EMOJI_SIZE = 20;

type OwnProps = {
  tabs: readonly TabWithProperties[];
  activeTab: number;
  className?: string;
  tabClassName?: string;
  indicatorClassName?: string;
  centered?: boolean;
  stretched?: boolean;
  itemAlignment?: 'vertical' | 'horizontal';
  withFadeMask?: boolean;
  fadeMaskClassName?: string;
  onSwitchTab: (index: number) => void;
  renderExtra?: (tab: TabWithProperties, index: number) => JSX.Element;
  onFileHoverOpen?: (index: number) => void;
};

const TabList = (props: OwnProps) => {
  let containerRef!: HTMLDivElement;
  let clipPathContainerRef!: HTMLDivElement;
  const [clipPath, setClipPath] = createSignal<string>('');
  const [isMenuOpen, openMenu, closeMenu] = useFlag();
  const [menuAnchor, setMenuAnchor] = createSignal<IAnchorPosition | undefined>(undefined);
  const [menuTabIndex, setMenuTabIndex] = createSignal<number | undefined>(undefined);
  let menuTargetRef!: HTMLElement;

  useHorizontalScroll(
    () => containerRef,
    () => !props.tabs.length,
    true,
  );

  const updateClipPath = () => {
    const clipPathContainer = clipPathContainerRef;
    const activeTabEl =
      props.activeTab >= 0 && (clipPathContainer?.childNodes[props.activeTab] as HTMLElement | undefined);

    if (clipPathContainer && activeTabEl && clipPathContainer.offsetWidth > 0) {
      const { offsetLeft, offsetWidth } = activeTabEl;
      const containerWidth = clipPathContainer.offsetWidth;
      const left = ((offsetLeft / containerWidth) * 100).toFixed(1);
      const right = (((containerWidth - (offsetLeft + offsetWidth)) / containerWidth) * 100).toFixed(1);

      setClipPath(`inset(0.25rem ${right}% 0.25rem ${left}% round var(--tab-radius))`);
    } else if (props.activeTab < 0) {
      setClipPath('inset(0 100% 0 100%)');
    }
  };

  createEffect(
    depsOf(() => [props.activeTab, props.tabs] as const),
    ([activeTab2, tabs2]) => {
      updateClipPath();
    },
  );

  useResizeObserver(() => clipPathContainerRef, updateClipPath);

  useScrollToActiveTab(
    () => containerRef,
    () => props.activeTab,
  );

  const handleTabClick = (index: number) => {
    props.onSwitchTab(index);
  };

  const handleFileHoverOpen = (index: number, e: Event) => {
    handleFileHoverOpenEvent(e, () => props.onFileHoverOpen!(index));
  };

  const handleContextMenu = (index: number, e: React.MouseEvent) => {
    const actions = props.tabs[index]?.contextActions;
    if (!actions?.length) return;
    e.preventDefault();
    menuTargetRef = e.currentTarget as HTMLElement;
    setMenuTabIndex(index);
    setMenuAnchor({ x: e.clientX, y: e.clientY });
    openMenu();
  };

  const handleMenuClose = () => {
    closeMenu();
  };

  const handleMenuHide = () => {
    setMenuAnchor(undefined);
    setMenuTabIndex(undefined);
  };

  const getTriggerElement = () => menuTargetRef;
  const getRootElement = () => containerRef;
  const getMenuElement = () => containerRef?.querySelector<HTMLElement>('.TabList-context-menu .bubble');
  const getLayout = () => ({ withPortal: true });

  const hasContextActions = createMemo(() => props.tabs.some((tab) => tab.contextActions?.length));

  const renderTab = (tab: TabWithProperties, index: number) => {
    const customEmojiId =
      tab.customEmojiDocumentId || (typeof tab.emoticon === 'object' ? tab.emoticon.documentId : undefined);
    const stringEmoticon = typeof tab.emoticon === 'string' ? tab.emoticon : undefined;

    return (
      <div
        class={buildClassName(
          styles.tab,
          props.tabClassName,
          props.itemAlignment === 'vertical' && styles.vertical,
          props.stretched && styles.stretched,
        )}
        onClick={() => handleTabClick(index)}
        data-file-hover-open={props.onFileHoverOpen ? true : undefined}
        onFileHoverOpen={props.onFileHoverOpen ? (e) => handleFileHoverOpen(index, e) : undefined}
        onContextMenu={hasContextActions() ? (e) => handleContextMenu(index, e) : undefined}
      >
        {stringEmoticon && <span class={styles.tabEmoji}>{stringEmoticon}</span>}
        {customEmojiId && (
          <CustomEmoji documentId={customEmojiId} className={styles.tabEmoji} size={EMOJI_SIZE} shouldNotLoop />
        )}
        {tab.icon && <Icon name={tab.icon} className={styles.tabIcon} />}
        {typeof tab.title === 'string' ? renderText(tab.title) : tab.title}
        {props.renderExtra?.(tab, index)}
        {tab.isBlocked && <Icon name="lock-filled" className={styles.lockIcon} />}
      </div>
    );
  };

  const contextActions = createMemo(() =>
    menuTabIndex() !== undefined ? props.tabs[menuTabIndex()]?.contextActions : undefined,
  );

  const tabListElement = (
    <div
      ref={containerRef}
      class={buildClassName(
        'TabList',
        styles.container,
        props.withFadeMask && styles.withFadeMask,
        props.centered && styles.centered,
        props.itemAlignment === 'vertical' && styles.vertical,
        props.className,
        clipPath() && styles.ready,
      )}
    >
      {props.tabs.map(renderTab)}

      <div
        ref={clipPathContainerRef}
        class={buildClassName(
          styles.activeIndicator,
          props.centered && styles.centered,
          props.stretched && styles.stretched,
          props.indicatorClassName,
        )}
        style={clipPath() ? `clip-path: ${clipPath()}` : undefined}
        aria-hidden
      >
        {props.tabs.map(renderTab)}
      </div>
    </div>
  );

  const menuElement = createMemo(
    () =>
      contextActions() &&
      menuAnchor() !== undefined && (
        <Menu
          isOpen={isMenuOpen()}
          anchor={menuAnchor()}
          getTriggerElement={getTriggerElement}
          getRootElement={getRootElement}
          getMenuElement={getMenuElement}
          getLayout={getLayout}
          className="TabList-context-menu"
          autoClose
          onClose={handleMenuClose}
          onCloseAnimationEnd={handleMenuHide}
          withPortal
        >
          <For each={contextActions()}>
            {(action: MenuItemContextAction) =>
              'isSeparator' in action ? (
                // TODO(codemod): key= on a single element remounted it: wrap in <Show when={key} keyed>{() => …}</Show>
                <MenuSeparator key={action.key || `separator-${contextActions().indexOf(action)}`} />
              ) : (
                <MenuItem
                  icon={action.icon}
                  destructive={action.destructive}
                  disabled={!action.handler}
                  onClick={action.handler}
                >
                  {renderText(action.title)}
                </MenuItem>
              )
            }
          </For>
        </Menu>
      ),
  );

  return (
    <Show when={props.tabs.length}>
      <Show
        when={props.withFadeMask}
        fallback={
          <>
            {tabListElement}
            {menuElement()}
          </>
        }
      >
        <>
          <div class={buildClassName(styles.fadeMaskWrapper, props.fadeMaskClassName)}>{tabListElement}</div>
          {menuElement()}
        </>
      </Show>
    </Show>
  );
};

export default TabList;
