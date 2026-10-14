import { type Accessor, createMeasureEffect, createMemo, createSignal } from 'frameact';
import { For, Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import type { ApiMessageEntityCustomEmoji } from '../../api/types';
import type { IAnchorPosition } from '../../types';
import type { MenuItemContextAction } from './ListItem';
import type { TabWithProperties } from './SquareTabList';

import { depsOf } from '../../util/effectDeps';

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
  // Deviation: the container refs are signals, so that the hooks (and the effects below) that read them pick the
  // elements up when the list is shown (the whole list is rendered only while there are tabs).
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement | undefined>(undefined);
  const [clipPathContainerRef, setClipPathContainerRef] = createSignal<HTMLDivElement | undefined>(undefined);
  const [clipPath, setClipPath] = createSignal<string>('');
  const [isMenuOpen, openMenu, closeMenu] = useFlag();
  const [menuAnchor, setMenuAnchor] = createSignal<IAnchorPosition | undefined>(undefined);
  const [menuTabIndex, setMenuTabIndex] = createSignal<number | undefined>(undefined);
  let menuTargetRef: HTMLElement | undefined;

  useHorizontalScroll(containerRef, () => !props.tabs.length, true);

  const updateClipPath = (activeTab: number) => {
    const clipPathContainer = clipPathContainerRef();
    const activeTabEl = activeTab >= 0 && (clipPathContainer?.childNodes[activeTab] as HTMLElement | undefined);

    if (clipPathContainer && activeTabEl && clipPathContainer.offsetWidth > 0) {
      const { offsetLeft, offsetWidth } = activeTabEl;
      const containerWidth = clipPathContainer.offsetWidth;
      const left = ((offsetLeft / containerWidth) * 100).toFixed(1);
      const right = (((containerWidth - (offsetLeft + offsetWidth)) / containerWidth) * 100).toFixed(1);

      setClipPath(`inset(0.25rem ${right}% 0.25rem ${left}% round var(--tab-radius))`);
    } else if (activeTab < 0) {
      setClipPath('inset(0 100% 0 100%)');
    }
  };

  // Reads layout (offsets), hence a measure effect.
  createMeasureEffect(
    depsOf(() => [props.activeTab, props.tabs, clipPathContainerRef()] as const),
    ([activeTab2]) => {
      updateClipPath(activeTab2);
    },
  );

  useResizeObserver(
    clipPathContainerRef,
    () => updateClipPath(props.activeTab),
    () => !clipPathContainerRef(),
  );

  useScrollToActiveTab(containerRef, () => props.activeTab);

  const handleTabClick = (index: number) => {
    props.onSwitchTab(index);
  };

  const handleFileHoverOpen = (index: number, e: Event) => {
    handleFileHoverOpenEvent(e, () => props.onFileHoverOpen?.(index));
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
  const getRootElement = () => containerRef();
  const getMenuElement = () => containerRef()?.querySelector<HTMLElement>('.TabList-context-menu .bubble');
  const getLayout = () => ({ withPortal: true });

  // Deviation: a row is keyed by `tab.id` (tt: `tab.id ?? index`); a tab without an id is keyed by the object itself.
  const getTabKey = (tab: TabWithProperties) => tab.id ?? tab;

  const renderTab = (tab: Accessor<TabWithProperties>, index: Accessor<number>) => {
    const customEmojiId = () =>
      tab().customEmojiDocumentId ||
      (typeof tab().emoticon === 'object' ? (tab().emoticon as ApiMessageEntityCustomEmoji).documentId : undefined);
    const stringEmoticon = () => {
      const emoticon = tab().emoticon;
      return typeof emoticon === 'string' ? emoticon : undefined;
    };
    const renderTitle = () => {
      const title = tab().title;
      return typeof title === 'string' ? renderText(title) : title;
    };

    return (
      <div
        class={buildClassName(
          styles.tab,
          props.tabClassName,
          props.itemAlignment === 'vertical' && styles.vertical,
          props.stretched && styles.stretched,
        )}
        onClick={() => handleTabClick(index())}
        data-file-hover-open={props.onFileHoverOpen ? true : undefined}
        on:filehoveropen={(e: Event) => handleFileHoverOpen(index(), e)}
        onContextMenu={(e) => handleContextMenu(index(), e)}
      >
        {stringEmoticon() && <span class={styles.tabEmoji}>{stringEmoticon()}</span>}
        {customEmojiId() && (
          <CustomEmoji documentId={customEmojiId()!} className={styles.tabEmoji} size={EMOJI_SIZE} shouldNotLoop />
        )}
        {tab().icon && <Icon name={tab().icon!} className={styles.tabIcon} />}
        {renderTitle()}
        {props.renderExtra?.(tab(), index())}
        {tab().isBlocked && <Icon name="lock-filled" className={styles.lockIcon} />}
      </div>
    );
  };

  const contextActions = createMemo(() =>
    menuTabIndex() !== undefined ? props.tabs[menuTabIndex()!]?.contextActions : undefined,
  );

  const renderTabListElement = () => (
    <div
      ref={(el) => setContainerRef(el)}
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
      <For each={props.tabs} keyed={getTabKey}>
        {renderTab}
      </For>

      <div
        ref={(el) => setClipPathContainerRef(el)}
        class={buildClassName(
          styles.activeIndicator,
          props.centered && styles.centered,
          props.stretched && styles.stretched,
          props.indicatorClassName,
        )}
        style={clipPath() ? `clip-path: ${clipPath()}` : undefined}
        aria-hidden
      >
        <For each={props.tabs} keyed={getTabKey}>
          {renderTab}
        </For>
      </div>
    </div>
  );

  const renderMenuElement = () => (
    <Show when={contextActions() && menuAnchor() !== undefined}>
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
              <MenuSeparator />
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
    </Show>
  );

  return (
    <Show when={props.tabs.length}>
      <Show
        when={props.withFadeMask}
        fallback={
          <>
            {renderTabListElement()}
            {renderMenuElement()}
          </>
        }
      >
        <>
          <div class={buildClassName(styles.fadeMaskWrapper, props.fadeMaskClassName)}>{renderTabListElement()}</div>
          {renderMenuElement()}
        </>
      </Show>
    </Show>
  );
};

export default TabList;
