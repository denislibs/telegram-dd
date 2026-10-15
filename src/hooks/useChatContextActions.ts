import { createMemo } from 'frameact';
import { getActions } from '../global';

import type { MenuItemContextAction } from '../components/ui/ListItem';
import type { GlobalState } from '../global/types';
import { type ApiChat, type ApiUser, MAIN_THREAD_ID } from '../api/types';

import { ARCHIVED_FOLDER_ID, SERVICE_NOTIFICATIONS_USER_ID } from '../config';
import { getCanDeleteChat, isChatArchived, isChatChannel, isChatCommunity, isChatGroup } from '../global/helpers';
import { selectChat, selectIsChatPinned } from '../global/selectors';
import { selectThreadReadState } from '../global/selectors/threads';
import { type MaybeAccessor, read } from '../util/accessors';
import { IS_TAURI } from '../util/browser/globalEnvironment';
import { IS_OPEN_IN_NEW_TAB_SUPPORTED } from '../util/browser/windowEnvironment';
import { isUserId } from '../util/entities/ids';
import { buildCollectionByCallback, compact } from '../util/iteratees';
import useSelector, { useShallowSelector } from './data/useSelector';
import useLang from './useLang';

type Params = {
  chat: ApiChat | undefined;
  user: ApiUser | undefined;
  folderId?: number;
  isPinned?: boolean;
  isMuted?: boolean;
  canChangeFolder?: boolean;
  isSavedDialog?: boolean;
  currentUserId?: string;
  isPreview?: boolean;
  isInCommunityPanel?: boolean;
  topicIds?: number[];
  handleDelete?: NoneToVoidFunction;
  handleMute?: NoneToVoidFunction;
  handleUnmute?: NoneToVoidFunction;
  handleChatFolderChange: NoneToVoidFunction;
  handleReport?: NoneToVoidFunction;
};

// Deviation: the params object is a `MaybeAccessor` (a function returning the object, `() => ({ chat: props.chat, … })`,
// since some fields are functions themselves); the result is an accessor. frameact hooks run once.
const useChatContextActions = (params: MaybeAccessor<Params>, isInSearch = false) => {
  const {
    toggleChatPinned,
    toggleSavedDialogPinned,
    toggleChatArchived,
    markChatMessagesRead,
    markChatUnread,
    openChatInNewTab,
    openQuickPreview,
  } = getActions();

  const lang = useLang();

  const p = createMemo(() => read(params));

  const topicsReadStateSelector = (global: GlobalState) => {
    const { chat, topicIds } = p();
    if (!chat?.id) return undefined;
    return buildCollectionByCallback(topicIds || [], (tId) => [tId, selectThreadReadState(global, chat?.id, tId)]);
  };
  const topicsReadStates = useShallowSelector(topicsReadStateSelector);

  const chatReadStateSelector = (global: GlobalState) => {
    const { chat } = p();
    if (!chat?.id) return undefined;
    return selectThreadReadState(global, chat.id, MAIN_THREAD_ID);
  };
  const chatReadState = useSelector(chatReadStateSelector);

  const isLinkedCommunityCollapsedSelector = (global: GlobalState) => {
    const communityId = p().chat?.linkedCommunityId;
    return Boolean(communityId && selectChat(global, communityId)?.isCollapsedInDialogs);
  };
  const isLinkedCommunityCollapsed = useSelector(isLinkedCommunityCollapsedSelector);

  const isResolvedPinnedSelector = (global: GlobalState) => {
    const { chat, isPinned, isInCommunityPanel } = p();
    if (isPinned !== undefined || !isInCommunityPanel || !chat) return isPinned;
    return selectIsChatPinned(global, chat.id, isChatArchived(chat) ? ARCHIVED_FOLDER_ID : undefined);
  };
  const isResolvedPinned = useSelector(isResolvedPinnedSelector);

  const deleteTitle = createMemo(() => {
    const { chat, isSavedDialog } = p();
    if (!chat) return undefined;

    if (isSavedDialog) {
      return lang('Delete');
    }

    if (isUserId(chat.id)) {
      return lang('DeleteChat');
    }

    if (getCanDeleteChat(chat)) {
      return lang('DeleteChat');
    }

    if (isChatChannel(chat)) {
      return lang('ChannelLeave');
    }

    return lang('GroupLeaveGroup');
  });

  const preparedActions = createMemo(() => {
    const {
      chat,
      user,
      folderId,
      isMuted,
      canChangeFolder,
      isSavedDialog,
      currentUserId,
      isPreview,
      isInCommunityPanel,
      handleDelete,
      handleMute,
      handleUnmute,
      handleChatFolderChange,
      handleReport,
    } = p();
    if (!chat || isPreview) {
      return undefined;
    }

    const { isSelf } = user || {};
    const isServiceNotifications = user?.id === SERVICE_NOTIFICATIONS_USER_ID;

    const actionOpenInNewTab =
      IS_OPEN_IN_NEW_TAB_SUPPORTED &&
      ({
        title: IS_TAURI ? lang('ChatListOpenInNewWindow') : lang('ChatListOpenInNewTab'),
        icon: 'open-in-new-tab',
        handler: () => {
          if (isSavedDialog) {
            openChatInNewTab({ chatId: currentUserId!, threadId: chat.id });
          } else {
            openChatInNewTab({ chatId: chat.id });
          }
        },
      } satisfies MenuItemContextAction);

    const actionQuickPreview =
      !isSavedDialog &&
      !chat.isForum &&
      ({
        title: lang('QuickPreview'),
        icon: 'eye-outline',
        handler: () => {
          openQuickPreview({
            id: chat.id,
          });
        },
      } satisfies MenuItemContextAction);

    const togglePinned = () => {
      if (isSavedDialog) {
        toggleSavedDialogPinned({ id: chat.id });
      } else {
        toggleChatPinned({ id: chat.id, folderId: folderId! });
      }
    };

    const actionPin: MenuItemContextAction = isResolvedPinned()
      ? {
          title: lang('ChatListUnpinFromTop'),
          icon: 'unpin',
          handler: togglePinned,
        }
      : {
          title: lang('ChatListPinToTop'),
          icon: 'pin',
          handler: togglePinned,
        };

    const deleteTitle2 = deleteTitle();
    const actionDelete = deleteTitle2
      ? ({
          title: deleteTitle2,
          icon: 'delete',
          destructive: true,
          handler: handleDelete,
        } satisfies MenuItemContextAction)
      : undefined;

    if (isSavedDialog) {
      return compact([actionOpenInNewTab, actionQuickPreview, actionPin, actionDelete]);
    }

    const actionAddToFolder = canChangeFolder
      ? ({
          title: lang('ChatListContextAddToFolder'),
          icon: 'folder',
          handler: handleChatFolderChange,
        } satisfies MenuItemContextAction)
      : undefined;

    const actionMute: MenuItemContextAction = isMuted
      ? {
          title: lang('ChatsUnmute'),
          icon: 'unmute',
          handler: handleUnmute,
        }
      : {
          title: `${lang('ChatsMute')}...`,
          icon: 'mute',
          handler: handleMute,
        };

    // A community has no message history, so most chat actions do not apply
    if (isChatCommunity(chat)) {
      return compact([actionPin, actionMute]);
    }

    if (isInSearch) {
      return compact([actionOpenInNewTab, actionQuickPreview, actionPin, actionAddToFolder, actionMute]);
    }

    const actionMarkAsRead =
      chatReadState()?.unreadCount ||
      chatReadState()?.hasUnreadMark ||
      Object.values(topicsReadStates() || {}).some((readState) => readState?.unreadCount)
        ? ({
            title: lang('ChatListContextMarkAsRead'),
            icon: 'readchats',
            handler: () => markChatMessagesRead({ id: chat.id }),
          } satisfies MenuItemContextAction)
        : undefined;
    const actionMarkAsUnread =
      !(chatReadState()?.unreadCount || chatReadState()?.hasUnreadMark) && !chat.isForum
        ? ({
            title: lang('ChatListContextMarkAsUnread'),
            icon: 'unread',
            handler: () => markChatUnread({ id: chat.id }),
          } satisfies MenuItemContextAction)
        : undefined;

    // A view-only community chat has history but no dialog-list placement to manage
    if (isInCommunityPanel && chat.isNotJoined) {
      return compact([actionOpenInNewTab, actionQuickPreview]);
    }

    const actionArchive: MenuItemContextAction = isChatArchived(chat)
      ? { title: lang('Unarchive'), icon: 'unarchive', handler: () => toggleChatArchived({ id: chat.id }) }
      : { title: lang('Archive'), icon: 'archive', handler: () => toggleChatArchived({ id: chat.id }) };

    const canReport = handleReport && !user && (isChatChannel(chat) || isChatGroup(chat));
    const actionReport = canReport
      ? ({ title: lang('ReportPeerReport'), icon: 'flag', handler: handleReport } satisfies MenuItemContextAction)
      : undefined;

    const isInFolder = folderId !== undefined;
    const canManageListPlacement = !(isInCommunityPanel && isLinkedCommunityCollapsed());

    return compact<MenuItemContextAction>([
      actionOpenInNewTab,
      actionQuickPreview,
      canManageListPlacement && actionAddToFolder,
      actionMarkAsRead,
      actionMarkAsUnread,
      canManageListPlacement && actionPin,
      !isSelf && actionMute,
      !isSelf && !isServiceNotifications && !isInFolder && canManageListPlacement && actionArchive,
      actionReport,
      actionDelete,
    ]);
  });

  return preparedActions;
};

export default useChatContextActions;
