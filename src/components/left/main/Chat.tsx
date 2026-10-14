import { createEffect, createMemo, frameMutation } from 'frameact';
import { Show } from 'frameact/dom';
import { getActions, withGlobal } from '../../../global';

import type {
  ApiChat,
  ApiChatFolder,
  ApiChatFullInfo,
  ApiDraft,
  ApiTypingStatus,
  ApiUser,
  ApiUserStatus,
} from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';
import type { ChatAnimationTypes } from './hooks';
import { MAIN_THREAD_ID } from '../../../api/types';
import { StoryViewerOrigin, type TopicsInfo } from '../../../types';

import { ALL_FOLDER_ID, UNMUTE_TIMESTAMP } from '../../../config';
import { createShowTransition } from '../../../lib/kit';
import { getPeerColorKey, groupStatefulContent, isChatCommunity, isUserOnline } from '../../../global/helpers';
import { getIsChatMuted } from '../../../global/helpers/notifications';
import {
  selectCanAnimateInterface,
  selectChat,
  selectChatFullInfo,
  selectChatLastMessageInfo,
  selectCurrentMessageList,
  selectIsCurrentUserFrozen,
  selectIsCurrentUserPremium,
  selectIsForumPanelClosed,
  selectIsForumPanelOpen,
  selectMonoforumChannel,
  selectNotifyDefaults,
  selectNotifyException,
  selectTabState,
  selectTopicsInfo,
  selectUser,
  selectUserStatus,
} from '../../../global/selectors';
import { selectDraft, selectThreadLocalStateParam } from '../../../global/selectors/threads';
import { IS_OPEN_IN_NEW_TAB_SUPPORTED } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import { formatCountdown } from '../../../util/dates/oldDateFormat';
import { depsOf } from '../../../util/effectDeps';
import { isUserId } from '../../../util/entities/ids';
import { getChatFolderIds } from '../../../util/folderManager';
import { createLocationHash } from '../../../util/routing';

import { useSelectorSignal, useShallowSelector } from '../../../hooks/data/useSelector';
import useAppLayout from '../../../hooks/useAppLayout';
import useChatContextActions from '../../../hooks/useChatContextActions';
import useEnsureMessage from '../../../hooks/useEnsureMessage';
import { useFastClick } from '../../../hooks/useFastClick';
import useFlag from '../../../hooks/useFlag';
import { useIsIntersecting } from '../../../hooks/useIntersectionObserver';
import useLang from '../../../hooks/useLang';
import { getPeerColorClass } from '../../../hooks/usePeerColor';
import useChatListEntry from './hooks/useChatListEntry';
import useCommunityMembers from './hooks/useCommunityMembers';

import Avatar from '../../common/Avatar';
import DeleteChatModal from '../../common/DeleteChatModal';
import FullNameTitle from '../../common/FullNameTitle';
import AutoDeleteIcon from '../../common/icons/AutoDeleteIcon';
import Icon from '../../common/icons/Icon';
import StarIcon from '../../common/icons/StarIcon';
import LastMessageMeta from '../../common/LastMessageMeta';
import ListItem from '../../ui/ListItem';
import ChatFolderModal from '../ChatFolderModal.async';
import MuteChatModal from '../MuteChatModal.async';
import ChatBadge from './ChatBadge';
import ChatCallStatus from './ChatCallStatus';
import ChatTags from './ChatTags';

import './Chat.scss';

type OwnProps = {
  chatId: string;
  folderId?: number;
  orderDiff: number;
  shiftDiff: number;
  animationType: ChatAnimationTypes;
  isPinned?: boolean;
  offsetTop?: number;
  isSavedDialog?: boolean;
  isPreview?: boolean;
  previewMessageId?: number;
  className?: string;
  withTags?: boolean;
  noCommunityChevron?: boolean;
  isInCommunityPanel?: boolean;
  isFoldersSidebarShown?: boolean;
  observeIntersection?: ObserveFn;
  onReorderAnimationEnd?: NoneToVoidFunction;
};

type StateProps = {
  chat?: ApiChat;
  monoforumChannel?: ApiChat;
  topicsInfo?: TopicsInfo;
  isMuted?: boolean;
  user?: ApiUser;
  userStatus?: ApiUserStatus;
  draft?: ApiDraft;
  isSelected?: boolean;
  isSelectedForum?: boolean;
  isForumPanelOpen?: boolean;
  canScrollDown?: boolean;
  canChangeFolder?: boolean;
  typingStatusByPeerId?: Record<string, ApiTypingStatus>;
  withInterfaceAnimations?: boolean;
  communityFullInfo?: ApiChatFullInfo;
  currentUserId: string;
  isSynced?: boolean;
  isAccountFrozen?: boolean;
  chatFolderIds?: number[];
  orderedFolderIds?: number[];
  chatFoldersById?: Record<number, ApiChatFolder>;
  areTagsEnabled?: boolean;
};

const AUTO_DELETE_STORY_GAP_PERCENT = 15;

const Chat = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const {
    openChat,
    openSavedDialog,
    toggleChatInfo,
    focusMessage,
    loadTopics,
    openForumPanel,
    closeForumPanel,
    setShouldCloseRightColumn,
    reportMessages,
    openFrozenAccountModal,
    updateChatMutedState,
    openQuickPreview,
    scrollMessageListToBottom,
    openCommunityPanel,
    loadFullCommunity,
  } = getActions();

  const lang = useLang();

  // The row itself acts on the same fast-click phase, so a plain `onClick` here
  // would let the chat open first and delay the panel
  const { handleClick: handleChevronClick, handleMouseDown: handleChevronMouseDown } = useFastClick(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (props.chat?.linkedCommunityId) {
        openCommunityPanel({ communityId: props.chat.linkedCommunityId });
      }
    },
  );

  const { isMobile } = useAppLayout();
  const [isDeleteModalOpen, openDeleteModal, closeDeleteModal] = useFlag();
  const [isMuteModalOpen, openMuteModal, closeMuteModal] = useFlag();
  const [isChatFolderModalOpen, openChatFolderModal, closeChatFolderModal] = useFlag();
  const [shouldRenderDeleteModal, markRenderDeleteModal, unmarkRenderDeleteModal] = useFlag();
  const [shouldRenderMuteModal, markRenderMuteModal, unmarkRenderMuteModal] = useFlag();
  const [shouldRenderChatFolderModal, markRenderChatFolderModal, unmarkRenderChatFolderModal] = useFlag();

  const isForum = () => props.chat?.isForum;
  const isForumAsMessages = () => props.chat?.isForumAsMessages;
  const isMonoforum = () => props.chat?.isMonoforum;
  const isCommunity = createMemo(() => Boolean(props.chat && isChatCommunity(props.chat)));

  const listedTopicIds = createMemo(() => props.topicsInfo?.listedTopicIds);
  const shouldForceNonForumView = createMemo(
    () => props.chat?.isBotForum && listedTopicIds() && !listedTopicIds()!.length,
  );

  const communityData = useCommunityMembers(() => props.communityFullInfo?.linkedPeers);
  const communityMembers = () => communityData()?.members;
  const communityUnreadCount = () => communityData()?.unreadCount;
  const lastMessageChatId = () =>
    communityData()?.lastMessageChatId === undefined ? props.chatId : communityData()!.lastMessageChatId;

  const lastMessageInfoSelector = (global: GlobalState) =>
    selectChatLastMessageInfo(global, {
      chatId: props.chatId,
      lastMessageChatId: lastMessageChatId(),
      isSavedDialog: props.isSavedDialog,
      previewMessageId: props.previewMessageId,
    });
  const lastMessageInfo = useShallowSelector(lastMessageInfoSelector);
  const lastMessage = () => lastMessageInfo().lastMessage;
  const lastMessageId = () => lastMessageInfo().lastMessageId;
  const lastMessageSender = () => lastMessageInfo().lastMessageSender;
  const lastMessageOutgoingStatus = () => lastMessageInfo().lastMessageOutgoingStatus;
  const lastMessageTopic = () => lastMessageInfo().lastMessageTopic;
  const lastMessageStory = () => lastMessageInfo().lastMessageStory;

  useEnsureMessage(() => (props.isSavedDialog ? props.currentUserId : lastMessageChatId()), lastMessageId, lastMessage);

  const tagFolderIds = createMemo(() => {
    const chatFolderIdsSet = new Set(props.chatFolderIds);

    return props.orderedFolderIds?.filter((id) => {
      if (!chatFolderIdsSet.has(id)) return undefined;

      const isActive = id === props.folderId;
      const isAll = id === ALL_FOLDER_ID;

      const folder = props.chatFoldersById?.[id];
      const hasColor = folder?.color !== undefined && folder.color !== -1;

      return !isActive && !isAll && hasColor;
    });
  });

  const isTagsMode = createMemo(() => props.areTagsEnabled && props.withTags);
  const shouldRenderTags = createMemo(() => isTagsMode() && Boolean(tagFolderIds()?.length));

  const { renderSubtitle, ref, element } = useChatListEntry({
    chat: () => props.chat,
    chatId: () => props.chatId,
    lastMessage,
    communityMembers,
    typingStatusByPeerId: () => props.typingStatusByPeerId,
    draft: () => props.draft,
    statefulMediaContent: () => groupStatefulContent({ story: lastMessageStory() }),
    lastMessageTopic,
    lastMessageSender,
    observeIntersection: () => props.observeIntersection,
    animationType: () => props.animationType,
    withInterfaceAnimations: () => props.withInterfaceAnimations,
    orderDiff: () => props.orderDiff,
    shiftDiff: () => props.shiftDiff,
    isSavedDialog: () => props.isSavedDialog,
    isPreview: () => props.isPreview,
    onReorderAnimationEnd: () => props.onReorderAnimationEnd,
    topicIds: listedTopicIds,
    hasTags: shouldRenderTags,
    shouldForceNonForumView,
  });

  const getIsForumPanelClosed = useSelectorSignal(selectIsForumPanelClosed);

  const openChatEntry = () => {
    if (!props.isPreview && isCommunity()) {
      openCommunityPanel({ communityId: props.chatId });
      return false;
    }

    const noForumTopicPanel = (isMobile() && isForumAsMessages()) || shouldForceNonForumView();

    if (isMobile()) {
      setShouldCloseRightColumn({ value: true });
    }

    if (props.isPreview) {
      focusMessage({
        chatId: props.chatId,
        messageId: props.previewMessageId!,
      });
      return false;
    }

    if (props.isSavedDialog) {
      openSavedDialog({ chatId: props.chatId, noForumTopicPanel: true }, { forceOnHeavyAnimation: true });

      if (isMobile()) {
        toggleChatInfo({ force: false });
      }
      return false;
    }

    if (isForum()) {
      if (props.isForumPanelOpen) {
        closeForumPanel(undefined, { forceOnHeavyAnimation: true });

        return false;
      } else {
        if (!noForumTopicPanel) {
          openForumPanel({ chatId: props.chatId }, { forceOnHeavyAnimation: true });
        }

        if (!isForumAsMessages() && !shouldForceNonForumView()) return false;
      }
    }

    openChat({ id: props.chatId, noForumTopicPanel, shouldReplaceHistory: true }, { forceOnHeavyAnimation: true });

    return true;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (e.altKey && !props.isSavedDialog && !isForum() && !props.isPreview && !isCommunity()) {
      e.preventDefault();
      openQuickPreview({ id: props.chatId });
      return;
    }

    if (!props.isPreview && isCommunity()) {
      // The row is a link to a chat view, which a community does not have
      e.preventDefault();
    }

    if (openChatEntry() && props.isSelected && props.canScrollDown && e.detail <= 1) {
      scrollMessageListToBottom();
    }
  };

  const handleDelete = () => {
    if (props.isAccountFrozen) {
      openFrozenAccountModal();
      return;
    }

    markRenderDeleteModal();
    openDeleteModal();
  };

  const handleMute = () => {
    if (props.isAccountFrozen) {
      openFrozenAccountModal();
      return;
    }

    markRenderMuteModal();
    openMuteModal();
  };

  const handleUnmute = () => {
    if (props.isAccountFrozen) {
      openFrozenAccountModal();
      return;
    }

    updateChatMutedState({ chatId: props.chatId, mutedUntil: UNMUTE_TIMESTAMP });
  };

  const handleChatFolderChange = () => {
    markRenderChatFolderModal();
    openChatFolderModal();
  };

  const handleReport = () => {
    if (props.isAccountFrozen) {
      openFrozenAccountModal();
      return;
    }

    if (!props.chat) return;
    reportMessages({ chatId: props.chat.id, messageIds: [] });
  };

  const contextActions = useChatContextActions(() => ({
    chat: props.chat,
    user: props.user,
    handleDelete,
    handleMute,
    handleUnmute,
    handleChatFolderChange,
    handleReport,
    folderId: props.folderId,
    isPinned: props.isPinned,
    isMuted: props.isMuted,
    canChangeFolder: props.canChangeFolder,
    isSavedDialog: props.isSavedDialog,
    currentUserId: props.currentUserId,
    isPreview: props.isPreview,
    isInCommunityPanel: props.isInCommunityPanel,
    topicIds: listedTopicIds(),
  }));

  const isIntersecting = useIsIntersecting(element, () => (props.chat ? props.observeIntersection : undefined));

  // Load the forum topics to display unread count badge
  // Deviation: `topicsInfo` is a store container (its identity stays while its fields change), so the effect depends
  // on what it checks: its presence and `isCache`.
  createEffect(
    depsOf(
      () =>
        [
          props.chatId,
          Boolean(props.topicsInfo),
          props.topicsInfo?.isCache,
          props.isSynced,
          isForum(),
          isIntersecting(),
        ] as const,
    ),
    ([chatId2, hasTopicsInfo, isCache, isSynced2, isForum2, isIntersecting2]) => {
      if (isIntersecting2 && isForum2 && isSynced2 && (!hasTopicsInfo || isCache)) {
        loadTopics({ chatId: chatId2 });
      }
    },
  );

  // Refresh visible community members, including details restored from cache
  // Deviation: as above, for `communityFullInfo`.
  createEffect(
    depsOf(
      () =>
        [
          props.chatId,
          Boolean(props.communityFullInfo),
          props.communityFullInfo?.isCache,
          props.isSynced,
          isCommunity(),
          isIntersecting(),
        ] as const,
    ),
    ([chatId2, hasCommunityFullInfo, isCache, isSynced2, isCommunity2, isIntersecting2]) => {
      if (isIntersecting2 && isCommunity2 && isSynced2 && (!hasCommunityFullInfo || isCache)) {
        loadFullCommunity({ communityId: chatId2 });
      }
    },
  );

  const isOnline = createMemo(() => props.user && props.userStatus && isUserOnline(props.user, props.userStatus));
  // Deviation: `hasShownClass` of `useShowTransitionDeprecated` is `shouldRender` of the kit's transition.
  const { shouldRender: isAvatarOnlineShown } = createShowTransition({
    isOpen: () => Boolean(isOnline()),
    noMountTransition: true,
  });

  const href = createMemo(() => {
    if (!IS_OPEN_IN_NEW_TAB_SUPPORTED) return undefined;
    // A community opens a left-column panel, not a chat view, so it has no link
    if (isCommunity()) return undefined;

    if (props.isSavedDialog) {
      return `#${createLocationHash(props.currentUserId, 'thread', props.chatId)}`;
    }

    return `#${createLocationHash(props.chatId, 'thread', MAIN_THREAD_ID)}`;
  });

  const peer = createMemo(() => props.user || props.chat);
  const avatarPeer = createMemo(() => (isMonoforum() ? props.monoforumChannel : peer()));
  const historyTtlText = createMemo(() =>
    props.chat?.ttlPeriod && !props.isSavedDialog ? formatCountdown(lang, props.chat.ttlPeriod) : undefined,
  );
  const autoDeleteInfoText = createMemo(() =>
    historyTtlText() ? lang('AutoDeleteSetInfo', { time: historyTtlText() }) : undefined,
  );
  const shouldShowAutoDeleteBadge = createMemo(
    () => !isAvatarOnlineShown() && !props.chat?.subscriptionUntil && Boolean(autoDeleteInfoText()),
  );
  const avatarColorClassName = createMemo(() =>
    shouldShowAutoDeleteBadge() ? getPeerColorClass(getPeerColorKey(avatarPeer(), true)!) : undefined,
  );
  const hasActiveCall = createMemo(() => Boolean(props.chat?.isCallActive && props.chat.isCallNotEmpty));
  const hasAvatarCornerBadge = createMemo(
    () =>
      isAvatarOnlineShown() || Boolean(props.chat?.subscriptionUntil) || shouldShowAutoDeleteBadge() || hasActiveCall(),
  );

  const chatClassName = createMemo(() =>
    buildClassName(
      'Chat chat-item-clickable',
      isUserId(props.chatId) ? 'private' : 'group',
      isForum() && !shouldForceNonForumView() && 'forum',
      props.isSelected && 'selected',
      props.isSelectedForum && 'selected-forum',
      props.isPreview && 'standalone',
      isCommunity() && 'community',
      props.areTagsEnabled && props.withTags && 'chat-item-with-tags',
      props.className,
    ),
  );

  // Deviation: `top` is written by an effect instead of the `style` prop. The animation effect of `useChatListEntry`
  // writes `transform`/`opacity` on the same element, and a string `style` rewrite (`cssText`) would drop them when
  // the row moves; tt's render came before its layout effect, here the two effects have no fixed order.
  createEffect(
    () => props.offsetTop,
    (offsetTop) => {
      const element2 = element();
      if (!element2) return;

      if (offsetTop !== undefined) {
        element2.style.top = `${offsetTop}px`;
      } else {
        element2.style.removeProperty('top');
      }
    },
    frameMutation,
  );

  // Deviation: the row is always the root (a `ManualFor` row is one DOM node); an absent chat renders it empty,
  // where tt rendered nothing.
  return (
    <ListItem
      ref={(el) => {
        ref(el);
        // The first `top` is written with the (detached) element, so that the row is laid out where the list
        // measures it in the same frame (the infinite scroll preloads while the list does not fill the viewport).
        if (props.offsetTop !== undefined) el.style.top = `${props.offsetTop}px`;
      }}
      className={chatClassName()}
      href={href()}
      ripple={!isForum() && !isMobile()}
      contextActions={contextActions()}
      withPortalForMenu
      onClick={handleClick}
      onFileHoverOpen={openChatEntry}
    >
      <Show when={props.chat}>
        <div class={buildClassName('status', 'status-clickable')}>
          <div class="avatar-wrapper">
            <Avatar
              peer={avatarPeer()}
              isSavedMessages={props.user?.isSelf}
              isSavedDialog={props.isSavedDialog}
              size={props.isPreview ? 'medium' : 'large'}
              asMessageBubble={isMonoforum()}
              withStory={!props.user?.isSelf && !isMonoforum()}
              withStoryGap={
                isAvatarOnlineShown() || Boolean(props.chat?.subscriptionUntil) || shouldShowAutoDeleteBadge()
              }
              storyGapPercent={shouldShowAutoDeleteBadge() ? AUTO_DELETE_STORY_GAP_PERCENT : undefined}
              storyViewerOrigin={StoryViewerOrigin.ChatList}
              storyViewerMode="single-peer"
            />
            <div class="avatar-badge-wrapper">
              <div
                class={buildClassName('avatar-online', 'avatar-badge', isAvatarOnlineShown() && 'avatar-online-shown')}
              />
              {!isAvatarOnlineShown() && Boolean(props.chat?.subscriptionUntil) && (
                <StarIcon type="gold" className="avatar-badge avatar-subscription" size="adaptive" />
              )}
              {shouldShowAutoDeleteBadge() && (
                <AutoDeleteIcon
                  period={props.chat!.ttlPeriod!}
                  peer={avatarPeer()!}
                  className={buildClassName('avatar-badge', avatarColorClassName())}
                  ariaLabel={autoDeleteInfoText()}
                />
              )}
            </div>
            <ChatBadge
              chat={props.chat!}
              isMuted={props.isMuted}
              shouldShowOnlyMostImportant
              forceHidden={getIsForumPanelClosed()}
              forceUnreadCount={communityUnreadCount()}
              isSelected={props.isSelected}
              isOnAvatar
            />
            {!props.noCommunityChevron && !hasAvatarCornerBadge() && Boolean(props.chat?.linkedCommunityId) && (
              <div
                class="avatar-community-chevron"
                role="button"
                tabIndex={0}
                aria-label={lang('CommunityOpenPanel')}
                onClick={handleChevronClick}
                onMouseDown={handleChevronMouseDown}
              >
                <Icon name="down" />
              </div>
            )}
          </div>
          {hasActiveCall() && (
            <ChatCallStatus
              isMobile={isMobile()}
              isSelected={props.isSelected}
              isActive={props.withInterfaceAnimations}
            />
          )}
        </div>
        <div class={buildClassName('info', isTagsMode() && 'has-tags')}>
          <div class="info-row">
            <FullNameTitle
              peer={avatarPeer()!}
              isMonoforum={isMonoforum()}
              monoforumBadgeClassName="monoforum-badge"
              withEmojiStatus
              isSavedMessages={props.chatId === props.user?.id && props.user?.isSelf}
              isSavedDialog={props.isSavedDialog}
              observeIntersection={props.observeIntersection}
              withStatusTextColor={props.isSelected}
            />
            {props.isMuted && !props.isSavedDialog && <Icon name="muted" />}
            <div class="separator" />
            {lastMessage() && (
              <LastMessageMeta
                message={lastMessage()!}
                outgoingStatus={!props.isSavedDialog ? lastMessageOutgoingStatus() : undefined}
                draftDate={props.draft?.date}
              />
            )}
          </div>
          <div class="subtitle">
            {renderSubtitle()}
            {!props.isPreview && (
              <ChatBadge
                chat={props.chat!}
                isPinned={props.isPinned}
                isMuted={props.isMuted}
                isSavedDialog={props.isSavedDialog}
                hasMiniApp={props.user?.hasMainMiniApp}
                forceUnreadCount={communityUnreadCount()}
                isSelected={props.isSelected}
                transitionClassName="chat-badge-transition"
              />
            )}
          </div>
          {shouldRenderTags() && (
            <ChatTags
              itemClassName="chat-tag"
              orderedFolderIds={tagFolderIds()}
              chatFoldersById={props.chatFoldersById}
              isFoldersSidebarShown={props.isFoldersSidebarShown}
            />
          )}
        </div>
        {shouldRenderDeleteModal() && (
          <DeleteChatModal
            isOpen={isDeleteModalOpen()}
            onClose={closeDeleteModal}
            onCloseAnimationEnd={unmarkRenderDeleteModal}
            chat={props.chat!}
            isSavedDialog={props.isSavedDialog}
          />
        )}
        {shouldRenderMuteModal() && (
          <MuteChatModal
            isOpen={isMuteModalOpen()}
            onClose={closeMuteModal}
            onCloseAnimationEnd={unmarkRenderMuteModal}
            chatId={props.chatId}
          />
        )}
        {shouldRenderChatFolderModal() && (
          <ChatFolderModal
            isOpen={isChatFolderModalOpen()}
            onClose={closeChatFolderModal}
            onCloseAnimationEnd={unmarkRenderChatFolderModal}
            chatId={props.chatId}
          />
        )}
      </Show>
    </ListItem>
  );
};

const mapStateToProps = (global: GlobalState, { chatId, isSavedDialog, isPreview }: OwnProps): Complete<StateProps> => {
  const chat = selectChat(global, chatId);
  const user = selectUser(global, chatId);
  if (!chat) {
    return {
      currentUserId: global.currentUserId!,
    } as Complete<StateProps>;
  }

  const chatFolderIds = getChatFolderIds(chatId);
  const { areTagsEnabled } = global.chatFolders;
  const isPremium = selectIsCurrentUserPremium(global);

  const isCommunity = isChatCommunity(chat);

  const {
    chatId: currentChatId,
    threadId: currentThreadId,
    type: currentMessageListType,
  } = selectCurrentMessageList(global) || {};
  const isSelected =
    !isPreview &&
    chatId === currentChatId &&
    (isSavedDialog ? chatId === currentThreadId : currentThreadId === MAIN_THREAD_ID);
  const isSelectedForum =
    (chat.isForum && chatId === currentChatId) || chatId === selectTabState(global).forumPanelChatId;

  const userStatus = selectUserStatus(global, chatId);

  const typingStatusByPeerId = selectThreadLocalStateParam(global, chatId, MAIN_THREAD_ID, 'typingStatusByPeerId');

  const topicsInfo = selectTopicsInfo(global, chatId);

  const isAccountFrozen = selectIsCurrentUserFrozen(global);

  const monoforumChannel = selectMonoforumChannel(global, chatId);

  return {
    chat,
    communityFullInfo: isCommunity ? selectChatFullInfo(global, chatId) : undefined,
    isMuted: getIsChatMuted(chat, selectNotifyDefaults(global), selectNotifyException(global, chat.id)),
    draft: selectDraft(global, chatId, MAIN_THREAD_ID),
    isSelected,
    isSelectedForum,
    isForumPanelOpen: selectIsForumPanelOpen(global),
    canScrollDown: isSelected && currentMessageListType === 'thread',
    canChangeFolder: (global.chatFolders.orderedIds?.length || 0) > 1,
    user,
    userStatus,
    typingStatusByPeerId,
    withInterfaceAnimations: selectCanAnimateInterface(global),
    currentUserId: global.currentUserId!,
    topicsInfo,
    isSynced: global.isSynced,
    isAccountFrozen,
    monoforumChannel,
    chatFolderIds,
    orderedFolderIds: global.chatFolders.orderedIds,
    chatFoldersById: global.chatFolders.byId,
    areTagsEnabled: areTagsEnabled && isPremium,
  };
};

export default Chat;
