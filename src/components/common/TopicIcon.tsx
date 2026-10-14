import { Show } from 'frameact/dom';

import type { ObserveFn } from '../../hooks/useIntersectionObserver';
import type { ApiTopic } from '../../api/types';

import CustomEmoji from './CustomEmoji';
import TopicDefaultIcon from './TopicDefaultIcon';

type OwnProps = {
  topic: Pick<ApiTopic, 'iconEmojiId' | 'iconColor' | 'title' | 'id'>;
  className?: string;
  letterClassName?: string;
  size?: number;
  noLoopLimit?: true;
  observeIntersection?: ObserveFn;
  onClick?: NoneToVoidFunction;
};

const LOOP_LIMIT = 2;
const DEFAULT_ICON_ID = '0';

const TopicIcon = (props: OwnProps) => {
  return (
    <Show
      when={!(props.topic.iconEmojiId && props.topic.iconEmojiId !== DEFAULT_ICON_ID)}
      fallback={
        <CustomEmoji
          documentId={props.topic.iconEmojiId!}
          className={props.className}
          size={props.size}
          observeIntersectionForPlaying={props.observeIntersection}
          loopLimit={!props.noLoopLimit ? LOOP_LIMIT : undefined}
          onClick={props.onClick}
        />
      }
    >
      <TopicDefaultIcon
        iconColor={props.topic.iconColor}
        title={props.topic.title}
        topicId={props.topic.id}
        className={props.className}
        letterClassName={props.letterClassName}
        onClick={props.onClick}
      />
    </Show>
  );
};

export default TopicIcon;
