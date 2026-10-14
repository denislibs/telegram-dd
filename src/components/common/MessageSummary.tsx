import { createMemo } from 'frameact';
import { withGlobal } from '../../global';
import type { GlobalState } from '../../global/types';

import type { ObserveFn } from '../../hooks/useIntersectionObserver';

import type { ApiFormattedText, ApiMessage, ApiMessagePoll, ApiTypeStory, ApiWebPage } from '../../api/types';

import { extractMessageText, getMessagePollId, groupStatefulContent, isActionMessage } from '../../global/helpers';
import {
  getMessageSummaryDescription,
  getMessageSummaryEmoji,
  TRUNCATED_SUMMARY_LENGTH,
} from '../../global/helpers/messageSummary';
import { selectPeerStory, selectPollFromMessage, selectWebPageFromMessage } from '../../global/selectors';
import trimText from '../../util/trimText';
import renderText from './helpers/renderText';
import { renderTextWithEntities } from './helpers/renderTextWithEntities';

import useLang from '../../hooks/useLang';

import ActionMessageText from '../middle/message/ActionMessageText';
import MessageText from './MessageText';

type OwnProps = {
  message: ApiMessage;
  forcedText?: ApiFormattedText;
  noEmoji?: boolean;
  highlight?: string;
  truncateLength?: number;
  withTranslucentThumbs?: boolean;
  inChatList?: boolean;
  emojiSize?: number;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
};

type StateProps = {
  poll?: ApiMessagePoll;
  story?: ApiTypeStory;
  webPage?: ApiWebPage;
};

function MessageSummary(ownProps: OwnProps) {
  const props = withGlobal(ownProps, mapStateToProps);
  const lang = useLang();
  const extractedText = createMemo(() => extractMessageText(props.message, props.inChatList));
  const hasPoll = createMemo(() => Boolean(getMessagePollId(props.message)));
  const isAction = createMemo(() => isActionMessage(props.message));

  const statefulContent = createMemo(() =>
    groupStatefulContent({ poll: props.poll, story: props.story, webPage: props.webPage }),
  );
  const emoji = createMemo(() => !props.noEmoji && getMessageSummaryEmoji(props.message));

  // A body statement of tt that ran on every render: it is a binding here (`<>{renderSummary()}</>` below)
  function renderPlainSummary() {
    if (props.forcedText?.text) {
      const trimmedText = trimText(
        props.forcedText.text,
        props.truncateLength === undefined ? TRUNCATED_SUMMARY_LENGTH : props.truncateLength,
      );

      return (
        <span>
          {props.highlight
            ? renderText(trimmedText, ['emoji', 'highlight'], { highlight: props.highlight })
            : renderText(trimmedText)}
        </span>
      );
    }

    const description = getMessageSummaryDescription(lang, props.message, statefulContent());

    if (typeof description !== 'string') {
      const { todo } = props.message.content;
      const formattedSummaryText = todo?.todo.title;
      const renderedDescription = formattedSummaryText
        ? renderFormattedSummaryText({
            formattedText: formattedSummaryText,
            highlight: props.highlight,
            truncateLength: props.truncateLength === undefined ? TRUNCATED_SUMMARY_LENGTH : props.truncateLength,
            emojiSize: props.emojiSize,
            observeIntersectionForLoading: props.observeIntersectionForLoading,
            observeIntersectionForPlaying: props.observeIntersectionForPlaying,
            withTranslucentThumbs: props.withTranslucentThumbs,
          })
        : description;

      return (
        <span>{[emoji() ? renderText(`${emoji()} `) : undefined, renderedDescription].flat().filter(Boolean)}</span>
      );
    }

    const emojiWithSpace = emoji() ? `${emoji()} ` : '';
    const summaryText = `${emojiWithSpace}${description}`;
    const trimmedText = trimText(
      summaryText,
      props.truncateLength === undefined ? TRUNCATED_SUMMARY_LENGTH : props.truncateLength,
    );

    return (
      <span>
        {props.highlight
          ? renderText(trimmedText, ['emoji', 'highlight'], { highlight: props.highlight })
          : renderText(trimmedText)}
      </span>
    );
  }

  function renderMessageText() {
    if (isAction()) {
      return <ActionMessageText message={props.message} asPreview />;
    }

    return (
      <MessageText
        messageOrStory={props.message}
        forcedText={props.forcedText}
        highlight={props.highlight}
        asPreview
        observeIntersectionForLoading={props.observeIntersectionForLoading}
        observeIntersectionForPlaying={props.observeIntersectionForPlaying}
        withTranslucentThumbs={props.withTranslucentThumbs}
        truncateLength={props.truncateLength === undefined ? TRUNCATED_SUMMARY_LENGTH : props.truncateLength}
        inChatList={props.inChatList}
        emojiSize={props.emojiSize}
      />
    );
  }

  function renderSummary() {
    if (!extractedText() && !hasPoll() && !isAction()) {
      return renderPlainSummary();
    }

    return (
      <>
        {[
          emoji() ? renderText(`${emoji()} `) : undefined,
          getMessageSummaryDescription(lang, props.message, statefulContent(), renderMessageText()),
        ]
          .flat()
          .filter(Boolean)}
      </>
    );
  }

  return <>{renderSummary()}</>;
}

const mapStateToProps = (global: GlobalState, { message }: OwnProps): Complete<StateProps> => {
  const poll = selectPollFromMessage(global, message);
  const webPage = selectWebPageFromMessage(global, message);
  const storyData = message.content.storyData;
  const story = storyData && selectPeerStory(global, storyData.peerId, storyData.id);

  return {
    poll,
    story,
    webPage,
  };
};

export default MessageSummary;

function renderFormattedSummaryText({
  formattedText,
  highlight,
  truncateLength,
  emojiSize,
  observeIntersectionForLoading,
  observeIntersectionForPlaying,
  withTranslucentThumbs,
}: {
  formattedText: ApiFormattedText;
  highlight?: string;
  truncateLength?: number;
  emojiSize?: number;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  withTranslucentThumbs?: boolean;
}) {
  return renderTextWithEntities({
    text: trimText(formattedText.text, truncateLength),
    entities: formattedText.entities,
    highlight,
    emojiSize,
    asPreview: true,
    observeIntersectionForLoading,
    observeIntersectionForPlaying,
    withTranslucentThumbs,
  });
}
