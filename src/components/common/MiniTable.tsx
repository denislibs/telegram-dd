import { For } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import buildClassName from '../../util/buildClassName';

import styles from './MiniTable.module.scss';

export type TableEntry = [JSX.Element, JSX.Element];

type OwnProps = {
  data: TableEntry[];
  className?: string;
  style?: string;
  valueClassName?: string;
  keyClassName?: string;
};

const MiniTable = (props: OwnProps) => {
  return (
    <div class={buildClassName(styles.root, props.className)} style={props.style}>
      <For each={props.data}>
        {([key, value]) => (
          <>
            <div class={buildClassName(styles.key, props.keyClassName)}>{key}</div>
            <div class={buildClassName(styles.value, props.valueClassName)}>{value}</div>
          </>
        )}
      </For>
    </div>
  );
};

export default MiniTable;
