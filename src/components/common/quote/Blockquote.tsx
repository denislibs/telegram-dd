import { createMemo } from 'frameact';
import type { JSX } from 'frameact/jsx-runtime';

import { ApiMessageEntityTypes } from '../../../api/types';

import buildClassName from '../../../util/buildClassName';

import useCollapsibleLines from '../../../hooks/element/useCollapsibleLines';

import Icon from '../icons/Icon';

import styles from './Blockquote.module.scss';

type OwnProps = {
  className?: string;
  contentClassName?: string;
  canBeCollapsible?: boolean;
  isToggleDisabled?: boolean;
  noInitialCollapse?: boolean;
  recalculationKey?: unknown;
  ignoredLines?: number;
  isCollapsed?: boolean;
  children: JSX.Element;
  onCollapseChange?: (isCollapsed: boolean) => void;
};

const MAX_LINES = 4;

const Blockquote = (props: OwnProps) => {
  let ref!: HTMLQuoteElement;
  const collapsibleLinesResult = createMemo(() => useCollapsibleLines(() => ref, MAX_LINES, {
    isDisabled: () => !props.canBeCollapsible,
    noInitialCollapse: () => props.noInitialCollapse,
    recalculationKey: () => props.recalculationKey,
    ignoredLines: () => props.ignoredLines,
    isCollapsed: () => props.isCollapsed,
    onCollapseChange: props.onCollapseChange,
  }));
  const isCollapsed = () => collapsibleLinesResult().isCollapsed;
  const isCollapsible = () => collapsibleLinesResult().isCollapsible;
  const setIsCollapsed = () => collapsibleLinesResult().setIsCollapsed;

  const shouldCollapse = createMemo(() => Boolean(props.canBeCollapsible && isCollapsed()));
  const hasCollapseIcon = createMemo(() => props.canBeCollapsible && isCollapsible());
  const canExpand = createMemo(() => !props.isToggleDisabled && shouldCollapse());

  const handleExpand = () => {
    setIsCollapsed()(false);
  };

  const handleToggle = () => {
    setIsCollapsed()((prev) => !prev);
  };

  return (
    <span
      class={buildClassName(styles.root, props.className, shouldCollapse() && styles.collapsed)}
      onClick={canExpand() ? handleExpand : undefined}
    >
      <blockquote
        class={buildClassName(styles.blockquote, props.contentClassName, hasCollapseIcon() && styles.withCollapseIcon)}
        ref={ref}
        data-entity-type={ApiMessageEntityTypes.Blockquote}
        data-collapsed={shouldCollapse() || undefined}
        contentEditable={shouldCollapse() ? false : undefined}
      >
        <div class={styles.gradientContainer} data-rich-copy-wrapper>
          {props.children}
        </div>
        {hasCollapseIcon() && (
          <div
            class={buildClassName(styles.collapseIcon, !props.isToggleDisabled && styles.clickable)}
            contentEditable={false}
            onClick={!props.isToggleDisabled ? handleToggle : undefined}
            aria-hidden
          >
            <Icon name={shouldCollapse() ? 'down' : 'up'} />
          </div>
        )}
      </blockquote>
    </span>
  );
};

export default Blockquote;
