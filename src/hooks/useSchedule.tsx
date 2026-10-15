import { createMemo, createSignal } from 'frameact';

import type { RepeatedMessageMode } from '../util/scheduledMessages';

import { SCHEDULED_WHEN_ONLINE } from '../config';
import { type MaybeAccessor, read } from '../util/accessors';
import { getDayStartAt } from '../util/dates/oldDateFormat';
import { getRepeatModeFromSeconds, getRepeatPeriodSeconds } from '../util/scheduledMessages';
import { getServerTimeOffset } from '../util/serverTime';
import useOldLang from './useOldLang';

import CalendarModal from '../components/common/CalendarModal.async';

type OnScheduledCallback = (scheduledAt: number, repeatPeriod?: number) => void;

// Deviation: a hook runs once, so the reactive parameters are accessors (or plain values for a constant)
const useSchedule = (
  canScheduleUntilOnline?: MaybeAccessor<boolean | undefined>,
  onCancel?: () => void,
  openAt?: MaybeAccessor<number | undefined>,
  initialRepeatPeriod?: MaybeAccessor<number | undefined>,
) => {
  const lang = useOldLang();
  const [onScheduled, setOnScheduled] = createSignal<OnScheduledCallback | undefined>(undefined);

  const handleMessageSchedule = (date: Date, repeatMode?: RepeatedMessageMode) => {
    // Scheduled time can not be less than 10 seconds in future
    const isWhenOnline = date.getTime() === SCHEDULED_WHEN_ONLINE * 1000;
    const scheduledAt =
      Math.round(Math.max(date.getTime(), Date.now() + 60 * 1000) / 1000) + (isWhenOnline ? 0 : getServerTimeOffset());
    const repeatPeriod = getRepeatPeriodSeconds(repeatMode);
    onScheduled()?.(scheduledAt, repeatPeriod);
    setOnScheduled(undefined);
  };

  const handleMessageScheduleUntilOnline = () => {
    handleMessageSchedule(new Date(SCHEDULED_WHEN_ONLINE * 1000));
  };

  const handleCloseCalendar = () => {
    setOnScheduled(undefined);
    onCancel?.();
  };

  const requestCalendar = (whenScheduled: OnScheduledCallback) => {
    setOnScheduled(() => whenScheduled);
  };

  const scheduledDefaultDate = createMemo(() => {
    const openAt2 = read(openAt);
    const date = openAt2 ? new Date(openAt2 * 1000) : new Date();
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
  });

  const scheduledMaxDate = (() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    return date;
  })();

  const calendar = (
    <CalendarModal
      isOpen={Boolean(onScheduled())}
      withTimePicker
      withRepeatMode
      initialRepeatMode={getRepeatModeFromSeconds(read(initialRepeatPeriod))}
      selectedAt={scheduledDefaultDate().getTime()}
      maxAt={getDayStartAt(scheduledMaxDate)}
      isFutureMode
      secondButtonLabel={read(canScheduleUntilOnline) ? lang('Schedule.SendWhenOnline') : undefined}
      onClose={handleCloseCalendar}
      onSubmit={handleMessageSchedule}
      onSecondButtonClick={read(canScheduleUntilOnline) ? handleMessageScheduleUntilOnline : undefined}
    />
  );

  return [requestCalendar, calendar] as const;
};

export default useSchedule;
