import { createEffect, createSignal } from 'frameact';

import buildClassName from '../../util/buildClassName';
import { formatCountdownShort } from '../../util/dates/oldDateFormat';
import { depsOf } from '../../util/effectDeps';

import useInterval from '../../hooks/schedulers/useInterval';
import useOldLang from '../../hooks/useOldLang';

import AnimatedCounter from '../common/AnimatedCounter';

import styles from './RoundTimer.module.scss';

type OwnProps = {
  duration: number;
  className?: string;
  onEnd?: NoneToVoidFunction;
};

const UPDATE_FREQUENCY = 1000;
const TIMER_RADIUS = 14;

const RoundTimer = (props: OwnProps) => {
  const [timeLeft, setTimeLeft] = createSignal(props.duration);
  const lang = useOldLang();

  useInterval(
    () => setTimeLeft((prev) => prev - 1),
    () => (timeLeft() > 0 ? UPDATE_FREQUENCY : undefined),
  );

  createEffect(
    depsOf(() => [timeLeft(), props.onEnd] as const),
    ([currentTimeLeft, onEnd2]) => {
      if (currentTimeLeft <= 0) {
        onEnd2?.();
      }
    },
  );

  createEffect(
    () => props.duration,
    (duration2) => {
      setTimeLeft(duration2);
    },
  );

  return (
    <div class={buildClassName(styles.root, props.className)}>
      <svg class={styles.svg} width="32px" height="32px">
        <circle
          cx="16"
          cy="16"
          r={TIMER_RADIUS}
          transform="rotate(-90, 16, 16)"
          pathLength="100"
          stroke-dasharray="100"
          stroke-dashoffset={100 - ((timeLeft() - 1) / props.duration) * 100} // Show it one step further due to animation
          class={styles.circle}
        />
      </svg>
      <AnimatedCounter className={styles.text} text={formatCountdownShort(lang, timeLeft() * 1000)} />
    </div>
  );
};

export default RoundTimer;
