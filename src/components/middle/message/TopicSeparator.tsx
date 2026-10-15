import { createEffect, createMemo } from 'frameact';
import { getActions, withGlobal } from '../../../global';
import { depsOf } from '../../../util/effectDeps';
import type { GlobalState } from '../../../global/types';

import type { ApiTopic } from '../../../api/types';

import { selectChat, selectTopic, selectTopicsInfo } from '../../../global/selectors';
import { REM } from '../../common/helpers/mediaDimensions';
import renderText from '../../common/helpers/renderText';
import { preventMessageInputBlurWithBubbling } from '../helpers/preventMessageInputBlur';

import useLang from '../../../hooks/useLang';

import Icon from '../../common/icons/Icon';
import TopicIcon from '../../common/TopicIcon';

type OwnProps = {
  chatId: string;
  topicId: number;
};

type StateProps = {
  topic?: ApiTopic;
  chatTitle?: string;
  areTopicsLoaded: boolean;
};

const TOPIC_ICON_SIZE = 1.25 * REM;

const TopicSeparator = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { openThread, loadTopicById } = getActions();

  const lang = useLang();

  const isTopicMissing = createMemo(() => !props.topic && props.areTopicsLoaded);
  const title = createMemo(() => props.topic ? props.topic.title : isTopicMissing() ? props.chatTitle : undefined);

  createEffect(depsOf(() => [props.chatId, props.topicId, isTopicMissing()] as const), ([chatId2, topicId2, isTopicMissing2]) => {
    if (isTopicMissing2) {
      loadTopicById({ chatId: chatId2, topicId: topicId2 });
    }
  });

  const handleClick = () => {
    openThread({ chatId: props.chatId, threadId: props.topicId });
  };

  return (
    <div class="sticky-topic">
      <button
        type="button"
        class="topic-pill"
        dir="auto"
        onMouseDown={preventMessageInputBlurWithBubbling}
        onClick={handleClick}
      >
        {props.topic && <TopicIcon topic={props.topic} size={TOPIC_ICON_SIZE} className="topic-pill-icon" />}
        <span class="topic-pill-title">{title() ? renderText(title()) : lang('Loading')}</span>
        <Icon name="next-link" className="topic-pill-chevron" />
      </button>
    </div>
  );
};

const mapStateToProps = (global: GlobalState, { chatId, topicId }: OwnProps): Complete<StateProps> => {
    const topicsInfo = selectTopicsInfo(global, chatId);

    return {
      topic: selectTopic(global, chatId, topicId),
      chatTitle: selectChat(global, chatId)?.title,
      areTopicsLoaded: Boolean(topicsInfo?.listedTopicIds && !topicsInfo.isCache),
    };
  };

export default TopicSeparator;
