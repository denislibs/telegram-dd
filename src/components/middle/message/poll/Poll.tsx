// FOUNDATION STUB: Poll (telegram-tt src/components/middle/message/poll/Poll.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { ApiFormattedText, ApiMessagePoll } from '../../../../api/types';
import type { ObserveFn } from '../../../../hooks/useIntersectionObserver';
import type { ThemeKey } from '../../../../types';

import { clampCount, PLACEHOLDER_RADIUS, PLACEHOLDER_SURFACE } from '../../../common/helpers/placeholder';

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

const MAX_OPTIONS = 12;
// The question, one row per option and the votes line (and the 0.75rem of room for the message meta).
const BASE_HEIGHT_REM = 4.5;
const OPTION_HEIGHT_REM = 2.5;

// TODO(port): the real Poll (question, options with voting, results, quiz explanation).
const Poll = (props: OwnProps) => {
  const height = () => BASE_HEIGHT_REM + clampCount(props.poll.summary.answers.length, MAX_OPTIONS) * OPTION_HEIGHT_REM;

  return (
    <div
      role="img"
      aria-label="Poll, not supported yet"
      style={`min-width: 15rem; max-width: 100%; height: ${height()}rem; ${PLACEHOLDER_SURFACE}; ${PLACEHOLDER_RADIUS}`}
    />
  );
};

export default Poll;
