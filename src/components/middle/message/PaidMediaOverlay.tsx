// FOUNDATION STUB: PaidMediaOverlay (telegram-tt src/components/middle/message/PaidMediaOverlay.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { JSX } from 'frameact/jsx-runtime';

import type { ApiPaidMedia } from '../../../api/types';

export type OwnProps = {
  paidMedia: ApiPaidMedia;
  chatId: string;
  messageId: number;
  isOutgoing?: boolean;
  children?: JSX.Element;
};

// Wraps the media (as tt's does); the "buy" button and the status badge are not rendered.
// TODO(port): the real PaidMediaOverlay (buy button, purchased badge, invoice opening).
const PaidMediaOverlay = (props: OwnProps) => {
  return <div style="position: relative">{props.children}</div>;
};

export default PaidMediaOverlay;
