import { Show } from 'frameact/dom';

import type { ApiTopic } from '../../api/types';
import type { MessageListType } from '../../types';

import { REM } from '../common/helpers/mediaDimensions';
import renderText from '../common/helpers/renderText';

import useOldLang from '../../hooks/useOldLang';

import Icon from '../common/icons/Icon';
import TopicIcon from '../common/TopicIcon';

import './NoMessages.scss';

const ICON_SIZE = 3 * REM;

type OwnProps = {
  chatId: string;
  isChatWithSelf?: boolean;
  type: MessageListType;
  isGroupChatJustCreated?: boolean;
  topic?: ApiTopic;
};

const NoMessages = (props: OwnProps) => {
  const lang = useOldLang();

  return (
    <Show when={!(props.type === 'scheduled')} fallback={renderScheduled(lang)}>
    <Show when={!props.isChatWithSelf} fallback={renderSavedMessages(lang)}>
    <Show when={!props.isGroupChatJustCreated} fallback={renderGroup(lang)}>
    <Show when={!props.topic} fallback={renderTopic(lang, props.topic)}>
    <div class="empty">
      <span>{lang('NoMessages')}</span>
    </div>
    </Show>
    </Show>
    </Show>
    </Show>
  );
};

function renderTopic(lang: OldLangFn, topic: ApiTopic) {
  return (
    <div class="NoMessages">
      <div class="wrapper">
        <TopicIcon topic={topic} size={ICON_SIZE} className="no-messages-icon topic-icon" />
        <h3 class="title">{lang('Chat.EmptyTopicPlaceholder.Title')}</h3>
        <p class="description topic-description">{renderText(lang('Chat.EmptyTopicPlaceholder.Text'), ['br'])}</p>
      </div>
    </div>
  );
}

function renderScheduled(lang: OldLangFn) {
  return (
    <div class="empty">
      <span>{lang('ScheduledMessages.EmptyPlaceholder')}</span>
    </div>
  );
}

function renderSavedMessages(lang: OldLangFn) {
  return (
    <div class="NoMessages">
      <div class="wrapper">
        <Icon name="cloud-download" className="no-messages-icon" />
        <h3 class="title">{lang('Conversation.CloudStorageInfo.Title')}</h3>
        <ul class="description">
          <li>{lang('Conversation.ClousStorageInfo.Description1')}</li>
          <li>{lang('Conversation.ClousStorageInfo.Description2')}</li>
          <li>{lang('Conversation.ClousStorageInfo.Description3')}</li>
          <li>{lang('Conversation.ClousStorageInfo.Description4')}</li>
        </ul>
      </div>
    </div>
  );
}

function renderGroup(lang: OldLangFn) {
  return (
    <div class="NoMessages">
      <div class="wrapper" dir={lang.isRtl ? 'rtl' : undefined}>
        <h3 class="title">{lang('EmptyGroupInfo.Title')}</h3>
        <p class="description">{lang('EmptyGroupInfo.Subtitle')}</p>
        <ul class="list-checkmarks">
          <li>{lang('EmptyGroupInfo.Line1')}</li>
          <li>{lang('EmptyGroupInfo.Line2')}</li>
          <li>{lang('EmptyGroupInfo.Line3')}</li>
          <li>{lang('EmptyGroupInfo.Line4')}</li>
        </ul>
      </div>
    </div>
  );
}

export default NoMessages;
