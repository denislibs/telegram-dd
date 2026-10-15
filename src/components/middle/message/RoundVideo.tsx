// FOUNDATION STUB: RoundVideo (telegram-tt src/components/middle/message/RoundVideo.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiMessage } from '../../../api/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';

export type OwnProps = {
  message: ApiMessage;
  className?: string;
  canAutoLoad?: boolean;
  isDownloading?: boolean;
  origin?: 'oneTimeModal';
  observeIntersection?: ObserveFn;
  onStop?: NoneToVoidFunction;
  onReadMedia?: NoneToVoidFunction;
  onHideTranscription?: (isHidden: boolean) => void;
  isTranscriptionError?: boolean;
  canTranscribe?: boolean;
  isTranscribed?: boolean;
  isTranscriptionHidden?: boolean;
  isTranscribing?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RoundVideo = (_props: OwnProps) => undefined;

export default RoundVideo;
