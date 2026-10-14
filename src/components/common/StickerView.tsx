import { type Accessor, createMemo, createSignal, getIsHeavyAnimating, onMount } from 'frameact';
import { mergeProps, Show } from 'frameact/dom';
import { useGlobal } from '../../global';

import type { ApiSticker } from '../../api/types';
import type { ObserveFn } from '../../hooks/useIntersectionObserver';

import { createMediaTransition } from '../../lib/kit';
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
import useUniqueId from '../../hooks/useUniqueId';
import useDevicePixelRatio from '../../hooks/window/useDevicePixelRatio';

import OptimizedVideo from '../ui/OptimizedVideo';
import AnimatedSticker from './AnimatedSticker';

import styles from './StickerView.module.scss';

type OwnProps = {
  containerRef: Accessor<HTMLDivElement | undefined>;
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
  sharedCanvasRef?: Accessor<HTMLCanvasElement | undefined>;
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
  const id = () => props.sticker.id;
  const isLottie = () => props.sticker.isLottie;
  const stickerSetInfo = () => props.sticker.stickerSetInfo;
  const emoji = () => props.sticker.emoji;
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
  const shouldLoad = createMemo(() => isIntersectingForLoading() && !props.noLoad);
  const isIntersectingForPlayingRaw = useIsIntersecting(props.containerRef, () => props.observeIntersectionForPlaying);
  const isIntersectingForPlaying = createMemo(() => isIntersectingForPlayingRaw() && isIntersectingForLoading());
  const shouldPlay = createMemo(() => isIntersectingForPlaying() && !props.noPlay);
  let hasIntersectedForPlayingRef = isIntersectingForPlaying();
  // Deviation: tt updated this ref on every render; here a memo keeps it sticky and is read by `isReadyToMountFullMedia`.
  const hasIntersectedForPlaying = createMemo(() => {
    if (!hasIntersectedForPlayingRef && isIntersectingForPlaying()) {
      hasIntersectedForPlayingRef = true;
    }
    return hasIntersectedForPlayingRef;
  });

  // Deviation: read again only when the hash changes (`previewMediaData` below covers a preview loaded later).
  const cachedPreview = createMemo(() => mediaLoader.getFromMemory(previewMediaHash()));
  // Deviation: `useMountAfterHeavyAnimation` is an inline signal. tt checked once on mount (next frame) and, if an
  // animation was running, stayed unmounted for good; here the signal is also set when that animation ends.
  const [hasNoHeavyAnimation, setNoHeavyAnimation] = createSignal(false);
  onMount(() => {
    if (!getIsHeavyAnimating()) {
      setNoHeavyAnimation(true);
    } else {
      getIsHeavyAnimating.once(() => setNoHeavyAnimation(true));
    }
  });
  const isMountedAfterHeavyAnimation = () => hasNoHeavyAnimation() && hasIntersectedForPlaying();
  const isReadyToMountFullMedia = createMemo(() =>
    props.forceOnHeavyAnimation ? hasIntersectedForPlaying() : isMountedAfterHeavyAnimation(),
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
  const previewMediaData = useMedia(previewMediaHash, () => !shouldLoadPreview());
  const withPreview = createMemo(() => !props.skipPreview && (shouldLoadPreview() || cachedPreview()));
  const fullMediaHashForLoad = createMemo(() => props.fullMediaHash || getStickerMediaHash(props.sticker, 'inline'));

  const shouldSkipLoadingFullMedia = createMemo(() =>
    Boolean(
      shouldForcePreview() ||
      (fullMediaHashForLoad() === previewMediaHash() && (cachedPreview() || previewMediaData())),
    ),
  );
  const fullMediaData = useMedia(fullMediaHashForLoad, () => !shouldLoad() || shouldSkipLoadingFullMedia());
  const shouldRenderFullMedia = createMemo(
    () => isReadyToMountFullMedia() && Boolean(fullMediaData()) && !isVideoBroken(),
  );
  const [isPlayerReady, markPlayerReady] = useFlag();
  const isFullMediaReady = createMemo(() => shouldRenderFullMedia() && (isStatic() || isPlayerReady()));

  const thumbDataUri = useThumbnail(() => props.sticker.thumbnail);
  const thumbData = createMemo(() =>
    !props.skipPreview ? cachedPreview() || previewMediaData() || thumbDataUri() : undefined,
  );
  const isThumbOpaque = createMemo(() => props.sharedCanvasRef && !props.withTranslucentThumb);

  const noCrossTransition = createMemo(() => Boolean(isLottie() && withPreview()));
  const { ref: thumbRef } = createMediaTransition({
    hasMediaData: () => Boolean(thumbData() && !isFullMediaReady()),
    noCloseTransition: noCrossTransition,
  });
  const { ref: fullMediaRef } = createMediaTransition({
    hasMediaData: isFullMediaReady,
    noOpenTransition: noCrossTransition,
  });

  const coords = useCoordsInSharedCanvas(props.containerRef, props.sharedCanvasRef);

  // Preload preview for Message Input and local message
  useMedia(previewMediaHash, () => !shouldLoad() || !props.shouldPreloadPreview);

  const renderId = createMemo(() =>
    [
      props.withSharedAnimation ? SHARED_PREFIX : randomIdPrefix,
      id(),
      props.size,
      props.withSharedAnimation ? props.customColor : undefined,
      dpr(),
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
        style={filterStyle()}
        alt=""
        draggable={false}
      />
      {shouldRenderFullMedia() &&
        (isLottie() ? (
          <Show when={renderId()} keyed>
            {() => (
              <AnimatedSticker
                ref={fullMediaRef}
                renderId={renderId()}
                size={props.size}
                className={buildClassName(
                  styles.media,
                  (noCrossTransition() || isThumbOpaque()) && styles.noTransition,
                  props.fullMediaClassName,
                )}
                tgsUrl={fullMediaData()}
                play={shouldPlay()}
                seekToEnd={props.forceAnimatedStickerOnEnd}
                noLoop={!props.shouldLoop}
                forceOnHeavyAnimation={props.forceAlways || props.forceOnHeavyAnimation}
                forceAlways={props.forceAlways}
                isLowPriority={props.isSmall && !selectIsAlwaysHighPriorityEmoji(useGlobal(), stickerSetInfo())}
                sharedCanvas={props.sharedCanvasRef?.() || undefined}
                sharedCanvasCoords={coords()}
                onLoad={handleAnimatedStickerLoad}
                onLoop={props.onAnimatedStickerLoop}
                onEnded={props.onAnimatedStickerLoop}
                onFrame={props.onAnimatedStickerFrame}
                color={props.customColor}
              />
            )}
          </Show>
        ) : isVideo() ? (
          <OptimizedVideo
            ref={fullMediaRef}
            canPlay={shouldPlay()}
            className={buildClassName(styles.media, props.fullMediaClassName, 'sticker-media')}
            src={fullMediaData()}
            playsInline
            muted
            loop={props.shouldLoop && !props.loopLimit}
            isPriority={props.forceAlways}
            disablePictureInPicture
            onReady={markPlayerReady}
            onBroken={markVideoBroken}
            onEnded={props.onVideoEnded}
            style={filterStyle()}
          />
        ) : (
          <img
            ref={fullMediaRef}
            class={buildClassName(styles.media, props.fullMediaClassName, 'sticker-media')}
            src={fullMediaData()}
            alt={emoji()}
            style={filterStyle()}
            draggable={false}
          />
        ))}
    </>
  );
};

export default StickerView;
