// FOUNDATION STUB: Invoice (telegram-tt src/components/middle/message/Invoice.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiMessage } from '../../../api/types';
import type { ThemeKey } from '../../../types';

export type OwnProps = {
  message: ApiMessage;
  shouldAffectAppendix?: boolean;
  isInSelectMode?: boolean;
  isSelected?: boolean;
  theme: ThemeKey;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Invoice = (_props: OwnProps) => undefined;

export default Invoice;
