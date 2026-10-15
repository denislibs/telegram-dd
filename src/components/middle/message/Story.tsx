// FOUNDATION STUB: Story (telegram-tt src/components/middle/message/Story.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { ApiMessage } from '../../../api/types';

import { PLACEHOLDER_RADIUS, PLACEHOLDER_SURFACE } from '../../common/helpers/placeholder';

export interface OwnProps {
  message: ApiMessage;
  isProtected?: boolean;
}

// tt's story preview is 12rem wide, 192:344.
// TODO(port): the real Story (BaseStory preview of the story media).
const Story = (_props: OwnProps) => {
  return (
    <div
      role="img"
      aria-label="Story, not supported yet"
      style={`width: 12rem; max-width: 100%; aspect-ratio: 192 / 344; ${PLACEHOLDER_SURFACE}; ${PLACEHOLDER_RADIUS}`}
    />
  );
};

export default Story;
