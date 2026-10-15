// FOUNDATION STUB: Audio (telegram-tt src/components/common/Audio.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { ApiMessage } from '../../api/types';
import type { AudioVariant, PlaybackSource, ThemeKey, ThreadId } from '../../types';
import type { MenuItemContextAction } from '../ui/ListItem';

import buildClassName from '../../util/buildClassName';
import { PLACEHOLDER_RADIUS, PLACEHOLDER_SURFACE } from './helpers/placeholder';

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

// The play button of tt's audio is 3.375rem.
// TODO(port): the real Audio (play / pause, seek bar, waveform of a voice message, transcription).
const Audio = (props: OwnProps) => {
  return (
    <div
      role="img"
      aria-label="Audio, not supported yet"
      class={buildClassName('Audio', props.variant, props.className)}
      style={`min-width: 15rem; max-width: 100%; height: 3.375rem; ${PLACEHOLDER_SURFACE}; ${PLACEHOLDER_RADIUS}`}
    />
  );
};

export default Audio;
