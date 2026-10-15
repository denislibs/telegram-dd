// FOUNDATION STUB: WebPage (telegram-tt src/components/middle/message/WebPage.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
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
  onContainerClick?: ((e: React.MouseEvent) => void);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const WebPage = (_props: OwnProps) => undefined;

export default WebPage;
