import { createEffect, createMemo } from 'frameact';
import { For } from 'frameact/dom';
import { getActions, withGlobal } from '../../global';

import type { GlobalState } from '../../global/types';
import type { MessageListType, ThreadId, ThreadReadState } from '../../types';
import type { IconName } from '../../types/icons';

import { selectChat, selectCurrentMessageList, selectCurrentMiddleSearch } from '../../global/selectors';
import { selectThreadReadState } from '../../global/selectors/threads';
import buildClassName from '../../util/buildClassName';
import { depsOf } from '../../util/effectDeps';

import ScrollDownButton from './ScrollDownButton';

import styles from './FloatingActionButtons.module.scss';

type OwnProps = {
  withScrollDown: boolean;
  isHidden?: boolean;
};

type StateProps = {
  chatId?: string;
  messageListType?: MessageListType;
  threadId?: ThreadId;
  threadReadState?: ThreadReadState;
  shouldShowCount?: boolean;
};

type UnreadCountButton = {
  icon: IconName;
  ariaLabelLang: string;
  unreadCount?: number;
  isHidden: boolean;
  hiddenUnreadCountButtonsBelow: number;
  onClick: VoidFunction;
  onReadAll: VoidFunction;
};

const FloatingActionButtons = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const {
    focusNextPollVote,
    focusNextReply,
    focusNextReaction,
    focusNextMention,
    loadUnreadPollVotes,
    loadUnreadReactions,
    readAllMentions,
    readAllPollVotes,
    readAllReactions,
    loadUnreadMentions,
    scrollMessageListToBottom,
  } = getActions();

  let elementRef!: HTMLDivElement;

  const source = createMemo((): Partial<ThreadReadState> => (props.shouldShowCount && props.threadReadState) || {});
  const unreadPollVotesCount = () => source().unreadPollVotesCount;
  const unreadReactionsCount = () => source().unreadReactionsCount;
  const unreadMentionsCount = () => source().unreadMentionsCount;
  const unreadCount = () => source().unreadCount;
  const unreadPollVotes = () => source().unreadPollVotes;
  const unreadReactions = () => source().unreadReactions;
  const unreadMentions = () => source().unreadMentions;

  const hasUnreadPollVotes = createMemo(() => Boolean(unreadPollVotesCount()));
  const hasUnreadReactions = createMemo(() => Boolean(unreadReactionsCount()));
  const hasUnreadMentions = createMemo(() => Boolean(unreadMentionsCount()));

  const handleReadAllPollVotes = () => {
    if (!props.chatId) return;
    readAllPollVotes({ chatId: props.chatId, threadId: props.threadId });
  };

  const handleReadAllReactions = () => {
    if (!props.chatId) return;
    readAllReactions({ chatId: props.chatId, threadId: props.threadId });
  };

  const handleReadAllMentions = () => {
    if (!props.chatId) return;
    readAllMentions({ chatId: props.chatId, threadId: props.threadId });
  };

  createEffect(
    depsOf(() => [props.chatId, props.threadId, hasUnreadPollVotes(), unreadPollVotes()?.length] as const),
    ([chatId2, threadId2, hasUnreadPollVotes2]) => {
      if (hasUnreadPollVotes2 && chatId2 && !unreadPollVotes()?.length) {
        loadUnreadPollVotes({ chatId: chatId2, threadId: threadId2 });
      }
    },
  );

  createEffect(
    depsOf(() => [props.chatId, props.threadId, hasUnreadReactions(), unreadReactions()?.length] as const),
    ([chatId2, threadId2, hasUnreadReactions2]) => {
      if (hasUnreadReactions2 && chatId2 && !unreadReactions()?.length) {
        loadUnreadReactions({ chatId: chatId2, threadId: threadId2 });
      }
    },
  );

  createEffect(
    depsOf(() => [props.chatId, props.threadId, hasUnreadMentions(), unreadMentions()?.length] as const),
    ([chatId2, threadId2, hasUnreadMentions2]) => {
      if (hasUnreadMentions2 && chatId2 && !unreadMentions()?.length) {
        loadUnreadMentions({ chatId: chatId2, threadId: threadId2 });
      }
    },
  );

  const handleScrollDownClick = () => {
    if (!props.withScrollDown) {
      return;
    }

    if (props.messageListType === 'thread') {
      focusNextReply();
    } else {
      scrollMessageListToBottom();
    }
  };

  const handleFocusNextReaction = () => {
    if (!props.chatId) return;
    focusNextReaction({ chatId: props.chatId, threadId: props.threadId });
  };

  const handleFocusNextPollVote = () => {
    if (!props.chatId) return;
    focusNextPollVote({ chatId: props.chatId, threadId: props.threadId });
  };

  const handleFocusNextMention = () => {
    if (!props.chatId) return;
    focusNextMention({ chatId: props.chatId, threadId: props.threadId });
  };

  const unreadCountButtonsConfig = createMemo(
    () =>
      [
        {
          icon: 'poll',
          ariaLabelLang: 'AccDescrPollVoteDown',
          unreadCount: unreadPollVotesCount(),
          isHidden: !hasUnreadPollVotes(),
          onClick: handleFocusNextPollVote,
          onReadAll: handleReadAllPollVotes,
        },
        {
          icon: 'heart-outline',
          ariaLabelLang: 'AccDescrReactionMentionDown',
          unreadCount: unreadReactionsCount(),
          isHidden: !hasUnreadReactions(),
          onClick: handleFocusNextReaction,
          onReadAll: handleReadAllReactions,
        },
        {
          icon: 'mention',
          ariaLabelLang: 'AccDescrMentionDown',
          unreadCount: unreadMentionsCount(),
          isHidden: !hasUnreadMentions(),
          onClick: handleFocusNextMention,
          onReadAll: handleReadAllMentions,
        },
      ] satisfies Omit<UnreadCountButton, 'hiddenUnreadCountButtonsBelow'>[],
  );

  const unreadCountButtons = createMemo(() => {
    let hiddenUnreadCountButtonsBelow = 0;
    return unreadCountButtonsConfig().reduceRight<UnreadCountButton[]>((result, button) => {
      result.unshift({
        ...button,
        hiddenUnreadCountButtonsBelow,
      });

      if (button.isHidden) {
        hiddenUnreadCountButtonsBelow++;
      }

      return result;
    }, []);
  });

  const hasUnreadCountButtons = createMemo(() => unreadCountButtons().some((button) => !button.isHidden));

  const buildUnreadCountButtonClassName = (button: UnreadCountButton) =>
    buildClassName(
      styles.unreadCountButton,
      button.isHidden && styles.hidden,
      button.hiddenUnreadCountButtonsBelow === 1 && styles.transformDown,
      button.hiddenUnreadCountButtonsBelow === 2 && styles.transformDownDouble,
    );

  const fabClassName = createMemo(() =>
    buildClassName(
      styles.root,
      !props.isHidden && (props.withScrollDown || hasUnreadCountButtons()) && styles.revealed,
      !props.isHidden && hasUnreadCountButtons() && !props.withScrollDown && styles.hideScrollDown,
    ),
  );

  return (
    <div ref={elementRef} class={fabClassName()} inert={props.isHidden}>
      <For each={unreadCountButtons()} keyed={(button) => button.icon}>
        {(button) => (
          <ScrollDownButton
            icon={button().icon}
            ariaLabelLang={button().ariaLabelLang}
            onClick={button().onClick}
            onReadAll={button().onReadAll}
            unreadCount={button().unreadCount}
            className={buildUnreadCountButtonClassName(button())}
          />
        )}
      </For>

      <ScrollDownButton
        icon="arrow-down"
        ariaLabelLang="AccDescrPageDown"
        onClick={handleScrollDownClick}
        unreadCount={unreadCount()}
        className={styles.unread}
      />
    </div>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  const currentMessageList = selectCurrentMessageList(global);
  if (!currentMessageList) {
    return {
      chatId: undefined,
      messageListType: undefined,
      shouldShowCount: undefined,
      threadId: undefined,
      threadReadState: undefined,
    };
  }

  const { chatId, threadId, type: messageListType } = currentMessageList;
  const chat = selectChat(global, chatId);
  const hasActiveMiddleSearch = Boolean(selectCurrentMiddleSearch(global));

  const shouldShowCount = chat && messageListType === 'thread' && !hasActiveMiddleSearch;

  return {
    messageListType,
    chatId,
    threadId,
    threadReadState: selectThreadReadState(global, chatId, threadId),
    shouldShowCount,
  };
};

export default FloatingActionButtons;
