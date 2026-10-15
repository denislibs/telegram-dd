import buildClassName from '../../util/buildClassName';

import styles from './Toggle.module.scss';

interface OwnProps {
  value: 'min' | 'mid' | 'max';
}

function Toggle(props: OwnProps) {
  return (
    <div class={buildClassName(styles.root, 'Toggle')} aria-hidden="true">
      <i class={buildClassName(styles.filler, styles[props.value])} />
      <i class={buildClassName(styles.widget, styles[props.value])} />
    </div>
  );
}

export default Toggle;
