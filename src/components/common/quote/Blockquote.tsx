import { createMemo } from 'frameact';
import { Show } from 'frameact/dom';
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
  let toggleElement: HTMLDivElement | undefined;
  const { isCollapsed, isCollapsible, setIsCollapsed } = useCollapsibleLines(() => ref, MAX_LINES, {
    isDisabled: () => !props.canBeCollapsible,
    noInitialCollapse: () => props.noInitialCollapse,
    recalculationKey: () => props.recalculationKey,
    ignoredLines: () => props.ignoredLines,
    isCollapsed: () => props.isCollapsed,
    onCollapseChange: (isCollapsed2) => props.onCollapseChange?.(isCollapsed2),
  });

  const shouldCollapse = createMemo(() => Boolean(props.canBeCollapsible && isCollapsed()));
  const hasCollapseIcon = createMemo(() => props.canBeCollapsible && isCollapsible());
  const canExpand = createMemo(() => !props.isToggleDisabled && shouldCollapse());

  const handleExpand = () => {
    setIsCollapsed(false);
  };

  const handleToggle = () => {
    setIsCollapsed((prev) => !prev);
  };

  // Deviation: `contenteditable` is an attribute with a string value; `contentEditable={false}` writes no attribute at all.
  // Deviation: a handler prop of an element is bound once, so tt's `canExpand ? handleExpand : undefined` is checked in the
  // handler. `canExpand` is read at the click here, while tt had the value of the last render: a click on the toggle of an
  // expanded quote collapses it, and must not expand it again on its way up to this handler (in tt: `canExpand` was false).
  return (
    <span
      class={buildClassName(styles.root, props.className, shouldCollapse() && styles.collapsed)}
      onClick={(e) => {
        if (toggleElement?.contains(e.target)) return;
        if (canExpand()) handleExpand();
      }}
    >
      <blockquote
        class={buildClassName(styles.blockquote, props.contentClassName, hasCollapseIcon() && styles.withCollapseIcon)}
        ref={ref}
        data-entity-type={ApiMessageEntityTypes.Blockquote}
        data-collapsed={shouldCollapse() || undefined}
        contenteditable={shouldCollapse() ? 'false' : undefined}
      >
        <div class={styles.gradientContainer} data-rich-copy-wrapper>
          {props.children}
        </div>
        <Show when={hasCollapseIcon()}>
          <div
            ref={toggleElement}
            class={buildClassName(styles.collapseIcon, !props.isToggleDisabled && styles.clickable)}
            contenteditable="false"
            onClick={() => {
              if (!props.isToggleDisabled) handleToggle();
            }}
            aria-hidden="true"
          >
            <Icon name={shouldCollapse() ? 'down' : 'up'} />
          </div>
        </Show>
      </blockquote>
    </span>
  );
};

export default Blockquote;
