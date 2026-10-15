import { requestMutation } from 'frameact';
import { Show } from 'frameact/dom';
import { createShowTransition } from '../../lib/kit';

import buildClassName from '../../util/buildClassName';

import useCanvasBlur from '../../hooks/useCanvasBlur';
import useLang from '../../hooks/useLang';

import Icon from './icons/Icon';

import styles from './MediaSpoiler.module.scss';

type OwnProps = {
  isVisible: boolean;
  withAnimation?: boolean;
  thumbDataUri?: string;
  isNsfw?: boolean;
  width?: number;
  height?: number;
  className?: string;
};

const BLUR_RADIUS = 25;
const ANIMATION_DURATION = 500;

const MediaSpoiler = (props: OwnProps) => {
  let ref!: HTMLDivElement;

  const lang = useLang();

  // TODO(codemod): useShowTransitionDeprecated returned class names: apply the result through ref={t.ref} on the element (transitionClassNames/hasOpenClass are gone)
  const { shouldRender, transitionClassNames } = createShowTransition({ isOpen: () => props.isVisible, noMountTransition: true, className: props.withAnimation ? false : undefined, closeDuration: ANIMATION_DURATION });
  const canvasRef = useCanvasBlur(() => props.thumbDataUri, !shouldRender(), undefined, BLUR_RADIUS, () => props.width, () => props.height);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref) return;
    const el = ref;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const shiftX = x - rect.width / 2;
    const shiftY = y - rect.height / 2;
    requestMutation(() => {
      el.setAttribute('style', `--click-shift-x: ${shiftX}px; --click-shift-y: ${shiftY}px`);
    });
  };

  return (
    <Show when={shouldRender()}>
    <div
      class={buildClassName(styles.root, transitionClassNames, props.className, props.withAnimation && styles.maskAnimation)}
      ref={ref}
      onClick={props.withAnimation ? handleClick : undefined}
    >
      <canvas ref={canvasRef} class={styles.canvas} width={props.width} height={props.height} />
      <div class={styles.dots} />
      {props.isNsfw && (
        <span class={styles.nsfw}>
          <Icon name="eye-crossed-outline" className={styles.nsfwIcon} />
          {lang('MediaSpoilerSensitive')}
        </span>
      )}
    </div>
    </Show>
  );
};

export default MediaSpoiler;
