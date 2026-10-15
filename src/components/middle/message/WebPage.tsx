// FOUNDATION STUB: WebPage (telegram-tt src/components/middle/message/WebPage.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { ApiMessage, ApiMessageWebPage, ApiTypeStory, ApiWebPage } from '../../../api/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';
import type { ThemeKey } from '../../../types';

export type OwnProps = {
  messageWebPage: ApiMessageWebPage;
  webPage: ApiWebPage;
  message?: ApiMessage;
  noAvatars?: boolean;
  canAutoLoad?: boolean;
  canAutoPlay?: boolean;
  isDownloading?: boolean;
  isProtected?: boolean;
  isConnected?: boolean;
  backgroundEmojiId?: string;
  theme: ThemeKey;
  story?: ApiTypeStory;
  shouldWarnAboutFiles?: boolean;
  autoLoadFileMaxSizeMb?: number;
  lastPlaybackTimestamp?: number;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  onAudioPlay?: NoneToVoidFunction;
  onMediaClick?: NoneToVoidFunction;
  onDocumentClick?: NoneToVoidFunction;
  onCancelMediaTransfer?: NoneToVoidFunction;
  onContainerClick?: (e: React.MouseEvent) => void;
};

// tt's `.WebPage`: at most 29rem wide, a preview of at least a few lines.
// TODO(port): the real WebPage (site name, title, description, photo / video / audio / document preview).
const WebPage = (_props: OwnProps) => {
  return (
    <div
      role="img"
      aria-label="Link preview, not supported yet"
      class="WebPage"
      style="position: relative; max-width: 29rem; min-height: 5.5rem; margin-top: 0.25rem; margin-bottom: 0.125rem; border-radius: 0.25rem; background: var(--accent-background-color)"
    />
  );
};

export default WebPage;
