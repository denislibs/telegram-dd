import { type Accessor, createEffect, createMemo } from 'frameact';
import { mergeProps } from 'frameact/dom';
import { getActions, useGlobal } from '../../../global';

import type { ApiStickerSet } from '../../../api/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';

import { STICKER_SIZE_PICKER_HEADER } from '../../../config';
import { createMediaTransition } from '../../../lib/kit';
import { getStickerMediaHash } from '../../../global/helpers';
import { selectIsAlwaysHighPriorityEmoji } from '../../../global/selectors';
import { IS_WEBM_SUPPORTED } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import { depsOf } from '../../../util/effectDeps';

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
  sharedCanvasRef?: Accessor<HTMLCanvasElement | undefined>;
};

const StickerSetCover = (rawProps: OwnProps) => {
  const props = mergeProps({ size: STICKER_SIZE_PICKER_HEADER }, rawProps) as OwnProps &
    Required<Pick<OwnProps, 'size'>>;
  const { loadStickers } = getActions();
  const global = useGlobal();
  let containerRef!: HTMLDivElement;

  const hasThumbnail = () => props.stickerSet.hasThumbnail;
  const hasVideoThumb = () => props.stickerSet.hasVideoThumb;
  const hasAnimatedThumb = () => props.stickerSet.hasAnimatedThumb;
  const hasStaticThumb = () => props.stickerSet.hasStaticThumb;
  const thumbCustomEmojiId = () => props.stickerSet.thumbCustomEmojiId;

  const { customEmoji } = useCustomEmoji(thumbCustomEmojiId);
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
  const shouldPlay = createMemo(() => isIntersecting() && !props.noPlay);

  const shouldFallbackToSticker = createMemo(
    () => !hasThumbnail() || (hasVideoThumb() && !IS_WEBM_SUPPORTED && !hasAnimatedThumb() && !hasStaticThumb()),
  );
  const fallbackSticker = createMemo(() => (shouldFallbackToSticker() ? props.stickerSet.stickers?.[0] : undefined));

  const mediaHash = createMemo(
    () => ((hasThumbnail() && !fallbackSticker()) || hasAnimatedThumb()) && `stickerSet${props.stickerSet.id}`,
  );
  const mediaData = useMedia(mediaHash, () => !isIntersecting());
  const fallbackStickerHash = createMemo(() => fallbackSticker() && getStickerMediaHash(fallbackSticker()!, 'preview'));
  const fallbackStickerMediaData = useMedia(fallbackStickerHash, () => !isIntersecting());

  const isReady = createMemo(() => thumbCustomEmojiId() || mediaData() || fallbackStickerMediaData());
  const thumbDataUri = createMemo(() => props.stickerSet.thumbnail?.dataUri || fallbackSticker()?.thumbnail?.dataUri);
  // Deviation: the transition classes are written through the element ref (`t.ref`), not a class string. One transition
  // serves whichever of the alternative elements below is rendered (the last `ref` call wins).
  const transition = createMediaTransition({ hasMediaData: () => Boolean(isReady()) });

  const coords = useCoordsInSharedCanvas(() => containerRef, props.sharedCanvasRef);

  createEffect(
    depsOf(() => [isIntersecting(), shouldFallbackToSticker(), props.stickerSet] as const),
    ([isIntersecting2, shouldFallbackToSticker2, stickerSet2]) => {
      if (isIntersecting2 && shouldFallbackToSticker2 && !stickerSet2.stickers?.length) {
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
            documentId={thumbCustomEmojiId()!}
            size={props.size}
            observeIntersectionForPlaying={props.observeIntersection}
            noPlay={props.noPlay}
          />
        ) : hasAnimatedThumb() ? (
          <AnimatedSticker
            ref={transition.ref}
            tgsUrl={mediaData()}
            size={props.size}
            play={shouldPlay()}
            isLowPriority={!selectIsAlwaysHighPriorityEmoji(global, props.stickerSet)}
            sharedCanvas={props.sharedCanvasRef?.() || undefined}
            sharedCanvasCoords={coords()}
            forceAlways={props.forcePlayback}
          />
        ) : hasVideoThumb() && !shouldFallbackToSticker() ? (
          <OptimizedVideo
            ref={transition.ref}
            class={styles.video}
            src={mediaData()}
            canPlay={shouldPlay()}
            style={colorFilter()}
            isPriority={props.forcePlayback}
            loop
            disablepictureinpicture
          />
        ) : (
          <img
            ref={transition.ref}
            src={mediaData() || fallbackStickerMediaData()}
            style={colorFilter()}
            class={styles.image}
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
