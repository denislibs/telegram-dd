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
  return (
    <div
      ref={(node) => props.ref?.(node)}
      class={buildClassName(styles.root, props.className)}
      style={buildStyle(props.glowColor && `--glow-color: ${props.glowColor}`, props.style)}
      onClick={() => props.onClick?.()}
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
