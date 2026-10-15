// FOUNDATION STUB: InlineButtons (telegram-tt src/components/middle/message/InlineButtons.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiKeyboardButton } from '../../../api/types';

export type OwnProps = {
  className?: string;
  inlineButtons: ApiKeyboardButton[][];
  isEphemeral?: boolean;
  isReceipt?: boolean;
  onClick: (payload: ApiKeyboardButton) => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const InlineButtons = (_props: OwnProps) => undefined;

export default InlineButtons;
