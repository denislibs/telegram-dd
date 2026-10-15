import { createEffect, createMemo } from 'frameact';
import { Show } from 'frameact/dom';
import { getActions, getGlobal, trackGlobal, withGlobal } from '../../global';
import { depsOf } from '../../util/effectDeps';
import type { GlobalState } from '../../global/types';

import type { ApiChat, ApiTopic, ApiTypingStatus, ApiUser } from '../../api/types';
import type { IconName } from '../../types/icons';
import { MediaViewerOrigin, type StoryViewerOrigin, type ThreadId } from '../../types';

import { getChatTypeLangKey, getGroupStatus, getMainUsername, isChatSuperGroup } from '../../global/helpers';
import {
  selectChat,
  selectChatMessages,
  selectChatOnlineCount,
  selectIsChatRestricted,
  selectMonoforumChannel,
  selectTopic,
  selectUser,
} from '../../global/selectors';
import { selectThreadMessagesCount } from '../../global/selectors/threads';
import buildClassName from '../../util/buildClassName';
import { REM } from './helpers/mediaDimensions';
import renderText from './helpers/renderText';

import useLang from '../../hooks/useLang';

import Transition from '../ui/Transition';
import Avatar from './Avatar';
import DotAnimation from './DotAnimation';
import FullNameTitle from './FullNameTitle';
import Icon from './icons/Icon';
import TopicIcon from './TopicIcon';
import TypingStatus from './TypingStatus';

const TOPIC_ICON_SIZE = 2.5 * REM;

type OwnProps = {
  chatId: string;
  threadId?: ThreadId;
  className?: string;
  statusIcon?: IconName;
  typingStatusByPeerId?: Record<string, ApiTypingStatus>;
  avatarSize?: 'tiny' | 'small' | 'medium' | 'large' | 'jumbo';
  status?: string;
  withDots?: boolean;
  withMediaViewer?: boolean;
  withUsername?: boolean;
  withFullInfo?: boolean;
  withUpdatingStatus?: boolean;
  withChatType?: boolean;
  noEmojiStatus?: boolean;
  emojiStatusSize?: number;
  noRtl?: boolean;
  noAvatar?: boolean;
  noStatusOrTyping?: boolean;
  withStory?: boolean;
  storyViewerOrigin?: StoryViewerOrigin;
  isSavedDialog?: boolean;
  withMonoforumStatus?: boolean;
  onClick?: VoidFunction;
  onEmojiStatusClick?: VoidFunction;
};

type StateProps = {
  chat?: ApiChat;
  topic?: ApiTopic;
  onlineCount?: number;
  areMessagesLoaded: boolean;
  messagesCount?: number;
  self?: ApiUser;
  monoforumChannel?: ApiChat;
};

const GroupChatInfo = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { loadFullChat, openMediaViewer, loadMoreProfilePhotos } = getActions();

  const chat = createMemo(() => !props.withMonoforumStatus && props.monoforumChannel ? props.monoforumChannel : props.chat);

  const lang = useLang();

  const isSuperGroup = createMemo(() => chat() && isChatSuperGroup(chat()));
  const isTopic = createMemo(() => Boolean(chat()?.isForum && props.topic));
  const source = createMemo(() => chat() || {});
  const chatId = () => source().id;
  const isMin = () => source().isMin;
  const isRestricted = createMemo(() => selectIsChatRestricted(getGlobal(), chatId()!));

  createEffect(depsOf(() => [chatId(), isMin(), props.withFullInfo, isSuperGroup(), props.withMediaViewer] as const), ([chatId2, isMin2, withFullInfo2, isSuperGroup2, withMediaViewer2]) => {
    if (chatId2 && !isMin2) {
      if (withFullInfo2) loadFullChat({ chatId: chatId2 });
      if (withMediaViewer2) loadMoreProfilePhotos({ peerId: chatId2, isPreload: true });
    }
  });

  const handleAvatarViewerOpen = (e: React.MouseEvent<HTMLDivElement, MouseEvent>, hasMedia: boolean) => {
      if (chat() && hasMedia) {
        e.stopPropagation();
        openMediaViewer({
          isAvatarView: true,
          chatId: chat().id,
          mediaIndex: 0,
          origin: (props.avatarSize === undefined ? 'medium' : props.avatarSize) === 'jumbo' ? MediaViewerOrigin.ProfileAvatar : MediaViewerOrigin.MiddleHeaderAvatar,
        });
      }
    };

  const mainUsername = createMemo(() => chat() && props.withUsername && getMainUsername(chat()));

  function renderStatusOrTyping() {
    if (props.withUpdatingStatus && !props.areMessagesLoaded && !isRestricted()) {
      return <DotAnimation className="status" content={lang('Updating')} />;
    }

    if (props.withMonoforumStatus) {
      return (
        <span class="status" dir="auto">
          {lang('MonoforumStatus')}
        </span>
      );
    }

    if (props.chat?.isMonoforum) {
      return undefined;
    }

    if (props.status) {
      return props.withDots ? (
        <DotAnimation className="status" content={props.status} />
      ) : (
        <span class="status" dir="auto">
          {props.statusIcon && <Icon className="status-icon" name={props.statusIcon} />}
          {renderText(props.status)}
        </span>
      );
    }

    if (!chat()) {
      return undefined;
    }

    if (props.typingStatusByPeerId) {
      return <TypingStatus typingStatusByPeerId={props.typingStatusByPeerId} />;
    }

    if (isTopic()) {
      return (
        <span class="status" dir="auto">
          {/* TODO(codemod): <Transition> children: use the render function and render by slide.key (framework guide §6) */}
          <Transition
            name="fade"
            shouldRestoreHeight
            activeKey={props.messagesCount !== undefined ? 1 : 2}
            className="message-count-transition"
          >
            {props.messagesCount !== undefined
              ? lang('Messages', { count: props.messagesCount }, { pluralValue: props.messagesCount })
              : lang('ChatInfoNoMessages')}
          </Transition>
        </span>
      );
    }

    if (props.withChatType) {
      return (
        <span class="status" dir="auto">
          {lang(getChatTypeLangKey(chat()))}
        </span>
      );
    }

    const groupStatusElement = <span class="group-status">{trackGlobal(() => getGroupStatus(lang, chat()))}</span>;
    const onlineStatus = props.onlineCount
      ? lang('OnlineCount', { count: props.onlineCount }, { pluralValue: props.onlineCount })
      : undefined;
    const onlineStatusElement = onlineStatus ? <span class="online-status">{onlineStatus}</span> : undefined;

    return (
      <span class="status">
        {mainUsername() && <span class="handle withStatus">{mainUsername()}</span>}
        {!onlineStatusElement
          ? groupStatusElement
          : lang(
              'GroupStatusWithOnline',
              {
                status: groupStatusElement,
                onlineCount: onlineStatusElement,
              },
              { withNodes: true },
            )}
      </span>
    );
  }

  return (
    <Show when={chat()}>
    <div
      class={buildClassName('ChatInfo', props.className)}
      dir={!props.noRtl && lang.isRtl ? 'rtl' : undefined}
      onClick={(e) => props.onClick?.(e)}
    >
      {!props.noAvatar && !isTopic() && (
        <>
          {props.isSavedDialog && props.self && (
            <Avatar
              size={(props.avatarSize === undefined ? 'medium' : props.avatarSize)}
              peer={props.self}
              isSavedMessages
              className="saved-dialog-avatar"
            />
          )}
          {/* TODO(codemod): key= on a single element remounted it: wrap in <Show when={key} keyed>{() => …}</Show> */}
          <Avatar
            key={chat().id}
            className={buildClassName(props.isSavedDialog && 'overlay-avatar')}
            size={(props.avatarSize === undefined ? 'medium' : props.avatarSize)}
            peer={chat()}
            withStory={props.withStory}
            asMessageBubble={Boolean(props.monoforumChannel)}
            storyViewerOrigin={props.storyViewerOrigin}
            storyViewerMode="single-peer"
            isSavedDialog={props.isSavedDialog}
            onClick={props.withMediaViewer ? handleAvatarViewerOpen : undefined}
          />
        </>
      )}
      {isTopic() && <TopicIcon topic={props.topic!} className="topic-header-icon" size={TOPIC_ICON_SIZE} />}
      <div class="info">
        {props.topic ? (
          <h3 dir="auto" class="fullName">
            {renderText(props.topic.title)}
          </h3>
        ) : (
          <FullNameTitle
            peer={chat()}
            isMonoforum={!props.withMonoforumStatus && Boolean(props.monoforumChannel)}
            emojiStatusSize={props.emojiStatusSize}
            withEmojiStatus={!props.noEmojiStatus}
            isSavedDialog={props.isSavedDialog}
            onEmojiStatusClick={props.onEmojiStatusClick}
          />
        )}
        {!props.noStatusOrTyping && renderStatusOrTyping()}
      </div>
    </div>
    </Show>
  );
};

const mapStateToProps = (global: GlobalState, { chatId, threadId, isSavedDialog }: OwnProps): Complete<StateProps> => {
    const chat = selectChat(global, chatId);
    const onlineCount = chat ? selectChatOnlineCount(global, chat) : undefined;
    const areMessagesLoaded = Boolean(
      isSavedDialog ? selectChatMessages(global, global.currentUserId!) : selectChatMessages(global, chatId),
    );
    const topic = threadId ? selectTopic(global, chatId, threadId) : undefined;
    const messagesCount = topic && selectThreadMessagesCount(global, chatId, threadId!);
    const self = selectUser(global, global.currentUserId!);
    const monoforumChannel = selectMonoforumChannel(global, chatId);

    return {
      chat,
      onlineCount,
      topic,
      areMessagesLoaded,
      messagesCount,
      self,
      monoforumChannel,
    };
  };

export default GroupChatInfo;
