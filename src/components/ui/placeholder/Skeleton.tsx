import { createMemo } from 'frameact';
import { mergeProps } from 'frameact/dom';

import buildClassName from '../../../util/buildClassName';
import buildStyle from '../../../util/buildStyle';

import './Skeleton.scss';

type OwnProps = {
  variant?: 'rectangular' | 'rounded-rect' | 'round';
  animation?: 'wave' | 'fast-wave' | 'pulse' | 'none';
  width?: number;
  height?: number;
  forceAspectRatio?: boolean;
  inline?: boolean;
  className?: string;
  style?: string;
};

const Skeleton = (rawProps: OwnProps) => {
  const props = mergeProps({ variant: 'rectangular', animation: 'none' }, rawProps) as OwnProps & Required<Pick<OwnProps, 'variant' | 'animation'>>;
  const classNames = createMemo(() => buildClassName('Skeleton', props.variant, props.animation, props.className, props.inline && 'inline'));
  const aspectRatio = createMemo(() => props.width && props.height ? `aspect-ratio: ${props.width}/${props.height}` : undefined);
  const computedStyle = createMemo(() => buildStyle(
    props.style,
    props.forceAspectRatio && aspectRatio(),
    Boolean(props.width) && `width: ${props.width}px`,
    !props.forceAspectRatio && Boolean(props.height) && `height: ${props.height}px`,
  ));
  return (
    <div class={classNames()} style={computedStyle()}>
      {props.inline && '\u00A0'}
    </div>
  );
};

export default Skeleton;
