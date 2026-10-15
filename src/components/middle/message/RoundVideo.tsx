// FOUNDATION STUB: RoundVideo (telegram-tt src/components/middle/message/RoundVideo.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { ApiMessage } from '../../../api/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';

import buildClassName from '../../../util/buildClassName';
import { PLACEHOLDER_SURFACE } from '../../common/helpers/placeholder';

import './RoundVideo.scss';

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

// TODO(port): the real RoundVideo (playback, progress ring, transcription). `.RoundVideo` is 15rem square.
const RoundVideo = (props: OwnProps) => {
  return (
    <div
      role="img"
      aria-label="Round video, not supported yet"
      class={buildClassName('RoundVideo', 'media-inner', 'non-interactive', props.className)}
      style={`${PLACEHOLDER_SURFACE}; border-radius: 50%`}
    />
  );
};

export default RoundVideo;
