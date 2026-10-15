// FOUNDATION STUB: PaidMediaOverlay (telegram-tt src/components/middle/message/PaidMediaOverlay.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { JSX } from 'frameact/jsx-runtime';
import type { ApiPaidMedia } from '../../../api/types';

export type OwnProps = {
  paidMedia: ApiPaidMedia;
  chatId: string;
  messageId: number;
  isOutgoing?: boolean;
  children?: JSX.Element;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PaidMediaOverlay = (_props: OwnProps) => undefined;

export default PaidMediaOverlay;
