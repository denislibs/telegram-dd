import type { JSX } from 'frameact/jsx-runtime';

import buildClassName from '../../../util/buildClassName';

import styles from './RichEditorTooltipContainer.module.scss';

type OwnProps = {
  isOpen: boolean;
  children: JSX.Element;
};

const RichEditorTooltipPanel = (props: OwnProps) => {
  return <div class={buildClassName(styles.fade, props.isOpen && styles.open)}>{props.children}</div>;
};

export default RichEditorTooltipPanel;
