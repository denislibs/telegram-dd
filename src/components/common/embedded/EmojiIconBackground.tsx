import {
  createEffect,
  createMeasureEffect,
  createMemo,
  createSignal,
  requestMutation,
  watchHeavyAnimation,
} from 'frameact';

import { getStickerMediaHash } from '../../../global/helpers';
import buildClassName from '../../../util/buildClassName';
import { depsOf } from '../../../util/effectDeps';
import { preloadImage } from '../../../util/files';
import { REM } from '../helpers/mediaDimensions';

import useDynamicColorListener from '../../../hooks/stickers/useDynamicColorListener';
import useMedia from '../../../hooks/useMedia';
import useOldLang from '../../../hooks/useOldLang';
import useResizeObserver from '../../../hooks/useResizeObserver';
import useDevicePixelRatio from '../../../hooks/window/useDevicePixelRatio';
import useCustomEmoji from '../hooks/useCustomEmoji';

import styles from './EmojiIconBackground.module.scss';

type IconPosition = {
  inline: number;
  block: number;
  opacity: number;
  scale: number;
};

const ICON_POSITIONS: IconPosition[] = [
  {
    inline: 22,
    block: 38,
    opacity: 0.35,
    scale: 0.75,
  },
  {
    inline: 32,
    block: 12,
    opacity: 0.3,
    scale: 1,
  },
  {
    inline: 60,
    block: 22,
    opacity: 0.25,
    scale: 0.75,
  },
  {
    inline: 75,
    block: 44,
    opacity: 0.25,
    scale: 1,
  },
  {
    inline: 75,
    block: 2,
    opacity: 0.2,
    scale: 0.625,
  },
  {
    inline: 95,
    block: 18,
    opacity: 0.2,
    scale: 1,
  },
  {
    inline: 115,
    block: 38,
    opacity: 0.2,
    scale: 0.625,
  },
  {
    inline: 125,
    block: 12,
    opacity: 0.1,
    scale: 0.75,
  },
];

const EMOJI_SIZE = REM;
const LOTTIE_TINT_OPACITY = 'ff';
const NON_LOTTIE_TINT_OPACITY = 'bb';
const EMOJI_SPACE = 0.75 * REM;

type OwnProps = {
  emojiDocumentId: string;
  className?: string;
  withEmojiSpace?: boolean;
};

// Deviation: tt's `useThrottleForHeavyAnimation` (src/hooks/useHeavyAnimation.ts, used only here) is a local helper over
// `watchHeavyAnimation`: a call during a heavy animation is postponed to its end (the latest call wins), as in tt.
function createThrottleForHeavyAnimation<A extends unknown[]>(callback: (...args: A) => void) {
  // `watchHeavyAnimation` calls `onStart` at once when the scope chain is already animating
  let isAnimating = false;
  let pendingCall: (() => void) | undefined;

  watchHeavyAnimation(
    () => {
      isAnimating = true;
    },
    () => {
      isAnimating = false;
      const call = pendingCall;
      pendingCall = undefined;
      call?.();
    },
  );

  return (...args: A) => {
    if (isAnimating) {
      pendingCall = () => callback(...args);
      return;
    }

    pendingCall = undefined;
    callback(...args);
  };
}

const EmojiIconBackground = (props: OwnProps) => {
  let canvasRef!: HTMLCanvasElement;
  let containerRef!: HTMLDivElement;

  const [emojiImage, setEmojiImage] = createSignal<HTMLImageElement | undefined>(undefined);

  const dpr = useDevicePixelRatio();

  const lang = useOldLang();

  const { customEmoji } = useCustomEmoji(() => props.emojiDocumentId);
  const previewMediaHash = createMemo(() => {
    const emoji = customEmoji();
    return emoji ? getStickerMediaHash(emoji, 'preview') : undefined;
  });
  const previewUrl = useMedia(previewMediaHash);

  const customColor = useDynamicColorListener(() => containerRef);
  // Read in `updateCanvas`, which also runs outside of a tracked scope (a prop getter is not readable there)
  const withEmojiSpace = createMemo(() => Boolean(props.withEmojiSpace));

  const preloadAfterHeavyAnimation = createThrottleForHeavyAnimation(() => {
    const url = previewUrl();
    if (!url) return;
    preloadImage(url).then(setEmojiImage);
  });

  createEffect(
    () => previewUrl(),
    () => {
      preloadAfterHeavyAnimation();
    },
  );

  const updateCanvas = () => {
    const canvas = canvasRef;
    const image = emojiImage();
    const color = customColor();
    if (!canvas || !image || !color) return;

    const context = canvas.getContext('2d')!;
    const { width, height } = canvas;
    const pixelRatio = dpr();

    context.clearRect(0, 0, width, height);

    ICON_POSITIONS.forEach(({ inline, block, opacity, scale }) => {
      const xShift = withEmojiSpace() ? -EMOJI_SPACE : 0;
      const x = ((lang.isRtl ? inline : width / pixelRatio - inline) + xShift) * pixelRatio;
      const y = block * pixelRatio;

      const emojiSize = EMOJI_SIZE * pixelRatio;

      context.save();
      context.globalAlpha = opacity;
      context.translate(x, y);
      context.scale(scale, scale);
      context.drawImage(image, -emojiSize / 2, -emojiSize / 2, emojiSize, emojiSize);
      context.restore();
    });

    const tintColor = `${color}${customEmoji()!.isLottie ? LOTTIE_TINT_OPACITY : NON_LOTTIE_TINT_OPACITY}`;

    context.save();
    context.fillStyle = tintColor;
    context.globalCompositeOperation = 'source-atop';
    context.fillRect(0, 0, width, height);
    context.restore();
  };

  const updateCanvasAfterHeavyAnimation = createThrottleForHeavyAnimation(updateCanvas);

  createEffect(
    depsOf(() => [emojiImage(), lang.isRtl, customColor(), withEmojiSpace()] as const),
    () => {
      updateCanvasAfterHeavyAnimation();
    },
  );

  const updateCanvasSize = createThrottleForHeavyAnimation((parentWidth: number, parentHeight: number) => {
    requestMutation(() => {
      const canvas = canvasRef;
      if (!canvas) return;

      const pixelRatio = dpr();
      canvas.width = parentWidth * pixelRatio;
      canvas.height = parentHeight * pixelRatio;

      canvas.style.width = `${parentWidth}px`;
      canvas.style.height = `${parentHeight}px`;

      updateCanvas();
    });
  });

  const handleResize = createThrottleForHeavyAnimation((entry: ResizeObserverEntry) => {
    const { width, height } = entry.contentRect;

    updateCanvasSize(width, height);
  });

  useResizeObserver(() => containerRef, handleResize);

  // tt: an effect with `updateCanvasSize` (which depends on `dpr`) in its deps.
  createMeasureEffect(
    () => dpr(),
    () => {
      const container = containerRef;
      if (!container) return;

      const { width, height } = container.getBoundingClientRect();

      updateCanvasSize(width, height);
    },
  );

  return (
    <div class={buildClassName(styles.root, props.className)} ref={containerRef}>
      <canvas ref={canvasRef} />
    </div>
  );
};

export default EmojiIconBackground;
