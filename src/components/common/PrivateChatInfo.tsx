import { createEffect, createMemo, currentOrPrev } from 'frameact';
import { Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';
import { getActions, withGlobal } from '../../global';

import type { ApiChatMember, ApiTopic, ApiTypingStatus, ApiUser, ApiUserStatus } from '../../api/types';
import type { GlobalState } from '../../global/types';
import type { CustomPeer, StoryViewerOrigin, ThreadId } from '../../types';
import type { IconName } from '../../types/icons';
import { MediaViewerOrigin } from '../../types';

import { getMainUsername, getUserStatus, isSystemBot, isUserOnline } from '../../global/helpers';
import { selectChatMessages, selectTopic, selectUser, selectUserStatus } from '../../global/selectors';
import { selectThreadMessagesCount } from '../../global/selectors/threads';
import buildClassName from '../../util/buildClassName';
import { depsOf } from '../../util/effectDeps';
import { hasRank } from './helpers/chatMember';
import { REM } from './helpers/mediaDimensions';
import renderText from './helpers/renderText';

import useIntervalForceUpdate from '../../hooks/schedulers/useIntervalForceUpdate';
import useLang from '../../hooks/useLang';
import useOldLang from '../../hooks/useOldLang';

import RippleEffect from '../ui/RippleEffect';
import Transition from '../ui/Transition';
import Avatar from './Avatar';
import DotAnimation from './DotAnimation';
import FullNameTitle from './FullNameTitle';
import Icon from './icons/Icon';
import RankBadge from './RankBadge';
import TopicIcon from './TopicIcon';
import TypingStatus from './TypingStatus';

const TOPIC_ICON_SIZE = 2.5 * REM;

type BaseOwnProps = {
  typingStatusByPeerId?: Record<string, ApiTypingStatus>;
  avatarSize?: 'tiny' | 'small' | 'medium' | 'large' | 'jumbo';
  forceShowSelf?: boolean;
  status?: string;
  statusIcon?: IconName;
  ripple?: boolean;
  withDots?: boolean;
  withMediaViewer?: boolean;
  withUsername?: boolean;
  withStory?: boolean;
  withFullInfo?: boolean;
  withUpdatingStatus?: boolean;
  storyViewerOrigin?: StoryViewerOrigin;
  noEmojiStatus?: boolean;
  noFake?: boolean;
  noVerified?: boolean;
  emojiStatusSize?: number;
  noStatusOrTyping?: boolean;
  noUserStatus?: boolean;
  noRtl?: boolean;
  chatMemberOriginId?: string;
  chatMember?: ApiChatMember;
  isSavedDialog?: boolean;
  noAvatar?: boolean;
  className?: string;
  iconElement?: JSX.Element;
  rightElement?: JSX.Element;
  onClick?: VoidFunction;
  onEmojiStatusClick?: VoidFunction;
};

type OwnProps = BaseOwnProps &
  (
    | {
        userId: string;
        threadId?: ThreadId;
        customPeer?: never;
      }
    | {
        userId?: never;
        threadId?: never;
        customPeer: CustomPeer;
      }
  );

type StateProps = {
  user?: ApiUser;
  userStatus?: ApiUserStatus;
  self?: ApiUser;
  isSavedMessages?: boolean;
  areMessagesLoaded: boolean;
  isSynced?: boolean;
  topic?: ApiTopic;
  messagesCount?: number;
};

const UPDATE_INTERVAL = 1000 * 60; // 1 min

const PrivateChatInfo = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { loadFullUser, openMediaViewer, loadMoreProfilePhotos } = getActions();

  const oldLang = useOldLang();
  const lang = useLang();

  const isTopic = createMemo(() => Boolean(props.user?.isBotForum && props.topic));
  const hasAvatarMediaViewer = createMemo(() => props.withMediaViewer && !props.isSavedMessages);

  createEffect(
    depsOf(() => [props.userId, props.withFullInfo, props.withMediaViewer, props.isSynced] as const),
    ([userId2, withFullInfo2, withMediaViewer2, isSynced2]) => {
      if (userId2) {
        if (withFullInfo2 && isSynced2) loadFullUser({ userId: userId2 });
        if (withMediaViewer2) loadMoreProfilePhotos({ peerId: userId2, isPreload: true });
      }
    },
  );

  // Deviation: the interval is a tick that the status text reads (there is no force update).
  const statusTick = useIntervalForceUpdate(UPDATE_INTERVAL);
  const messagesCount = currentOrPrev(() => props.messagesCount);

  const handleAvatarViewerOpen = (e: React.MouseEvent<HTMLDivElement, MouseEvent>, hasMedia: boolean) => {
    if (hasMedia) {
      e.stopPropagation();
      openMediaViewer({
        isAvatarView: true,
        chatId: props.userId,
        mediaIndex: 0,
        origin:
          (props.avatarSize === undefined ? 'medium' : props.avatarSize) === 'jumbo'
            ? MediaViewerOrigin.ProfileAvatar
            : MediaViewerOrigin.MiddleHeaderAvatar,
      });
    }
  };

  const userId = createMemo(() => props.user?.id);
  const mainUsername = createMemo(() => props.user && props.withUsername && getMainUsername(props.user));

  function renderStatusOrTyping() {
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

    if (props.withUpdatingStatus && !props.areMessagesLoaded) {
      return <DotAnimation className="status" content={lang('Updating')} />;
    }

    if (props.customPeer?.subtitleKey) {
      return (
        <span class="status" dir="auto">
          <span class="user-status" dir="auto">
            {oldLang(props.customPeer.subtitleKey)}
          </span>
        </span>
      );
    }

    if (!props.user) {
      return undefined;
    }

    if (props.typingStatusByPeerId) {
      return <TypingStatus typingStatusByPeerId={props.typingStatusByPeerId} isPrivate />;
    }

    if (isTopic()) {
      return (
        <span class="status" dir="auto">
          <Transition
            name="fade"
            shouldRestoreHeight
            activeKey={props.messagesCount !== undefined ? 1 : 2}
            className="message-count-transition"
          >
            {(slide) => (
              // Deviation: every slide renders the text of its own key (tt kept the last render of an inactive key);
              // `messagesCount` is held while the slide fades out.
              <>
                {slide.key === 1
                  ? messagesCount()! > 0
                    ? lang('Messages', { count: messagesCount()! }, { pluralValue: messagesCount()! })
                    : lang('ChatInfoNoMessages')
                  : lang('ChatInfoForumTopic')}
              </>
            )}
          </Transition>
        </span>
      );
    }

    if (isSystemBot(props.user.id)) {
      return undefined;
    }

    statusTick();
    const translatedStatus = props.noUserStatus ? undefined : getUserStatus(oldLang, props.user, props.userStatus);
    const mainUserNameClassName = buildClassName('handle', translatedStatus && 'withStatus');
    return (
      <span
        class={buildClassName(
          'status',
          !props.noUserStatus && isUserOnline(props.user, props.userStatus, true) && 'online',
        )}
      >
        {mainUsername() && <span class={mainUserNameClassName}>{mainUsername()}</span>}
        {translatedStatus && (
          <span class="user-status" dir="auto">
            {translatedStatus}
          </span>
        )}
      </span>
    );
  }

  function renderNameTitle() {
    if (isTopic()) {
      return (
        <h3 dir="auto" class="fullName">
          {renderText(props.topic!.title)}
        </h3>
      );
    }

    if (props.chatMember && hasRank(props.chatMember)) {
      return (
        <div class="info-name-title">
          <FullNameTitle
            peer={props.customPeer || props.user!}
            noFake={props.noFake}
            noVerified={props.noVerified}
            withEmojiStatus={!props.noEmojiStatus}
            emojiStatusSize={props.emojiStatusSize}
            isSavedMessages={props.isSavedMessages}
            isSavedDialog={props.isSavedDialog}
            iconElement={props.iconElement}
            onEmojiStatusClick={props.onEmojiStatusClick}
          />
          <RankBadge
            chatId={props.chatMemberOriginId!}
            userId={props.chatMember.userId}
            isAdmin={props.chatMember.isAdmin}
            isOwner={props.chatMember.isOwner}
            rank={props.chatMember.rank}
          />
        </div>
      );
    }

    return (
      <FullNameTitle
        peer={props.customPeer || props.user!}
        noFake={props.noFake}
        noVerified={props.noVerified}
        withEmojiStatus={!props.noEmojiStatus}
        emojiStatusSize={props.emojiStatusSize}
        isSavedMessages={props.isSavedMessages}
        isSavedDialog={props.isSavedDialog}
        onEmojiStatusClick={props.onEmojiStatusClick}
        iconElement={props.iconElement}
      />
    );
  }

  return (
    <Show when={!(!props.user && !props.customPeer)}>
      <div
        class={buildClassName('ChatInfo', props.className)}
        dir={!props.noRtl && lang.isRtl ? 'rtl' : undefined}
        onClick={() => props.onClick?.()}
      >
        {props.isSavedDialog && props.self && (
          <Avatar
            size={props.avatarSize === undefined ? 'medium' : props.avatarSize}
            peer={props.self}
            isSavedMessages
            className="saved-dialog-avatar"
          />
        )}
        {!props.noAvatar && !isTopic() && (
          // `key={user?.id}` of tt: a new `when` object remounts the avatar when the user id changes.
          <Show when={{ id: userId() }} keyed>
            {(_key) => (
              <Avatar
                size={props.avatarSize === undefined ? 'medium' : props.avatarSize}
                peer={props.customPeer || props.user}
                className={buildClassName(props.isSavedDialog && 'overlay-avatar')}
                isSavedMessages={props.isSavedMessages}
                isSavedDialog={props.isSavedDialog}
                withStory={props.withStory}
                storyViewerOrigin={props.storyViewerOrigin}
                storyViewerMode="single-peer"
                onClick={hasAvatarMediaViewer() ? handleAvatarViewerOpen : undefined}
              />
            )}
          </Show>
        )}
        {isTopic() && <TopicIcon topic={props.topic!} className="topic-header-icon" size={TOPIC_ICON_SIZE} />}
        <div class="info">
          {renderNameTitle()}
          {(props.status || (!props.isSavedMessages && !props.noStatusOrTyping)) && renderStatusOrTyping()}
        </div>
        {props.ripple && <RippleEffect />}
        {props.rightElement}
      </div>
    </Show>
  );
};

const mapStateToProps = (
  global: GlobalState,
  { userId, threadId, forceShowSelf, isSavedDialog }: OwnProps,
): Complete<StateProps> => {
  const { isSynced } = global;
  const user = userId ? selectUser(global, userId) : undefined;
  const userStatus = userId ? selectUserStatus(global, userId) : undefined;
  const isSavedMessages = !forceShowSelf && user && user.isSelf;
  const self = isSavedMessages ? user : selectUser(global, global.currentUserId!);
  const areMessagesLoaded = Boolean(
    isSavedDialog ? selectChatMessages(global, global.currentUserId!) : selectChatMessages(global, userId!),
  );

  const topic = threadId ? selectTopic(global, userId, threadId) : undefined;
  const messagesCount = topic && userId ? selectThreadMessagesCount(global, userId, threadId!) : undefined;

  return {
    user,
    userStatus,
    isSavedMessages,
    areMessagesLoaded,
    self,
    isSynced,
    topic,
    messagesCount,
  };
};

export default PrivateChatInfo;
