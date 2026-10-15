import type { IconName } from '../../../types/icons';

import buildClassName from '../../../util/buildClassName';

import Icon from '../../common/icons/Icon';

import styles from './IconBackdrop.module.scss';

export type IconBackdropColor = 'blue' | 'gray' | 'green' | 'orange' | 'pink' | 'premium' | 'purple' | 'red';

type OwnProps = {
  color: IconBackdropColor;
  icon: IconName;
  className?: string;
};

const IconBackdrop = (props: OwnProps) => {
  return (
    <div class={buildClassName(styles.root, styles[props.color], props.className)}>
      <Icon name={props.icon} className={styles.icon} />
    </div>
  );
};

export default IconBackdrop;
