import { createMemo, createSignal } from 'frameact';
import { mergeProps, splitProps } from 'frameact/dom';
import { createMediaTransition } from '../../lib/kit';

import type { OwnProps as AnimatedStickerProps } from './AnimatedSticker';

import buildClassName from '../../util/buildClassName';

import useFlag from '../../hooks/useFlag';

import AnimatedSticker from './AnimatedSticker';

const DEFAULT_SIZE = 150;

export type OwnProps = Partial<AnimatedStickerProps> & { noTransition?: boolean; nonInteractive?: boolean };

function AnimatedIcon(rawProps: OwnProps) {
  const props = mergeProps({ size: DEFAULT_SIZE, play: true, noLoop: true }, rawProps) as OwnProps &
    Required<Pick<OwnProps, 'size' | 'play' | 'noLoop'>>;
  const [, otherProps] = splitProps(props, [
    'size',
    'play',
    'noLoop',
    'className',
    'noTransition',
    'nonInteractive',
    'onLoad',
    'onClick',
  ]);
  const [isAnimationLoaded, markAnimationLoaded] = useFlag(false);
  // TODO(codemod): useMediaTransitionDeprecated returned class names: apply the result through ref={t.ref} on the element
  const transitionClassNames = createMemo(() =>
    createMediaTransition({ hasMediaData: () => Boolean(props.noTransition || isAnimationLoaded()) }),
  );

  const handleLoad = () => {
    markAnimationLoaded();
    props.onLoad?.();
  };

  const [playKey, setPlayKey] = createSignal((() => String(Math.random()))());

  const handleClick = () => {
    if (props.play === true) {
      setPlayKey(String(Math.random()));
    }

    props.onClick?.();
  };

  return (
    <AnimatedSticker
      className={buildClassName(props.className, transitionClassNames())}
      size={props.size}
      play={props.play === true ? playKey() : props.play}
      noLoop={props.noLoop}
      onClick={!props.nonInteractive ? handleClick : undefined}
      onLoad={handleLoad}

      {...otherProps}
    />
  );
}

export default AnimatedIcon;
