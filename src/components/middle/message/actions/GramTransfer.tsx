// FOUNDATION STUB: GramTransfer (telegram-tt src/components/middle/message/actions/GramTransfer.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiMessageActionGramTransfer } from '../../../../api/types/messageActions';

export type OwnProps = {
  action: ApiMessageActionGramTransfer;
  peerName?: string;
  isOutgoing?: boolean;
  isSending?: boolean;
  isFailed?: boolean;
  isLoading?: boolean;
  shouldLoopStickers?: boolean;
  onClick?: NoneToVoidFunction;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const GramTransfer = (_props: OwnProps) => undefined;

export default GramTransfer;
