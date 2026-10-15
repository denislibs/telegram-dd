import { currentOrPrev } from 'frameact';

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
  // Deviation: tt's ShowTransition keeps the previous children while it closes; here the children are live, so the
  // text is kept until the badge has faded out.
  const text = currentOrPrev(() => props.text || undefined);

  return (
    <ShowTransition
      className={buildClassName(
        styles.root,
        props.isAlternateColor ? styles.alternate : styles.default,
        props.className,
      )}
      isOpen={Boolean(props.text)}
    >
      {text() && <AnimatedCounter text={text()!} />}
    </ShowTransition>
  );
};

export default Badge;
