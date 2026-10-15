import type { JSX } from 'frameact/jsx-runtime';

import buildClassName from '../../util/buildClassName';

import styles from './BadgeButton.module.scss';

type OwnProps = {
  children: JSX.Element;
  className?: string;
  isPlain?: boolean;
  inline?: boolean;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void;
};

const BadgeButton = (props: OwnProps) => {
  return (
    <div
      class={buildClassName(
        styles.root,
        props.isPlain && styles.plain,
        props.onClick && styles.clickable,
        props.inline && styles.inline,
        props.className,
      )}
      onClick={(e) => props.onClick?.(e)}
      onMouseDown={(e) => props.onMouseDown?.(e)}
    >
      {props.children}
    </div>
  );
};

export default BadgeButton;
