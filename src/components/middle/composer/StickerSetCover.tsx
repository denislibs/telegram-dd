import { createEffect, createMemo } from 'frameact';
import { mergeProps } from 'frameact/dom';
import { getActions, getGlobal } from '../../../global';
import { createMediaTransition } from '../../../lib/kit';
import { depsOf } from '../../../util/effectDeps';

import type { ApiStickerSet } from '../../../api/types';

import { STICKER_SIZE_PICKER_HEADER } from '../../../config';
import { getStickerMediaHash } from '../../../global/helpers';
import { selectIsAlwaysHighPriorityEmoji } from '../../../global/selectors';
import { IS_WEBM_SUPPORTED } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';

import useColorFilter from '../../../hooks/stickers/useColorFilter';
import useDynamicColorListener from '../../../hooks/stickers/useDynamicColorListener';
import useCoordsInSharedCanvas from '../../../hooks/useCoordsInSharedCanvas';
import { useIsIntersecting } from '../../../hooks/useIntersectionObserver';
import useMedia from '../../../hooks/useMedia';
import useCustomEmoji from '../../common/hooks/useCustomEmoji';

import AnimatedSticker from '../../common/AnimatedSticker';
import CustomEmoji from '../../common/CustomEmoji';
import OptimizedVideo from '../../ui/OptimizedVideo';

import styles from './StickerSetCover.module.scss';

type OwnProps = {
  stickerSet: ApiStickerSet;
  size?: number;
  noPlay?: boolean;
  forcePlayback?: boolean;
  observeIntersection: ObserveFn;
  sharedCanvasRef?: (el: HTMLCanvasElement) => void;
};

const StickerSetCover = (rawProps: OwnProps) => {
  const props = mergeProps({ size: STICKER_SIZE_PICKER_HEADER }, rawProps) as OwnProps &
    Required<Pick<OwnProps, 'size'>>;
  const { loadStickers } = getActions();
  let containerRef!: HTMLDivElement;

  const source = createMemo(() => props.stickerSet);
  const hasThumbnail = () => source().hasThumbnail;
  const hasVideoThumb = () => source().hasVideoThumb;
  const hasAnimatedThumb = () => source().hasAnimatedThumb;
  const hasStaticThumb = () => source().hasStaticThumb;
  const thumbCustomEmojiId = () => source().thumbCustomEmojiId;

  const customEmojiResult = createMemo(() => useCustomEmoji(() => thumbCustomEmojiId()));
  const customEmoji = () => customEmojiResult().customEmoji;
  const hasCustomColor = createMemo(() => customEmoji()?.shouldUseTextColor);
  const customColor = useDynamicColorListener(
    () => containerRef,
    undefined,
    () => !hasCustomColor(),
  );
  const colorFilter = useColorFilter(customColor);

  const isIntersecting = useIsIntersecting(
    () => containerRef,
    () => props.observeIntersection,
  );
  const shouldPlay = createMemo(() => isIntersecting && !props.noPlay);

  const shouldFallbackToSticker = createMemo(
    () => !hasThumbnail() || (hasVideoThumb() && !IS_WEBM_SUPPORTED && !hasAnimatedThumb() && !hasStaticThumb()),
  );
  const fallbackSticker = createMemo(() => (shouldFallbackToSticker() ? props.stickerSet.stickers?.[0] : undefined));

  const mediaHash = createMemo(
    () => ((hasThumbnail() && !fallbackSticker()) || hasAnimatedThumb()) && `stickerSet${props.stickerSet.id}`,
  );
  const mediaData = useMedia(() => mediaHash(), !isIntersecting);
  const fallbackStickerHash = createMemo(() => fallbackSticker() && getStickerMediaHash(fallbackSticker(), 'preview'));
  const fallbackStickerMediaData = useMedia(() => fallbackStickerHash(), !isIntersecting);

  const isReady = createMemo(() => thumbCustomEmojiId() || mediaData || fallbackStickerMediaData);
  const thumbDataUri = createMemo(() => props.stickerSet.thumbnail?.dataUri || fallbackSticker()?.thumbnail?.dataUri);
  // TODO(codemod): useMediaTransitionDeprecated returned class names: apply the result through ref={t.ref} on the element
  const transitionClassNames = createMemo(() => createMediaTransition({ hasMediaData: () => Boolean(isReady()) }));

  const coords = useCoordsInSharedCanvas(() => containerRef, props.sharedCanvasRef);

  createEffect(
    depsOf(() => [isIntersecting, shouldFallbackToSticker(), loadStickers, props.stickerSet] as const),
    ([, shouldFallbackToSticker2, , stickerSet2]) => {
      if (isIntersecting && shouldFallbackToSticker2 && !stickerSet2.stickers?.length) {
        loadStickers({
          stickerSetInfo: stickerSet2,
        });
      }
    },
  );

  return (
    <div ref={containerRef} class={buildClassName(styles.root, 'sticker-set-cover')} style={`--_size: ${props.size}px`}>
      {isReady() ? (
        thumbCustomEmojiId() ? (
          <CustomEmoji
            documentId={thumbCustomEmojiId()}
            size={props.size}
            observeIntersectionForPlaying={props.observeIntersection}
            noPlay={props.noPlay}
          />
        ) : hasAnimatedThumb() ? (
          // TODO(codemod): getGlobal() in a memo / JSX is a one-time read: use useGlobal() (store contract §12.4)
          <AnimatedSticker
            className={transitionClassNames()}
            tgsUrl={mediaData}
            size={props.size}
            play={shouldPlay()}
            isLowPriority={!selectIsAlwaysHighPriorityEmoji(getGlobal(), props.stickerSet)}
            sharedCanvas={props.sharedCanvasRef?.current || undefined}
            sharedCanvasCoords={coords}
            forceAlways={props.forcePlayback}
          />
        ) : hasVideoThumb() && !shouldFallbackToSticker() ? (
          <OptimizedVideo
            className={buildClassName(styles.video, transitionClassNames())}
            src={mediaData}
            canPlay={shouldPlay()}
            style={colorFilter}
            isPriority={props.forcePlayback}
            loop
            disablePictureInPicture
          />
        ) : (
          <img
            src={mediaData || fallbackStickerMediaData}
            style={colorFilter}
            class={buildClassName(styles.image, transitionClassNames())}
            alt=""
            draggable={false}
          />
        )
      ) : thumbDataUri() ? (
        <img src={thumbDataUri()} class={styles.image} alt="" draggable={false} />
      ) : undefined}
    </div>
  );
};

export default StickerSetCover;
