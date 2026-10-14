import { createMemo, previous } from 'frameact';
import { For } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import type { ApiMessageEntityCustomEmoji } from '../../api/types';
import type { IconName } from '../../types/icons';
import type { MenuItemContextAction } from './ListItem';

import buildClassName from '../../util/buildClassName';

import useHorizontalScroll from '../../hooks/useHorizontalScroll';
import useLang from '../../hooks/useLang';
import useScrollToActiveTab from '../../hooks/useScrollToActiveTab';

import Tab from './Tab';

import './SquareTabList.scss';

export type TabWithProperties = {
  id?: number;
  title: JSX.Element;
  icon?: IconName;
  badgeCount?: number;
  isBlocked?: boolean;
  isBadgeActive?: boolean;
  contextActions?: MenuItemContextAction[];
  emoticon?: string | ApiMessageEntityCustomEmoji;
  customEmojiDocumentId?: string;
  noTitleAnimations?: boolean;
};

type OwnProps = {
  tabs: readonly TabWithProperties[];
  activeTab: number;
  className?: string;
  tabClassName?: string;
  contextRootElementSelector?: string;
  ref?: (el: HTMLDivElement) => void;
  onSwitchTab: (index: number) => void;
};

const SquareTabList = (props: OwnProps) => {
  let internalRef!: HTMLDivElement;
  // TODO(codemod): "internalRef" was a ref object passed as a value: pass an accessor (() => internalRef) or a callback ref
  const containerRef = createMemo(() => props.ref || internalRef);
  const previousActiveTab = previous(() => props.activeTab);

  const lang = useLang();

  useHorizontalScroll(() => containerRef(), undefined, true);
  useScrollToActiveTab(
    () => containerRef(),
    () => props.activeTab,
  );

  return (
    <div
      class={buildClassName('SquareTabList', 'no-scrollbar', props.className)}
      ref={containerRef()}
      dir={lang.isRtl ? 'rtl' : undefined}
    >
      <For each={props.tabs} keyed={(tab) => tab.id}>
        {(tab, i) => (
          <Tab
            title={tab().title}
            isActive={i() === props.activeTab}
            isBlocked={tab().isBlocked}
            badgeCount={tab().badgeCount}
            isBadgeActive={tab().isBadgeActive}
            previousActiveTab={previousActiveTab()}
            onClick={props.onSwitchTab}
            clickArg={i()}
            contextActions={tab().contextActions}
            contextRootElementSelector={props.contextRootElementSelector}
            className={props.tabClassName}
          />
        )}
      </For>
    </div>
  );
};

export default SquareTabList;
