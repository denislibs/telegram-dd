// FOUNDATION STUB: CalendarModal (telegram-tt src/components/common/CalendarModal.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { RepeatedMessageMode } from '../../util/scheduledMessages';

export type OwnProps = {
  selectedAt?: number;
  minAt?: number;
  maxAt?: number;
  isFutureMode?: boolean;
  isPastMode?: boolean;
  isOpen: boolean;
  withTimePicker?: boolean;
  withRepeatMode?: boolean;
  initialRepeatMode?: RepeatedMessageMode;
  submitButtonLabel?: string;
  secondButtonLabel?: string;
  description?: string;
  onClose: () => void;
  onCloseAnimationEnd?: NoneToVoidFunction;
  onSubmit: (date: Date, repeatMode?: RepeatedMessageMode) => void;
  onDateChange?: (date: Date) => void;
  onSecondButtonClick?: NoneToVoidFunction;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CalendarModal = (_props: OwnProps) => undefined;

export default CalendarModal;
