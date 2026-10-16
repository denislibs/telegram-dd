import { splitProps } from 'frameact/dom';

import type { OwnProps as AnimatedIconProps } from './AnimatedIcon';

import { createMediaTransition } from '../../lib/kit';
import buildClassName from '../../util/buildClassName';
import buildStyle from '../../util/buildStyle';

import useDynamicColorListener from '../../hooks/stickers/useDynamicColorListener';
import useFlag from '../../hooks/useFlag';

import AnimatedIcon from './AnimatedIcon';

import styles from './AnimatedIconWithPreview.module.scss';

type OwnProps = Partial<AnimatedIconProps> & {
  previewUrl?: string;
  thumbDataUri?: string;
  noPreviewTransition?: boolean;
  shouldUseTextColor?: boolean;
};

const ANIMATION_DURATION = 300;

const loadedPreviewUrls = new Set();

function AnimatedIconWithPreview(props: OwnProps) {
  const [, otherProps] = splitProps(props, [
    'previewUrl',
    'thumbDataUri',
    'className',
    'shouldUseTextColor',
    'noPreviewTransition',
  ]);

  let rootRef!: HTMLDivElement;
  const customColor = useDynamicColorListener(
    () => rootRef,
    undefined,
    () => !props.shouldUseTextColor,
  );

  const [isThumbOpen, , unmarkThumbOpen] = useFlag(Boolean(props.thumbDataUri));
  // Deviation: the transition classes are written through the element ref (`t.ref`), not a class string.
  const thumbTransition = createMediaTransition({ hasMediaData: () => Boolean(isThumbOpen()) });

  const [isPreviewOpen, markPreviewOpen, unmarkPreviewOpen] = useFlag(
    Boolean(props.noPreviewTransition) || loadedPreviewUrls.has(props.previewUrl),
  );
  const previewTransition = createMediaTransition({ hasMediaData: () => Boolean(isPreviewOpen()) });

  const [isAnimationReady, markAnimationReady] = useFlag(false);

  const handlePreviewLoad = () => {
    markPreviewOpen();
    loadedPreviewUrls.add(props.previewUrl);
  };

  const handleAnimationReady = () => {
    unmarkThumbOpen();
    unmarkPreviewOpen();
    setTimeout(markAnimationReady, ANIMATION_DURATION);
  };

  return (
    <div
      ref={rootRef}
      class={buildClassName(props.className, styles.root)}
      style={buildStyle(props.size !== undefined && `width: ${props.size}px; height: ${props.size}px;`)}
    >
      {props.thumbDataUri && !isAnimationReady() && (
        <img ref={thumbTransition.ref} src={props.thumbDataUri} class={styles.preview} draggable="false" />
      )}
      {props.previewUrl &&
        !isAnimationReady() &&
        (props.shouldUseTextColor ? (
          <div
            class={buildClassName(styles.preview, styles.textColorPreview)}
            style={`mask-image: url(${props.previewUrl})`}
          />
        ) : (
          <img
            ref={(el) => {
              if (!props.noPreviewTransition) previewTransition.ref(el);
            }}
            src={props.previewUrl}
            class={styles.preview}
            draggable="false"
            onLoad={handlePreviewLoad}
          />
        ))}
      {/* Without a color the sticker canvas would paint the original tgs colors before the filter appears */}
      {(!props.shouldUseTextColor || customColor()) && (
        <AnimatedIcon {...otherProps} color={customColor()} onLoad={handleAnimationReady} />
      )}
    </div>
  );
}

export default AnimatedIconWithPreview;
