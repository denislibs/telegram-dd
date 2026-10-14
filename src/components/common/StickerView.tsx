import { createMemo } from 'frameact';
import { mergeProps } from 'frameact/dom';
import { getGlobal } from '../../global';
import { createMediaTransition } from '../../lib/kit';

import type { ApiSticker } from '../../api/types';

import { getStickerMediaHash } from '../../global/helpers';
import { selectIsAlwaysHighPriorityEmoji } from '../../global/selectors';
import { IS_ANDROID, IS_IOS, IS_WEBM_SUPPORTED } from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';
import * as mediaLoader from '../../util/mediaLoader';

import useThumbnail from '../../hooks/media/useThumbnail';
import useColorFilter from '../../hooks/stickers/useColorFilter';
import useCoordsInSharedCanvas from '../../hooks/useCoordsInSharedCanvas';
import useFlag from '../../hooks/useFlag';
import { useIsIntersecting } from '../../hooks/useIntersectionObserver';
import useMedia from '../../hooks/useMedia';
import useMountAfterHeavyAnimation from '../../hooks/useMountAfterHeavyAnimation';
import useUniqueId from '../../hooks/useUniqueId';
import useDevicePixelRatio from '../../hooks/window/useDevicePixelRatio';

import OptimizedVideo from '../ui/OptimizedVideo';
import AnimatedSticker from './AnimatedSticker';

import styles from './StickerView.module.scss';

type OwnProps = {
  containerRef: (el: HTMLDivElement) => void;
  sticker: ApiSticker;
  thumbClassName?: string;
  fullMediaHash?: string;
  fullMediaClassName?: string;
  isSmall?: boolean;
  size?: number;
  customColor?: string;
  loopLimit?: number;
  shouldLoop?: boolean;
  shouldPreloadPreview?: boolean;
  skipPreview?: boolean;
  forceAlways?: boolean;
  forceOnHeavyAnimation?: boolean;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  noLoad?: boolean;
  noPlay?: boolean;
  forceAnimatedStickerOnEnd?: boolean;
  noVideoOnMobile?: boolean;
  withSharedAnimation?: boolean;
  sharedCanvasRef?: (el: HTMLCanvasElement) => void;
  withTranslucentThumb?: boolean; // With shared canvas thumbs are opaque by default to provide better transition effect
  onVideoEnded?: AnyToVoidFunction;
  onAnimatedStickerLoop?: AnyToVoidFunction;
  onAnimatedStickerFrame?: (frame: number) => void;
  onAnimatedStickerLoad?: AnyToVoidFunction;
};

const SHARED_PREFIX = 'shared';
const STICKER_SIZE = 24;

const StickerView = (rawProps: OwnProps) => {
  const props = mergeProps({ size: STICKER_SIZE, shouldLoop: false }, rawProps) as OwnProps &
    Required<Pick<OwnProps, 'size' | 'shouldLoop'>>;
  const source = createMemo(() => props.sticker);
  const id = () => source().id;
  const isLottie = () => source().isLottie;
  const stickerSetInfo = () => source().stickerSetInfo;
  const emoji = () => source().emoji;
  const [isVideoBroken, markVideoBroken] = useFlag();
  const isUnsupportedVideo = createMemo(
    () => props.sticker.isVideo && (!IS_WEBM_SUPPORTED || (props.noVideoOnMobile && (IS_IOS || IS_ANDROID))),
  );
  const isVideo = createMemo(() => props.sticker.isVideo);
  const isStatic = createMemo(() => !isLottie() && !isVideo());
  const previewMediaHash = createMemo(() => getStickerMediaHash(props.sticker, 'preview'));

  const dpr = useDevicePixelRatio();
  const randomIdPrefix = useUniqueId();

  const filterStyle = useColorFilter(() => props.customColor);

  const isIntersectingForLoading = useIsIntersecting(props.containerRef, () => props.observeIntersectionForLoading);
  const shouldLoad = createMemo(() => isIntersectingForLoading && !props.noLoad);
  const isIntersectingForPlaying = createMemo(
    () => useIsIntersecting(props.containerRef, () => props.observeIntersectionForPlaying) && isIntersectingForLoading,
  );
  const shouldPlay = createMemo(() => isIntersectingForPlaying() && !props.noPlay);
  let hasIntersectedForPlayingRef = isIntersectingForPlaying();
  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (!hasIntersectedForPlayingRef && isIntersectingForPlaying()) {
    hasIntersectedForPlayingRef = true;
  }

  const cachedPreview = createMemo(() => mediaLoader.getFromMemory(previewMediaHash()));
  // TODO(codemod): useMountAfterHeavyAnimation: deferUntilIdle(scope, () => <Heavy/>, placeholder)
  const isMountedAfterHeavyAnimation = useMountAfterHeavyAnimation(hasIntersectedForPlayingRef);
  const isReadyToMountFullMedia = createMemo(() =>
    props.forceOnHeavyAnimation ? hasIntersectedForPlayingRef : isMountedAfterHeavyAnimation,
  );
  const shouldForcePreview = createMemo(
    () => !props.skipPreview && (isUnsupportedVideo() || (isStatic() ? props.isSmall : props.noPlay)),
  );
  const shouldLoadPreview = createMemo(
    () =>
      !props.skipPreview &&
      (!props.customColor || shouldForcePreview()) &&
      !cachedPreview() &&
      (!isReadyToMountFullMedia() || shouldForcePreview()),
  );
  const previewMediaData = useMedia(
    () => previewMediaHash(),
    () => !shouldLoadPreview(),
  );
  const withPreview = createMemo(() => !props.skipPreview && (shouldLoadPreview() || cachedPreview()));
  const fullMediaHashForLoad = createMemo(() => props.fullMediaHash || getStickerMediaHash(props.sticker, 'inline'));

  const shouldSkipLoadingFullMedia = createMemo(() =>
    Boolean(
      shouldForcePreview() || (fullMediaHashForLoad() === previewMediaHash() && (cachedPreview() || previewMediaData)),
    ),
  );
  const fullMediaData = useMedia(
    () => fullMediaHashForLoad(),
    () => !shouldLoad() || shouldSkipLoadingFullMedia(),
  );
  const shouldRenderFullMedia = createMemo(
    () => isReadyToMountFullMedia() && Boolean(fullMediaData) && !isVideoBroken(),
  );
  const [isPlayerReady, markPlayerReady] = useFlag();
  const isFullMediaReady = createMemo(() => shouldRenderFullMedia() && (isStatic() || isPlayerReady()));

  const thumbDataUri = useThumbnail(() => props.sticker.thumbnail);
  const thumbData = createMemo(() =>
    !props.skipPreview ? cachedPreview() || previewMediaData || thumbDataUri : undefined,
  );
  const isThumbOpaque = createMemo(() => props.sharedCanvasRef && !props.withTranslucentThumb);

  const noCrossTransition = createMemo(() => Boolean(isLottie() && withPreview()));
  const { ref: thumbRef } = createMediaTransition({
    hasMediaData: () => Boolean(thumbData() && !isFullMediaReady()),
    noCloseTransition: () => noCrossTransition(),
  });
  const { ref: fullMediaRef } = createMediaTransition({
    hasMediaData: () => isFullMediaReady(),
    noOpenTransition: () => noCrossTransition(),
  });

  const coords = useCoordsInSharedCanvas(props.containerRef, props.sharedCanvasRef);

  // Preload preview for Message Input and local message
  useMedia(
    () => previewMediaHash(),
    () => !shouldLoad() || !props.shouldPreloadPreview,
  );

  const renderId = createMemo(() =>
    [
      props.withSharedAnimation ? SHARED_PREFIX : randomIdPrefix,
      id(),
      props.size,
      props.withSharedAnimation ? props.customColor : undefined,
      dpr,
    ]
      .filter(Boolean)
      .join('_'),
  );

  const handleAnimatedStickerLoad = () => {
    props.onAnimatedStickerLoad?.();
    markPlayerReady();
  };

  return (
    <>
      <img
        ref={thumbRef}
        src={thumbData()}
        class={buildClassName(
          styles.thumb,
          noCrossTransition() && styles.noTransition,
          isThumbOpaque() && styles.thumbOpaque,
          props.thumbClassName,
          'sticker-media',
        )}
        style={filterStyle}
        alt=""
        draggable={false}
      />
      {shouldRenderFullMedia() &&
        (isLottie() ? (
          // TODO(codemod): getGlobal() in a memo / JSX is a one-time read: use useGlobal() (store contract §12.4)
          // TODO(codemod): key= on a single element remounted it: wrap in <Show when={key} keyed>{() => …}</Show>
          <AnimatedSticker
            ref={fullMediaRef as (el: HTMLDivElement) => void}
            key={renderId()}
            renderId={renderId()}
            size={props.size}
            className={buildClassName(
              styles.media,
              (noCrossTransition() || isThumbOpaque()) && styles.noTransition,
              props.fullMediaClassName,
            )}
            tgsUrl={fullMediaData}
            play={shouldPlay()}
            seekToEnd={props.forceAnimatedStickerOnEnd}
            noLoop={!props.shouldLoop}
            forceOnHeavyAnimation={props.forceAlways || props.forceOnHeavyAnimation}
            forceAlways={props.forceAlways}
            isLowPriority={props.isSmall && !selectIsAlwaysHighPriorityEmoji(getGlobal(), stickerSetInfo())}
            sharedCanvas={props.sharedCanvasRef?.current || undefined}
            sharedCanvasCoords={coords}
            onLoad={handleAnimatedStickerLoad}
            onLoop={props.onAnimatedStickerLoop}
            onEnded={props.onAnimatedStickerLoop}
            onFrame={props.onAnimatedStickerFrame}
            color={props.customColor}
          />
        ) : isVideo() ? (
          <OptimizedVideo
            ref={fullMediaRef as (el: HTMLVideoElement) => void}
            canPlay={shouldPlay()}
            className={buildClassName(styles.media, props.fullMediaClassName, 'sticker-media')}
            src={fullMediaData}
            playsInline
            muted
            loop={props.shouldLoop && !props.loopLimit}
            isPriority={props.forceAlways}
            disablePictureInPicture
            onReady={markPlayerReady}
            onBroken={markVideoBroken}
            onEnded={props.onVideoEnded}
            style={filterStyle}
          />
        ) : (
          <img
            ref={fullMediaRef as (el: HTMLImageElement) => void}
            class={buildClassName(styles.media, props.fullMediaClassName, 'sticker-media')}
            src={fullMediaData}
            alt={emoji()}
            style={filterStyle}
            draggable={false}
          />
        ))}
    </>
  );
};

export default StickerView;
