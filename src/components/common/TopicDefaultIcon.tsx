import { createMemo } from 'frameact';
import { Show } from 'frameact/dom';

import type { ThreadId } from '../../types';

import { GENERAL_TOPIC_ID } from '../../config';
import buildClassName from '../../util/buildClassName';
import { getTopicDefaultIcon } from '../../util/forumColors';
import { getFirstLetters } from '../../util/textFormat';
import renderText from './helpers/renderText';

import Icon from './icons/Icon';

import styles from './TopicDefaultIcon.module.scss';

type OwnProps = {
  className?: string;
  letterClassName?: string;
  topicId: ThreadId;
  iconColor?: number;
  title: string;
  onClick?: NoneToVoidFunction;
};

const TopicDefaultIcon = (props: OwnProps) => {
  const iconSrc = createMemo(() => getTopicDefaultIcon(props.iconColor));

  return (
    <Show
      when={!(props.topicId === GENERAL_TOPIC_ID)}
      fallback={
        <Icon
          name="hashtag"
          className={buildClassName(styles.root, props.className, 'general-forum-icon')}
          onClick={props.onClick}
        />
      }
    >
      <div class={buildClassName(styles.root, props.className)} onClick={() => props.onClick?.()}>
        <img class={styles.icon} src={iconSrc()} alt="" draggable="false" />
        <div class={buildClassName(styles.title, props.letterClassName, 'topic-icon-letter')}>
          {renderText(getFirstLetters(props.title, 1))}
        </div>
      </div>
    </Show>
  );
};

export default TopicDefaultIcon;
