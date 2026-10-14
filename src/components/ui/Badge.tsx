import buildClassName from '../../util/buildClassName';

import AnimatedCounter from '../common/AnimatedCounter';
import ShowTransition from './ShowTransition';

import styles from './Badge.module.scss';

type OwnProps = {
  text?: string;
  className?: string;
  isAlternateColor?: boolean;
};

const Badge = (props: OwnProps) => {
  return (
    <ShowTransition
      className={buildClassName(
        styles.root,
        props.isAlternateColor ? styles.alternate : styles.default,
        props.className,
      )}
      isOpen={Boolean(props.text)}
    >
      {props.text && <AnimatedCounter text={props.text} />}
    </ShowTransition>
  );
};

export default Badge;
