// FOUNDATION STUB: Location (telegram-tt src/components/middle/message/Location.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { ApiMessage, ApiPeer } from '../../../api/types';
import type { ThemeKey } from '../../../types';

import { PLACEHOLDER_RADIUS, PLACEHOLDER_SURFACE } from '../../common/helpers/placeholder';

export type OwnProps = {
  message: ApiMessage;
  peer?: ApiPeer;
  isInSelectMode?: boolean;
  isSelected?: boolean;
  theme: ThemeKey;
};

// The static map of tt is 480x360, in a 30rem wide block.
// TODO(port): the real Location (static map, venue / live location info, countdown).
const Location = (_props: OwnProps) => {
  return (
    <div
      role="img"
      aria-label="Location, not supported yet"
      class="Location"
      style={`width: 30rem; max-width: 100%; aspect-ratio: 4 / 3; ${PLACEHOLDER_SURFACE}; ${PLACEHOLDER_RADIUS}`}
    />
  );
};

export default Location;
