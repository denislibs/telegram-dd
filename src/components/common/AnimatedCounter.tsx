import { createEffect, createMemo, previous } from 'frameact';
import { getGlobal } from '../../global';

import { selectCanAnimateInterface } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import { throttleWithTickEnd } from '../../util/schedulers';

import useForceUpdate from '../../hooks/useForceUpdate';
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
  const { isRtl } = useLang();

  const prevText = previous(() => props.text);
  // TODO(codemod): useForceUpdate: a component runs once; make the changing value a signal and delete the force update
  const forceUpdate = useForceUpdate();

  const shouldAnimate = createMemo(() =>
    scheduleAnimation(
      !props.isDisabled &&
        selectCanAnimateInterface(getGlobal()) &&
        prevText() !== undefined &&
        prevText() !== props.text,
    ),
  );

  const characters = createMemo(() => {
    return shouldAnimate() ? renderAnimatedCharacters(props.text, prevText()) : props.text;
  });

  createEffect(
    () => [shouldAnimate(), props.text],
    ([shouldAnimate]) => {
      if (!shouldAnimate) return undefined;

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
      dir={isRtl ? 'rtl' : undefined}
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
