import { createMemo } from 'frameact';
import { splitProps } from 'frameact/dom';

import buildClassName from '../../../util/buildClassName';

import styles from './Surface.module.scss';

type OwnProps = React.HTMLAttributes<HTMLDivElement> & {
  ref?: (el: HTMLDivElement) => void;
  scrollable?: boolean;
  noPadding?: boolean;
  children: React.ReactNode;
};

type BreakoutProps = React.HTMLAttributes<HTMLDivElement> & {
  ref?: (el: HTMLDivElement) => void;
  children: React.ReactNode;
};

const Surface = (props: OwnProps) => {
  const [, otherProps] = splitProps(props, ['ref', 'scrollable', 'noPadding', 'className', 'children']);
  const isScrollable = createMemo(() => Boolean(props.scrollable));

  return (
    <div
      ref={props.ref}
      class={buildClassName(
        styles.root,
        isScrollable() && 'custom-scroll',
        isScrollable() && styles.scrollable,
        props.noPadding && styles.noPadding,
        props.className,
      )}
      {...otherProps}
    >
      {props.children}
    </div>
  );
};

export const Breakout = (props: BreakoutProps) => {
  const [, otherProps] = splitProps(props, ['ref', 'className', 'children']);
  return (
    <div ref={props.ref} class={buildClassName(styles.breakout, props.className)} {...otherProps}>
      {props.children}
    </div>
  );
};

export default Surface;
