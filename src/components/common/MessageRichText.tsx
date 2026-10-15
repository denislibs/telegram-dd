// FOUNDATION STUB: MessageRichText (telegram-tt src/components/common/MessageRichText.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiMessage, ApiRichMessage } from '../../api/types';
import type { ObserveFn } from '../../hooks/useIntersectionObserver';
import type { ThemeKey, ThreadId } from '../../types';

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MessageRichText = (_props: OwnProps) => undefined;

export default MessageRichText;
