import type { JSX } from 'frameact/jsx-runtime';

import buildClassName from '../../../util/buildClassName';
import buildStyle from '../../../util/buildStyle';

import Sparkles from '../Sparkles';

import styles from './GiftEffectWrapper.module.scss';

type OwnProps = {
  children: JSX.Element;
  ref?: (el: HTMLDivElement) => void;
  className?: string;
  style?: string;
  withSparkles?: boolean;
  sparklesClassName?: string;
  sparklesColor?: string;
  glowColor?: string;
  onClick?: NoneToVoidFunction;
};

const GiftEffectWrapper = (props: OwnProps) => {
  let containerRef!: HTMLDivElement;
  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (props.ref) {
    // TODO(codemod): "containerRef" was a ref object and is reassigned here (a forwarded ref?): use a callback ref
    containerRef = props.ref;
  }

  return (
    <div
      ref={containerRef}
      class={buildClassName(styles.root, props.className)}
      style={buildStyle(props.glowColor && `--glow-color: ${props.glowColor}`, props.style)}
      onClick={(e) => props.onClick?.(e)}
    >
      {props.withSparkles && (
        <Sparkles
          preset="button"
          className={buildClassName(styles.sparkles, props.sparklesClassName)}
          style={buildStyle(props.sparklesColor && `color: ${props.sparklesColor}`)}
        />
      )}
      {props.children}
    </div>
  );
};

export default GiftEffectWrapper;
