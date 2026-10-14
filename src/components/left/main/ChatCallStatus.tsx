import buildClassName from '../../../util/buildClassName';

import styles from './ChatCallStatus.module.scss';

type OwnProps = {
  isSelected?: boolean;
  isActive?: boolean;
  isMobile?: boolean;
};

const ChatCallStatus = (props: OwnProps) => {
  return (
    <div
      class={buildClassName(
        styles.root,
        props.isActive && styles.active,
        props.isSelected && !props.isMobile && styles.selected,
      )}
    >
      <div class={styles.indicator}>
        <div class={styles.indicatorInner} />
        <div class={styles.indicatorInner} />
        <div class={styles.indicatorInner} />
      </div>
    </div>
  );
};

export default ChatCallStatus;
