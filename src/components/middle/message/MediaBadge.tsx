import { createMemo } from 'frameact';
import { mergeProps } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import buildClassName from '../../../util/buildClassName';

import styles from './MediaBadge.module.scss';

type OwnProps = {
  ref?: (el: HTMLDivElement) => void;
  children: JSX.Element;
  className?: string;
  position?: 'left' | 'right';
};

const MediaBadge = (rawProps: OwnProps) => {
  const props = mergeProps({ position: 'left' }, rawProps) as OwnProps & Required<Pick<OwnProps, 'position'>>;
  const fullClassName = createMemo(() =>
    buildClassName(styles.badge, props.position === 'right' && styles.right, props.className),
  );

  return (
    <div ref={props.ref} class={fullClassName()}>
      {props.children}
    </div>
  );
};

export default MediaBadge;
