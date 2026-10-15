// FOUNDATION STUB: Location (telegram-tt src/components/middle/message/Location.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiMessage, ApiPeer } from '../../../api/types';
import type { ThemeKey } from '../../../types';

export type OwnProps = {
  message: ApiMessage;
  peer?: ApiPeer;
  isInSelectMode?: boolean;
  isSelected?: boolean;
  theme: ThemeKey;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Location = (_props: OwnProps) => undefined;

export default Location;
