// FOUNDATION STUB: useVoiceRecording (telegram-tt src/components/middle/composer/hooks/useVoiceRecording.ts) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
// Deviation: the stub returns plain values (inert functions, false, undefined); the real hook will return accessors.
// `ActiveRecording` and `Result` mirror tt's util/voiceRecording (not in src yet).
// `recordButtonRef` is a ref object as in tt; the real hook will return a callback ref.
type PeakListener = (peak: number) => void;

export type Result = { blob: Blob; duration: number; waveform: number[] };

export type ActiveRecording = {
  stop: (shouldSkipMinTime?: boolean) => Promise<Result>;
  pause: () => Promise<void>;
  resume: () => void;
  getSnapshot?: () => Uint8Array;
  getElapsedMs: () => number;
  getProfilePeaks: () => number[];
};

const useVoiceRecording = () => {
  return {
    startRecordingVoice: (async () => {}) as () => Promise<void>,
    pauseRecordingVoice: (async () => {}) as () => Promise<void>,
    resumeRecordingVoice: (() => {}) as NoneToVoidFunction,
    stopRecordingVoice: ((_shouldSkipMinTime?: boolean) => undefined) as (
      shouldSkipMinTime?: boolean,
    ) => Promise<Result | undefined> | undefined,
    cancelRecordingVoice: (() => {}) as NoneToVoidFunction,
    toggleViewOnceEnabled: (() => {}) as NoneToVoidFunction,
    subscribeToRecordingPeaks: ((_listener: PeakListener) => () => {}) as (
      listener: PeakListener,
    ) => NoneToVoidFunction,
    activeVoiceRecording: undefined as ActiveRecording | undefined,
    isRecordingPaused: false,
    recordButtonRef: { current: undefined } as { current: HTMLButtonElement | undefined },
    isViewOnceEnabled: false,
    setIsViewOnceEnabled: ((_value: boolean) => {}) as (value: boolean) => void,
  };
};

export default useVoiceRecording;
