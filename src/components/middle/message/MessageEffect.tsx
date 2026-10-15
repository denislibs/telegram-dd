// FOUNDATION STUB: MessageEffect (telegram-tt src/components/middle/message/MessageEffect.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
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

// The anchor of the effect: a corner of the message content, no size. The effect itself is not played.
// TODO(port): the real MessageEffect (the full-screen effect animation).
const MessageEffect = (props: OwnProps) => {
  return (
    <div aria-hidden="true" style={`position: absolute; bottom: 0; ${props.isMirrored ? 'left: 0' : 'right: 0'}`} />
  );
};

export default MessageEffect;
