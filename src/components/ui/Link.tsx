import buildClassName from '../../util/buildClassName';

import styles from './Link.module.scss';

type OwnProps = {
  children: React.ReactNode;
  className?: string;
  isRtl?: boolean;
  isPrimary?: boolean;
  withMultilineFix?: boolean;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
};

const Link = (props: OwnProps) => {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    props.onClick!(e);
  };

  return (
    <a
      href="#"
      class={buildClassName('Link', styles.link, props.className, props.isPrimary && styles.isPrimary)}
      dir={!props.withMultilineFix ? (props.isRtl ? 'rtl' : 'auto') : undefined}
      onClick={props.onClick ? handleClick : undefined}
    >
      {props.children}
    </a>
  );
};

export default Link;
