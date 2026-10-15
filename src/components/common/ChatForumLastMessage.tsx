import { createMemo } from 'frameact';
import type { JSX } from 'frameact/jsx-runtime';
import { getActions } from '../../global';

import type { ApiChat } from '../../api/types';
import type { GlobalState } from '../../global/types';
import type { ObserveFn } from '../../hooks/useIntersectionObserver';
import type { GroupedLastMessageItem } from './ChatGroupedLastMessage';

import { getOrderedTopics } from '../../global/helpers';
import { selectTopic } from '../../global/selectors';
import { selectThread } from '../../global/selectors/threads';
import { buildCollectionByCallback, mapTruthyValues } from '../../util/iteratees';

import { useShallowSelector } from '../../hooks/data/useSelector';
import { getIsMobile } from '../../hooks/useAppLayout';

import ChatGroupedLastMessage from './ChatGroupedLastMessage';
import TopicIcon from './TopicIcon';

type OwnProps = {
  chat: ApiChat;
  topicIds?: number[];
  hasTags?: boolean;
  renderLastMessage: () => JSX.Element | undefined;
  observeIntersection?: ObserveFn;
};

const MAX_TOPICS = 3;

const ChatForumLastMessage = (props: OwnProps) => {
  const { openThread } = getActions();

  const topicsThreadSelector = (global: GlobalState) => {
    return buildCollectionByCallback(props.topicIds || [], (tId) => [tId, selectThread(global, props.chat.id, tId)]);
  };
  const topicsThreads = useShallowSelector(topicsThreadSelector);

  const topicsSelector = (global: GlobalState) => {
    return props.topicIds?.map((tId) => selectTopic(global, props.chat.id, tId)).filter(Boolean);
  };
  const topics = useShallowSelector(topicsSelector);

  const orderedTopics = createMemo(() => {
    const currentTopics = topics();
    if (!currentTopics) {
      return undefined;
    }

    const topicsThreadInfos = mapTruthyValues(topicsThreads(), (t) => t?.threadInfo);

    return getOrderedTopics(currentTopics, topicsThreadInfos, undefined, true).slice(0, MAX_TOPICS);
  });

  const items = createMemo((): GroupedLastMessageItem[] | undefined => {
    return orderedTopics()?.map((topic) => ({
      key: topic.id,
      title: topic.title,
      isUnread: Boolean(topicsThreads()[topic.id]?.readState?.unreadCount),
      icon: <TopicIcon topic={topic} observeIntersection={props.observeIntersection} />,
    }));
  });

  const handleMainItemClick = () => {
    const lastActiveTopic = orderedTopics()?.[0];
    if (!lastActiveTopic) return false;
    if (
      topicsThreads()[lastActiveTopic.id]?.readState?.unreadCount === 0 ||
      (props.chat.isForumAsMessages && !props.chat.isBotForum)
    ) {
      return false;
    }

    openThread({
      chatId: props.chat.id,
      threadId: lastActiveTopic.id,
      shouldReplaceHistory: true,
      noForumTopicPanel: getIsMobile(),
    });

    return true;
  };

  return (
    <ChatGroupedLastMessage
      items={items()}
      hasTags={props.hasTags}
      renderLastMessage={props.renderLastMessage}
      onMainItemClick={handleMainItemClick}
    />
  );
};

export default ChatForumLastMessage;
