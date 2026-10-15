// FOUNDATION STUB: Poll (telegram-tt src/components/middle/message/poll/Poll.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiFormattedText, ApiMessagePoll } from '../../../../api/types';
import type { ObserveFn } from '../../../../hooks/useIntersectionObserver';
import type { ThemeKey } from '../../../../types';

export type OwnProps = {
  chatId: string;
  messageId: number;
  poll: ApiMessagePoll;
  messageText?: ApiFormattedText;
  theme: ThemeKey;
  isInScheduled?: boolean;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Poll = (_props: OwnProps) => undefined;

export default Poll;
