// FOUNDATION STUB: StoryMention (telegram-tt src/components/middle/message/StoryMention.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { ApiMessage } from '../../../api/types';

export interface OwnProps {
  message: ApiMessage;
}

// `.action-message-story-mention` and its children are styled by Message.scss: the media circle is 5.5rem.
// TODO(port): the real StoryMention (story thumbnail, title, opening the story).
const StoryMention = (_props: OwnProps) => {
  return (
    <div role="img" aria-label="Story mention, not supported yet" class="action-message-story-mention">
      <span class="story-media-wrapper" />
      <span class="story-title">{'\u00A0'}</span>
    </div>
  );
};

export default StoryMention;
