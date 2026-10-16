import type { JSX } from 'frameact/jsx-runtime';

import buildClassName from '../../../util/buildClassName';

import Icon from '../icons/Icon';

import styles from './Pullquote.module.scss';

type OwnProps = {
  className?: string;
  children: JSX.Element;
};

const Pullquote = (props: OwnProps) => {
  return (
    <aside class={buildClassName(styles.root, 'pullquote', props.className)} data-pullquote>
      <Icon name="quote-open" className={buildClassName(styles.quote, styles.quoteOpen)} />
      <div class={styles.content} data-rich-copy-wrapper>
        {props.children}
      </div>
      <Icon name="quote-close" className={buildClassName(styles.quote, styles.quoteClose)} />
    </aside>
  );
};

export default Pullquote;
