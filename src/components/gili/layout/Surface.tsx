import { createMemo } from 'frameact';
import { splitProps } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import buildClassName from '../../../util/buildClassName';

import styles from './Surface.module.scss';

// Deviation: `React.HTMLAttributes` -> the JSX attributes of the runtime; `class` is not an own prop (`className` is).
type OwnProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'ref' | 'children' | 'class'> & {
  ref?: (el: HTMLDivElement) => void;
  className?: string;
  scrollable?: boolean;
  noPadding?: boolean;
  children: JSX.Element;
};

type BreakoutProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'ref' | 'children' | 'class'> & {
  ref?: (el: HTMLDivElement) => void;
  className?: string;
  children: JSX.Element;
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
