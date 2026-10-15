// FOUNDATION STUB: CommentButton (telegram-tt src/components/middle/message/CommentButton.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { ApiCommentsInfo } from '../../../api/types';

import buildClassName from '../../../util/buildClassName';
import { PLACEHOLDER_SURFACE } from '../../common/helpers/placeholder';

export type OwnProps = {
  threadInfo?: ApiCommentsInfo;
  disabled?: boolean;
  isLoading?: boolean;
  isCustomShape?: boolean;
};

// tt's button is full width, 0.5rem paddings around a 2.125rem line.
// TODO(port): the real CommentButton (repliers avatars, comments count, loading spinner, opening the thread).
const CommentButton = (props: OwnProps) => {
  return (
    <div
      role="img"
      aria-label="Comments, not supported yet"
      class={buildClassName('CommentButton', props.isCustomShape && 'CommentButton-custom-shape')}
      style={`width: 100%; height: 3.125rem; ${PLACEHOLDER_SURFACE}`}
    />
  );
};

export default CommentButton;
