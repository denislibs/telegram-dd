import { createEffect, createMemo, createSignal } from 'frameact';
import { useGlobal } from '../../global';

import { selectCanAnimateInterface } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import { throttleWithTickEnd } from '../../util/schedulers';

import useLang from '../../hooks/useLang';

import styles from './AnimatedCounter.module.scss';

type OwnProps = {
  text: string;
  className?: string;
  isDisabled?: boolean;
  ref?: (el: HTMLSpanElement) => void;
};

const ANIMATION_TIME = 200;
const MAX_SIMULTANEOUS_ANIMATIONS = 10;

let scheduledAnimationsCounter = 0;

const resetCounterOnTickEnd = throttleWithTickEnd(() => {
  scheduledAnimationsCounter = 0;
});

const AnimatedCounter = (props: OwnProps) => {
  const lang = useLang();

  // Deviation: no re-render to track the previous text or to force an update: the previous text is kept by the memo
  // below (as `usePreviousDeprecated` did per render) and `forceUpdate` bumps a version signal that the memo reads.
  const [version, setVersion] = createSignal(0);
  const forceUpdate = () => setVersion((current) => current + 1);
  let prevTextRef: string | undefined;

  const animation = createMemo(() => {
    version();

    const prevText = prevTextRef;
    prevTextRef = props.text;

    const shouldAnimate = scheduleAnimation(
      !props.isDisabled && selectCanAnimateInterface(useGlobal()) && prevText !== undefined && prevText !== props.text,
    );

    return { shouldAnimate, prevText };
  });

  const characters = createMemo(() => {
    return animation().shouldAnimate ? renderAnimatedCharacters(props.text, animation().prevText) : props.text;
  });

  createEffect(
    () => [animation().shouldAnimate, props.text],
    () => {
      if (!animation().shouldAnimate) return undefined;

      const timeoutId = window.setTimeout(() => {
        forceUpdate();
      }, ANIMATION_TIME);

      return () => {
        window.clearTimeout(timeoutId);
      };
    },
  );

  return (
    <span
      ref={props.ref}
      class={buildClassName(props.className, !props.isDisabled && styles.root)}
      dir={lang.isRtl ? 'rtl' : undefined}
    >
      {characters()}
    </span>
  );
};

export default AnimatedCounter;

function scheduleAnimation(condition: boolean) {
  if (!condition || scheduledAnimationsCounter >= MAX_SIMULTANEOUS_ANIMATIONS) return false;

  if (scheduledAnimationsCounter === 0) {
    resetCounterOnTickEnd();
  }

  scheduledAnimationsCounter++;

  return true;
}

function renderAnimatedCharacters(text: string, prevText?: string) {
  const elements: React.ReactNode[] = [];
  const textLength = text.length;
  const prevTextLength = prevText?.length ?? 0;

  for (let i = 0; i <= textLength; i++) {
    const charIndex = textLength - i;
    const prevTextCharIndex = prevTextLength - i;

    if (prevText && prevTextCharIndex >= 0 && text[charIndex] !== prevText[prevTextCharIndex]) {
      elements.unshift(
        <div class={styles.characterContainer}>
          <div class={styles.character}>{text[charIndex] ?? ''}</div>
          <div class={styles.characterOld}>{prevText[prevTextCharIndex]}</div>
          <div class={styles.characterNew}>{text[charIndex] ?? ''}</div>
        </div>,
      );
    } else {
      elements.unshift(<span>{text[charIndex] ?? ''}</span>);
    }
  }

  return elements;
}
