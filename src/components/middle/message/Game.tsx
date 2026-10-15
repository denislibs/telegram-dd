// FOUNDATION STUB: Game (telegram-tt src/components/middle/message/Game.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { ApiMessage } from '../../../api/types';
import type { ThreadId } from '../../../types';

import { PLACEHOLDER_RADIUS, PLACEHOLDER_SURFACE } from '../../common/helpers/placeholder';

export type OwnProps = {
  message: ApiMessage;
  threadId?: ThreadId;
  canAutoLoadMedia?: boolean;
};

// tt's preview is 480x270 px, `max-width: 100%`.
const DEFAULT_PREVIEW_DIMENSIONS = {
  width: 480,
  height: 270,
};

// TODO(port): the real Game (preview photo / video, title, description, play button).
const Game = (_props: OwnProps) => {
  return (
    <div class="Game">
      <div
        role="img"
        aria-label="Game, not supported yet"
        class="preview"
        style={`position: relative; max-width: 100%; margin-top: 0.25rem; margin-bottom: 0.25rem; width: ${DEFAULT_PREVIEW_DIMENSIONS.width}px; height: ${DEFAULT_PREVIEW_DIMENSIONS.height}px; ${PLACEHOLDER_SURFACE}; ${PLACEHOLDER_RADIUS}`}
      />
    </div>
  );
};

export default Game;
