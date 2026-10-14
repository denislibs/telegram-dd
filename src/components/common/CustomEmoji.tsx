import { type Accessor, createMemo, createSignal } from 'frameact';
import { mergeProps } from 'frameact/dom';
import { useGlobal } from '../../global';

import type { ObserveFn } from '../../hooks/useIntersectionObserver';
import { ApiMessageEntityTypes, type ApiSticker } from '../../api/types';

import { selectIsAlwaysHighPriorityEmoji } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import safePlay from '../../util/safePlay';

import useDynamicColorListener from '../../hooks/stickers/useDynamicColorListener';
import useCustomEmoji from './hooks/useCustomEmoji';

import StickerView from './StickerView';

import styles from './CustomEmoji.module.scss';

import blankImg from '../../assets/blank.png';

type OwnProps = {
  ref?: (el: HTMLDivElement) => void;
  className?: string;
  style?: string;
  size?: number;
  isBig?: boolean;
  noPlay?: boolean;
  noVideoOnMobile?: boolean;
  loopLimit?: number;
  shouldNotLoop?: boolean;
  isSelectable?: boolean;
  withSharedAnimation?: boolean;
  sharedCanvasRef?: Accessor<HTMLCanvasElement | undefined>;
  sharedCanvasHqRef?: Accessor<HTMLCanvasElement | undefined>;
  withTranslucentThumb?: boolean;
  shouldPreloadPreview?: boolean;
  skipPreview?: boolean;
  noPlaceholder?: boolean;
  forceOnHeavyAnimation?: boolean;
  forceAlways?: boolean;
  forceTextColor?: boolean;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  onClick?: NoneToVoidFunction;
  onAnimationEnd?: NoneToVoidFunction;
} & (
  | {
      documentId: string;
      sticker?: undefined;
    }
  | {
      sticker: ApiSticker;
      documentId?: undefined;
    }
);

const STICKER_SIZE = 20;

const CustomEmoji = (rawProps: OwnProps) => {
  const props = mergeProps({ size: STICKER_SIZE }, rawProps) as OwnProps & Required<Pick<OwnProps, 'size'>>;
  // Deviation: a forwarded ref is a callback prop; the element is kept in a variable and handed on to `props.ref`.
  let containerRef: HTMLDivElement | undefined;

  // An alternative to `withGlobal` to avoid adding numerous global containers
  const { customEmoji: customEmojiFromDocumentId, canPlay } = useCustomEmoji(() => props.documentId);
  const customEmoji = createMemo(() => customEmojiFromDocumentId() || props.sticker);

  let loopCountRef = 0;
  const [shouldPlay, setShouldPlay] = createSignal(true);

  const hasCustomColor = createMemo(() => props.forceTextColor || customEmoji()?.shouldUseTextColor);
  const customColor = useDynamicColorListener(
    () => containerRef,
    undefined,
    () => !hasCustomColor(),
  );

  const handleVideoEnded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!props.loopLimit) return;

    loopCountRef += 1;

    if (loopCountRef >= props.loopLimit) {
      setShouldPlay(false);
      e.currentTarget.currentTime = 0;
    } else {
      // Loop manually
      safePlay(e.currentTarget);
    }
  };

  const handleStickerLoop = () => {
    if (!props.loopLimit) return;

    loopCountRef += 1;

    if (loopCountRef >= props.loopLimit) {
      setShouldPlay(false);
    }
  };

  const isHq = createMemo(
    () => customEmoji()?.stickerSetInfo && selectIsAlwaysHighPriorityEmoji(useGlobal(), customEmoji()!.stickerSetInfo),
  );

  return (
    <div
      ref={(el) => {
        containerRef = el;
        props.ref?.(el);
      }}
      class={buildClassName(styles.root, props.className, 'custom-emoji', 'emoji')}
      onClick={() => props.onClick?.()}
      onAnimationEnd={() => props.onAnimationEnd?.()}
      data-entity-type={ApiMessageEntityTypes.CustomEmoji}
      data-document-id={props.documentId}
      data-alt={customEmoji()?.emoji}
      style={props.style}
    >
      {props.isSelectable && (
        <img
          class={styles.highlightCatch}
          src={blankImg}
          alt={customEmoji()?.emoji}
          data-entity-type={ApiMessageEntityTypes.CustomEmoji}
          data-document-id={props.documentId}
          draggable={false}
        />
      )}
      {!customEmoji() ? (
        !props.noPlaceholder && <div class={buildClassName(styles.placeholder)} draggable={false} />
      ) : (
        <StickerView
          containerRef={() => containerRef}
          sticker={customEmoji()!}
          isSmall={!props.isBig}
          size={props.size}
          noPlay={props.noPlay || !(shouldPlay() && canPlay())}
          noVideoOnMobile={props.noVideoOnMobile}
          thumbClassName={styles.thumb}
          fullMediaClassName={styles.media}
          shouldLoop={!props.shouldNotLoop}
          loopLimit={props.loopLimit}
          skipPreview={props.skipPreview}
          shouldPreloadPreview={!props.skipPreview && (props.shouldPreloadPreview || props.noPlay || !canPlay())}
          forceOnHeavyAnimation={props.forceOnHeavyAnimation}
          forceAlways={props.forceAlways}
          observeIntersectionForLoading={props.observeIntersectionForLoading}
          observeIntersectionForPlaying={props.observeIntersectionForPlaying}
          withSharedAnimation={props.withSharedAnimation}
          sharedCanvasRef={isHq() ? props.sharedCanvasHqRef : props.sharedCanvasRef}
          withTranslucentThumb={props.withTranslucentThumb}
          onVideoEnded={handleVideoEnded}
          onAnimatedStickerLoop={handleStickerLoop}
          customColor={customColor()}
        />
      )}
    </div>
  );
};

export default CustomEmoji;
