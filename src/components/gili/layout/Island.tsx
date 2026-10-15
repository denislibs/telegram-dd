import { splitProps } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import buildClassName from '../../../util/buildClassName';

import styles from './Island.module.scss';

// Deviation: `React.HTMLAttributes` -> the JSX attributes of the runtime; `class` is not an own prop (`className` is).
type OwnProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'ref' | 'children' | 'class'> & {
  className?: string;
  children: JSX.Element;
  ref?: (el: HTMLDivElement) => void;
};

const Island = (props: OwnProps) => {
  const [, otherProps] = splitProps(props, ['ref', 'className', 'children']);
  return (
    <div ref={props.ref} class={buildClassName(styles.island, props.className)} {...otherProps}>
      {props.children}
    </div>
  );
};

const IslandDescription = (props: OwnProps) => {
  const [, otherProps] = splitProps(props, ['className', 'children']);
  return (
    <div class={buildClassName(styles.description, props.className)} {...otherProps}>
      {props.children}
    </div>
  );
};

const IslandTitle = (props: OwnProps) => {
  const [, otherProps] = splitProps(props, ['className', 'children']);
  return (
    <div class={buildClassName(styles.title, props.className)} {...otherProps}>
      {props.children}
    </div>
  );
};

const IslandOutside = (props: OwnProps) => {
  const [, otherProps] = splitProps(props, ['className', 'children']);
  return (
    <div class={buildClassName(styles.outside, props.className)} {...otherProps}>
      {props.children}
    </div>
  );
};

const IslandText = (props: OwnProps) => {
  const [, otherProps] = splitProps(props, ['className', 'children']);
  return (
    <div class={buildClassName(styles.text, props.className)} {...otherProps}>
      {props.children}
    </div>
  );
};

export default Island;
export { IslandOutside, IslandDescription, IslandTitle, IslandText };
