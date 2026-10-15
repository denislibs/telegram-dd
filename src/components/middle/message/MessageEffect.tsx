// FOUNDATION STUB: MessageEffect (telegram-tt src/components/middle/message/MessageEffect.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiAvailableEffect } from '../../../api/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';

export type OwnProps = {
  messageId?: number;
  isMirrored?: boolean;
  effect: ApiAvailableEffect;
  shouldPlay?: boolean;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  onStop?: VoidFunction;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MessageEffect = (_props: OwnProps) => undefined;

export default MessageEffect;
