// FOUNDATION STUB: SendAsMenu.async (telegram-tt src/components/middle/composer/SendAsMenu.async.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
// Deviation: the sync SendAsMenu is not in src yet, so its OwnProps are copied here and exported from this file.
import type { ApiSendAsPeerId } from '../../../api/types';

export type OwnProps = {
  isOpen: boolean;
  chatId?: string;
  selectedSendAsId?: string;
  sendAsPeerIds?: ApiSendAsPeerId[];
  isCurrentUserPremium?: boolean;
  onClose: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SendAsMenuAsync = (_props: OwnProps) => undefined;

export default SendAsMenuAsync;
