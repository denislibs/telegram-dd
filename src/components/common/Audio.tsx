// FOUNDATION STUB: Audio (telegram-tt src/components/common/Audio.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiMessage } from '../../api/types';
import type { AudioVariant, PlaybackSource, ThemeKey, ThreadId } from '../../types';
import type { MenuItemContextAction } from '../ui/ListItem';

export type OwnProps = {
  theme: ThemeKey;
  message: ApiMessage;
  senderTitle?: string;
  uploadProgress?: number;
  variant: AudioVariant;
  threadId?: ThreadId;
  playbackSource?: PlaybackSource;
  noPlaylist?: boolean;
  noProgress?: boolean;
  withPlayingRing?: boolean;
  date?: number;
  noAvatars?: boolean;
  className?: string;
  isSelectable?: boolean;
  isSelected?: boolean;
  isDownloading?: boolean;
  isTranscribing?: boolean;
  isTranscribed?: boolean;
  canDownload?: boolean;
  canTranscribe?: boolean;
  isTranscriptionHidden?: boolean;
  isTranscriptionError?: boolean;
  autoPlay?: boolean;
  onHideTranscription?: (isHidden: boolean) => void;
  onPlay?: (messageId: number, chatId: string) => void;
  onPause?: NoneToVoidFunction;
  onReadMedia?: () => void;
  onCancelUpload?: () => void;
  onDateClick?: (arg: ApiMessage) => void;
  contextActions?: MenuItemContextAction[];
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Audio = (_props: OwnProps) => undefined;

export default Audio;
