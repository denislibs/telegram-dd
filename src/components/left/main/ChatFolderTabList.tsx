import type { TabWithProperties } from '../../ui/TabList';

import buildClassName from '../../../util/buildClassName';

import TabList from '../../ui/TabList';

import styles from './ChatFolderTabList.module.scss';

type OwnProps = {
  tabs: readonly TabWithProperties[];
  activeTab: number;
  className?: string;
  onSwitchTab: (index: number) => void;
  onFileHoverOpen: (index: number) => void;
};

const ChatFolderTabList = (props: OwnProps) => {
  const renderExtra = (tab: TabWithProperties) => {
    if (!tab.badgeCount) return undefined;
    return <span class={buildClassName(styles.badge, tab.isBadgeActive && styles.badgeActive)}>{tab.badgeCount}</span>;
  };

  return (
    <div class={buildClassName(styles.root)}>
      <TabList
        tabs={props.tabs}
        activeTab={props.activeTab}
        withFadeMask
        renderExtra={renderExtra}
        className={buildClassName(styles.tabList, props.className)}
        onSwitchTab={props.onSwitchTab}
        onFileHoverOpen={props.onFileHoverOpen}
      />
    </div>
  );
};

export default ChatFolderTabList;
