import { createEffect, createMemo } from 'frameact';
import { mergeProps, Show } from 'frameact/dom';
import { depsOf } from '../../util/effectDeps';

import { formatCountdown } from '../../util/dates/oldDateFormat';
import { formatClockDuration, formatCountdownDateTime, secondsToDate } from '../../util/localization/dateFormat';
import { getServerTime } from '../../util/serverTime';

import useInterval from '../../hooks/schedulers/useInterval';
import useTimeout from '../../hooks/schedulers/useTimeout';
import useForceUpdate from '../../hooks/useForceUpdate';
import useLang from '../../hooks/useLang';

import AnimatedCounter from '../common/AnimatedCounter';

type OwnProps = {
  className?: string;
  endsAt: number;
  mode?: 'clock' | 'countdown' | 'rounded';
  shouldShowZeroOnEnd?: boolean;
  onEnd?: NoneToVoidFunction;
};

const DAY_IN_SECONDS = 24 * 60 * 60;
const UPDATE_FREQUENCY = 500; // Sometimes second gets skipped if using 1000
const SECOND_IN_MS = 1000;

const TextTimer = (rawProps: OwnProps) => {
  const props = mergeProps({ mode: 'clock' }, rawProps) as OwnProps & Required<Pick<OwnProps, 'mode'>>;
  // TODO(codemod): useForceUpdate: a component runs once; make the changing value a signal and delete the force update
  const forceUpdate = useForceUpdate();
  const lang = useLang();

  const serverTime = getServerTime();
  const isActive = createMemo(() => serverTime < props.endsAt);
  const timeLeft = createMemo(() => Math.max(0, props.endsAt - serverTime));
  const shouldUseClock = createMemo(() => props.mode === 'clock' || timeLeft() < DAY_IN_SECONDS);
  const switchToClockDelay = createMemo(() =>
    isActive() && props.mode !== 'clock' && !shouldUseClock()
      ? (timeLeft() - DAY_IN_SECONDS) * SECOND_IN_MS + UPDATE_FREQUENCY
      : undefined,
  );
  const nextUpdateDelay = createMemo(() =>
    props.mode === 'rounded' && switchToClockDelay() !== undefined
      ? Math.min(
          switchToClockDelay(),
          (timeLeft() % DAY_IN_SECONDS || DAY_IN_SECONDS) * SECOND_IN_MS + UPDATE_FREQUENCY,
        )
      : switchToClockDelay(),
  );

  useTimeout(forceUpdate, () => nextUpdateDelay());
  useInterval(forceUpdate, () => (isActive() && shouldUseClock() ? UPDATE_FREQUENCY : undefined));

  createEffect(
    depsOf(() => [isActive(), props.onEnd] as const),
    ([isActive2, onEnd2]) => {
      if (!isActive2) {
        onEnd2?.();
      }
    },
  );

  const time = createMemo(() => formatClockDuration(timeLeft()));

  const timeParts = createMemo(() => time().split(':'));
  const clockNode = (
    <>
      {timeParts().map((part, index) => (
        <span>
          {index > 0 && ':'}
          <AnimatedCounter text={part} />
        </span>
      ))}
    </>
  );

  return (
    <Show when={!(!isActive() && !props.shouldShowZeroOnEnd)}>
      <Show
        when={!(props.mode === 'rounded' && !shouldUseClock())}
        fallback={<span class={props.className}>{formatCountdown(lang, timeLeft())}</span>}
      >
        <Show
          when={!(props.mode === 'countdown' && !shouldUseClock())}
          fallback={
            <span class={props.className}>
              {formatCountdownDateTime(lang, secondsToDate(props.endsAt), {
                anchorDate: secondsToDate(serverTime),
              })}
            </span>
          }
        >
          <span class={props.className} style="font-variant-numeric: tabular-nums;">
            {props.mode === 'countdown' ? lang('TimeIn', { time: clockNode }, { withNodes: true }) : clockNode}
          </span>
        </Show>
      </Show>
    </Show>
  );
};

export default TextTimer;
