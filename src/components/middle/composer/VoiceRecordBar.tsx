// FOUNDATION STUB: VoiceRecordBar (telegram-tt src/components/middle/composer/VoiceRecordBar.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
// Deviation: `ref` is a callback ref (tt: an `ElementRef`), as in the other ported components.
export type BarRecording = {
  getElapsedMs: () => number;
  getProfilePeaks: () => number[];
  // Voice recording (native recorder only): a playable OGG snapshot of everything captured so far
  getSnapshot?: () => Uint8Array;
  // Video-message recording only: a ready-made media element for re-watching
  getPlaybackMedia?: () => Promise<HTMLMediaElement>;
};

type OwnProps = {
  ref?: (el: HTMLDivElement) => void;
  recording: BarRecording;
  isPaused: boolean;
  isVideo?: boolean;
  canSendOneTimeMedia?: boolean;
  isViewOnceEnabled?: boolean;
  onPause: NoneToVoidFunction;
  onResume: NoneToVoidFunction;
  onCancel: NoneToVoidFunction;
  onToggleViewOnce: NoneToVoidFunction;
  subscribeToPeaks: (listener: (peak: number) => void) => NoneToVoidFunction;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const VoiceRecordBar = (_props: OwnProps) => undefined;

export default VoiceRecordBar;
