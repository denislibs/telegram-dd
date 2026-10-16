// FOUNDATION STUB: RoundVideoRecorder (telegram-tt src/components/middle/composer/RoundVideoRecorder.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
// Deviation: `ref` is a callback ref (tt: an `ElementRef`), as in the other ported components.
type OwnProps = {
  ref?: (el: HTMLDivElement) => void;
  previewStream?: MediaStream;
  isReady?: boolean;
  isPaused?: boolean;
  isFrozen?: boolean;
  getProgress: () => number;
  getPlaybackEl?: () => HTMLVideoElement | undefined;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RoundVideoRecorder = (_props: OwnProps) => undefined;

export default RoundVideoRecorder;
