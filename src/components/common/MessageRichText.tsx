// FOUNDATION STUB: MessageRichText (telegram-tt src/components/common/MessageRichText.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { ApiMessage, ApiRichMessage } from '../../api/types';
import type { ObserveFn } from '../../hooks/useIntersectionObserver';
import type { ThemeKey, ThreadId } from '../../types';

import { PLACEHOLDER_RADIUS, PLACEHOLDER_SURFACE } from './helpers/placeholder';

export type OwnProps = {
  message: ApiMessage;
  forcedRichMessage?: ApiRichMessage;
  threadId?: ThreadId;
  isOwn?: boolean;
  noAvatars?: boolean;
  canAutoLoadMedia?: boolean;
  isProtected?: boolean;
  noPlaylist?: boolean;
  theme: ThemeKey;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
};

// TODO(port): the real MessageRichText (the blocks of a rich message: headings, lists, media, tables).
const MessageRichText = (_props: OwnProps) => {
  return (
    <div
      role="img"
      aria-label="Rich text, not supported yet"
      class="MessageRichText"
      style={`min-width: 12rem; max-width: 100%; min-height: 2.5rem; ${PLACEHOLDER_SURFACE}; ${PLACEHOLDER_RADIUS}`}
    />
  );
};

export default MessageRichText;
