// FOUNDATION STUB: useVideoRecording (telegram-tt src/components/middle/composer/hooks/useVideoRecording.ts) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
// Deviation: the stub returns plain values (inert functions, false, undefined); the real hook will return accessors.
// `ActiveVideoRecording` and `Result` mirror tt's util/videoRecording/types (not in src yet).
type PeakListener = (peak: number) => void;

export type Result = {
  blob: Blob;
  duration: number;
  durationMs: number;
  width: number;
  height: number;
};

export type ActiveVideoRecording = {
  previewStream: MediaStream;
  stop: () => Promise<Result>;
  cancel: () => void;
  pause: () => Promise<void>;
  resume: () => void;
  whenReady: Promise<void>;
  getElapsedMs: () => number;
  getProfilePeaks: () => number[];
  getPlaybackMedia?: () => Promise<HTMLVideoElement>;
  getPlaybackEl: () => HTMLVideoElement | undefined;
  destroyPlayback: () => void;
};

const useVideoRecording = () => {
  return {
    startRecordingVideo: (async () => {}) as () => Promise<void>,
    stopRecordingVideo: (() => undefined) as () => Promise<Result | undefined> | undefined,
    finishRecordingVideo: (() => {}) as NoneToVoidFunction,
    discardRecordingVideo: (() => {}) as NoneToVoidFunction,
    pauseRecordingVideo: (async () => {}) as () => Promise<void>,
    resumeRecordingVideo: (() => {}) as NoneToVoidFunction,
    activeVideoRecording: undefined as ActiveVideoRecording | undefined,
    previewStream: undefined as MediaStream | undefined,
    isVideoRecordingStarting: false,
    isVideoRecordingReady: false,
    isVideoRecordingPaused: false,
    isRecordingFinished: false,
    getProgress: (() => 0) as () => number,
    subscribeToVideoRecordingPeaks: ((_listener: PeakListener) => () => {}) as (
      listener: PeakListener,
    ) => NoneToVoidFunction,
  };
};

export default useVideoRecording;
