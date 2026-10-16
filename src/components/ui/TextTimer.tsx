import { createEffect, createMemo, createSignal } from 'frameact';
import { For, mergeProps, Show } from 'frameact/dom';

import { formatCountdown } from '../../util/dates/oldDateFormat';
import { depsOf } from '../../util/effectDeps';
import { formatClockDuration, formatCountdownDateTime, secondsToDate } from '../../util/localization/dateFormat';
import { getServerTime } from '../../util/serverTime';

import useInterval from '../../hooks/schedulers/useInterval';
import useTimeout from '../../hooks/schedulers/useTimeout';
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
  const lang = useLang();

  // Deviation: tt re-rendered on `forceUpdate` and re-read the server time on every render. Here the tick is a signal
  // and the server time is a memo over it (and over the props tt's render also depended on).
  const [tick, setTick] = createSignal(0);
  const forceUpdate = () => setTick((value) => value + 1);

  const serverTime = createMemo(() => {
    tick();
    void props.endsAt;
    return getServerTime();
  });
  const isActive = createMemo(() => serverTime() < props.endsAt);
  const timeLeft = createMemo(() => Math.max(0, props.endsAt - serverTime()));
  const shouldUseClock = createMemo(() => props.mode === 'clock' || timeLeft() < DAY_IN_SECONDS);
  const switchToClockDelay = createMemo(() =>
    isActive() && props.mode !== 'clock' && !shouldUseClock()
      ? (timeLeft() - DAY_IN_SECONDS) * SECOND_IN_MS + UPDATE_FREQUENCY
      : undefined,
  );
  const nextUpdateDelay = createMemo(() => {
    const switchDelay = switchToClockDelay();
    return props.mode === 'rounded' && switchDelay !== undefined
      ? Math.min(switchDelay, (timeLeft() % DAY_IN_SECONDS || DAY_IN_SECONDS) * SECOND_IN_MS + UPDATE_FREQUENCY)
      : switchDelay;
  });

  useTimeout(forceUpdate, nextUpdateDelay);
  useInterval(forceUpdate, () => (isActive() && shouldUseClock() ? UPDATE_FREQUENCY : undefined));

  createEffect(
    depsOf(() => [isActive(), props.onEnd] as const),
    ([isActive2, onEnd2]) => {
      if (!isActive2) {
        onEnd2?.();
      }
    },
  );

  const timeParts = createMemo(() => formatClockDuration(timeLeft()).split(':'));
  // Deviation: a function, not a constant (a JSX constant is one DOM node); the parts are keyed by index as in tt.
  const clockNode = () => (
    <For each={timeParts()} keyed={false}>
      {(part, index) => (
        <span>
          {index > 0 && ':'}
          <AnimatedCounter text={part()} />
        </span>
      )}
    </For>
  );

  return (
    <Show when={isActive() || props.shouldShowZeroOnEnd}>
      <Show
        when={props.mode === 'rounded' && !shouldUseClock()}
        fallback={
          <Show
            when={props.mode === 'countdown' && !shouldUseClock()}
            fallback={
              <span class={props.className} style="font-variant-numeric: tabular-nums;">
                {props.mode === 'countdown' ? lang('TimeIn', { time: clockNode() }, { withNodes: true }) : clockNode()}
              </span>
            }
          >
            <span class={props.className}>
              {formatCountdownDateTime(lang, secondsToDate(props.endsAt), {
                anchorDate: secondsToDate(serverTime()),
              })}
            </span>
          </Show>
        }
      >
        <span class={props.className}>{formatCountdown(lang, timeLeft())}</span>
      </Show>
    </Show>
  );
};

export default TextTimer;
