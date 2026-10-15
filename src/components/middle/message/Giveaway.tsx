// FOUNDATION STUB: Giveaway (telegram-tt src/components/middle/message/Giveaway.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { ApiMessage } from '../../../api/types';

import { PLACEHOLDER_RADIUS, PLACEHOLDER_SURFACE } from '../../common/helpers/placeholder';

export type OwnProps = {
  message: ApiMessage;
};

// The sticker, the description lines and the "How does it work" button.
// TODO(port): the real Giveaway (gift sticker, description, giveaway info dialog).
const Giveaway = (_props: OwnProps) => {
  return (
    <div
      role="img"
      aria-label="Giveaway, not supported yet"
      style={`min-width: 15rem; max-width: 100%; height: 14rem; margin-top: 0.5rem; ${PLACEHOLDER_SURFACE}; ${PLACEHOLDER_RADIUS}`}
    />
  );
};

export default Giveaway;
