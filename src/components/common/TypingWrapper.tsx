import { createEffect, createMemo, createSignal, onDestroy, requestMutation } from 'frameact';
import type { JSX } from 'frameact/jsx-runtime';
import { depsOf } from '../../util/effectDeps';

import type { ApiFormattedText } from '../../api/types';

import buildClassName from '../../util/buildClassName';
import { LOCAL_TGS_PREVIEW_URLS, LOCAL_TGS_URLS } from './helpers/animatedAssets';
import { REM } from './helpers/mediaDimensions';

import AnimatedIconWithPreview from './AnimatedIconWithPreview';

import styles from './TypingWrapper.module.scss';

type OwnProps = {
  formattedText: ApiFormattedText;
  shouldAnimateMask?: boolean;
  noInitialAnimation?: boolean;
  shouldRenderPlaceholder: boolean;
  completionKey: number;
  renderText: (text: ApiFormattedText) => JSX.Element;
  onCompleted?: NoneToVoidFunction;
};

const CHUNK_SIZE = 67;
const CHUNK_SPREAD_DURATION = 500;
const HEADWAY_DURATION = 750;
const PLACEHOLDER_SIZE = 1.25 * REM;
const SPREAD_CHARS = 20;
const PROGRESS_CSS_PROPERTY = '--typing-draft-progress';
const SPREAD_CSS_PROPERTY = '--typing-draft-spread';

try {
  window.CSS.registerProperty({
    name: PROGRESS_CSS_PROPERTY,
    syntax: '<percentage>',
    inherits: false,
    initialValue: '0%',
  });
} catch {
  // Ignore duplicate registrations
}

function getRunningProgress(animation: Animation | undefined, baseProgress: number) {
  const timing = animation?.effect?.getComputedTiming().progress;
  if (typeof timing !== 'number') return baseProgress;
  return baseProgress + (100 - baseProgress) * timing;
}

const TypingWrapper = (props: OwnProps) => {
  const fullText = createMemo(() => props.formattedText.text);
  const initialRevealedLength = createMemo(() => (props.noInitialAnimation ? fullText().length : 0));

  let ref!: HTMLSpanElement;
  let animationRef: Animation | undefined;
  let progressRef = props.noInitialAnimation || !fullText() ? 100 : 0;
  let prevRevealedRef = initialRevealedLength();
  let fullTextRef = '';

  const [revealedLength, setRevealedLength] = createSignal(initialRevealedLength());
  let revealedLengthRef = initialRevealedLength();
  let chunkTimerRef: number | undefined;
  let completedKeyRef: string | undefined;
  let prevFullTextRef = props.noInitialAnimation ? fullText() : '';

  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  fullTextRef = fullText();

  const stopAnimation = () => {
    animationRef?.cancel();
    animationRef = undefined;
  };

  const maybeNotifyCompleted = () => {
    const currentFullText = fullTextRef;
    const currentCompletionKey = `${props.completionKey}:${currentFullText}`;
    const isFullyRevealed = revealedLengthRef >= currentFullText.length;
    const isMaskCompleted = !props.shouldAnimateMask || progressRef >= 100;

    if (!isFullyRevealed || !isMaskCompleted || completedKeyRef === currentCompletionKey) {
      return;
    }

    completedKeyRef = currentCompletionKey;
    props.onCompleted?.();
  };

  const scheduleChunks = (from: number, to: number) => {
    window.clearTimeout(chunkTimerRef);

    const delta = to - from;
    if (delta <= 0) return;

    const numChunks = Math.ceil(delta / CHUNK_SIZE);
    const chunkInterval = numChunks > 1 ? CHUNK_SPREAD_DURATION / (numChunks - 1) : 0;

    let position = from;

    const addChunk = () => {
      position = Math.min(position + CHUNK_SIZE, to);
      revealedLengthRef = position;
      setRevealedLength(position);

      if (position < to) {
        chunkTimerRef = window.setTimeout(addChunk, chunkInterval);
      } else {
        chunkTimerRef = undefined;
      }
    };

    addChunk();
  };

  // --- Chunking: spread incoming text over time ---
  createEffect(
    depsOf(() => [fullText(), scheduleChunks, stopAnimation] as const),
    ([fullText2]) => {
      if (fullText2 === prevFullTextRef) return;
      prevFullTextRef = fullText2;

      const fullLen = fullText2.length;
      const revealed = revealedLengthRef;

      if (fullLen < revealed) {
        window.clearTimeout(chunkTimerRef);
        chunkTimerRef = undefined;
        stopAnimation();
        revealedLengthRef = fullLen;
        prevRevealedRef = fullLen;
        progressRef = 100;
        setRevealedLength(fullLen);

        requestMutation(() => {
          const element = ref;
          if (!element) return;

          element.style.setProperty(SPREAD_CSS_PROPERTY, '0%');
          element.style.setProperty(PROGRESS_CSS_PROPERTY, '100%');
        });
        return;
      }

      if (fullLen === revealed) {
        return;
      }

      scheduleChunks(revealed, fullLen);
    },
  );

  // Completion depends on several refs, so we are calling check after every render to avoid locking the UI
  // TODO(codemod): useEffect without a dependency array ran after every render: name the tracked reads in the compute half
  createEffect(
    () => undefined,
    () => {
      maybeNotifyCompleted();
    },
  );

  // --- Mask animation: smooth reveal of rendered content (layout effect to prevent flash) ---
  // TODO(codemod): useLayoutEffect without a dependency array ran after every render: name the tracked reads in the compute half
  createEffect(
    () => undefined,
    () => {
      const element = ref;
      if (!element) return;

      const revealed = revealedLength();
      const prevRevealed = prevRevealedRef;
      if (revealed === prevRevealed) {
        if (progressRef === 100) element.style.setProperty(PROGRESS_CSS_PROPERTY, '100%');
        return;
      }

      prevRevealedRef = revealed;

      if (!props.shouldAnimateMask) {
        stopAnimation();
        progressRef = 100;
        element.style.setProperty(PROGRESS_CSS_PROPERTY, '100%');
        return;
      }

      let progress = animationRef ? getRunningProgress(animationRef, progressRef) : progressRef;

      stopAnimation();

      if (revealed < prevRevealed) {
        progress = 0;
      } else if (prevRevealed && revealed) {
        progress = Math.min((prevRevealed * progress) / revealed, 100);
      } else if (!prevRevealed) {
        progress = 0;
      }

      if (!revealed) {
        progress = 100;
      }

      progressRef = progress;
      const remaining = 100 - progress;
      const spread = revealed ? (SPREAD_CHARS / revealed) * 100 : 0;

      if (!revealed || remaining <= 0) {
        progressRef = 100;
        element.style.setProperty(PROGRESS_CSS_PROPERTY, '100%');
        return;
      }

      element.style.setProperty(SPREAD_CSS_PROPERTY, `${spread}%`);
      element.style.setProperty(PROGRESS_CSS_PROPERTY, `${progress}%`);

      const animation = element.animate(
        [{ [PROGRESS_CSS_PROPERTY]: `${progress}%` }, { [PROGRESS_CSS_PROPERTY]: '100%' }] as Keyframe[],
        {
          duration: HEADWAY_DURATION,
          easing: 'linear',
          fill: 'forwards',
        },
      );

      animationRef = animation;

      animation.onfinish = () => {
        if (animationRef !== animation) return;

        progressRef = 100;
        animationRef = undefined;

        requestMutation(() => {
          element.style.setProperty(PROGRESS_CSS_PROPERTY, '100%');
        });

        maybeNotifyCompleted();
      };

      animation.oncancel = () => {
        if (animationRef !== animation) return;
        animationRef = undefined;
      };
    },
  );

  onDestroy(() => {
    window.clearTimeout(chunkTimerRef);
    stopAnimation();
  });

  const truncatedText = createMemo(() => ({
    text: fullText().slice(0, revealedLength()),
    entities: props.formattedText.entities,
  }));
  const className = createMemo(() => buildClassName(styles.root, !fullText() && styles.fullyRevealed));

  return (
    <span ref={ref} class={className()}>
      {props.renderText(truncatedText())}
      {props.shouldRenderPlaceholder && (
        <span class={styles.placeholder}>
          <AnimatedIconWithPreview
            tgsUrl={LOCAL_TGS_URLS.Writing}
            previewUrl={LOCAL_TGS_PREVIEW_URLS.Writing}
            size={PLACEHOLDER_SIZE}
            play
            noLoop={false}
            shouldUseTextColor
          />
        </span>
      )}
    </span>
  );
};

export default TypingWrapper;
