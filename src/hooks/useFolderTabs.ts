import { createMemo } from 'frameact';
import type { JSX } from 'frameact/jsx-runtime';
import { getActions, getGlobal } from '../global';

import type { MenuItemContextAction } from '../components/ui/ListItem';
import type { TabWithProperties } from '../components/ui/SquareTabList';
import {
  type ApiChatFolder,
  type ApiChatlistExportedInvite,
  type ApiMessageEntity,
  type ApiMessageEntityCustomEmoji,
  ApiMessageEntityTypes,
} from '../api/types';
import { SettingsScreens } from '../types';

import { ALL_FOLDER_ID } from '../config';
import { selectCanShareFolder } from '../global/selectors';
import { MEMO_EMPTY_ARRAY } from '../util/memo';
import { renderTextWithEntities } from '../components/common/helpers/renderTextWithEntities';
import useAppLayout from './useAppLayout';
import { useFolderManagerForUnreadChatsByFolder, useFolderManagerForUnreadCounters } from './useFolderManager';
import useLang from './useLang';
import useLastCallback from './useLastCallback';

type FolderNameOptions = {
  text: string;
  entities?: ApiMessageEntity[];
  noCustomEmojiPlayback?: boolean;
  emojiSize?: number;
};

type Params = {
  sidebarMode: boolean;
  orderedFolderIds?: number[];
  chatFoldersById: Record<number, ApiChatFolder>;
  maxFolders: number;
  noEmoticons?: boolean;
} & (
  | {
      isReadOnly?: false;
      maxChatLists: number;
      folderInvitesById: Record<number, ApiChatlistExportedInvite[]>;
      maxFolderInvites: number;
    }
  | {
      isReadOnly: true;
    }
);

// TODO(codemod): useFolderTabs: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
const useFolderTabs = (params: Params) => {
  const { sidebarMode, orderedFolderIds, chatFoldersById, maxFolders, noEmoticons, isReadOnly } = params;

  const { maxChatLists, folderInvitesById, maxFolderInvites } = !isReadOnly ? params : {};

  const lang = useLang();
  const { isMobile } = useAppLayout();

  const {
    openShareChatFolderModal,
    openDeleteChatFolderModal,
    openEditChatFolder,
    openLimitReachedModal,
    markChatMessagesRead,
    openSettingsScreen,
    setSharedSettingOption,
  } = getActions();

  const allChatsFolder: ApiChatFolder = createMemo(() => {
    return {
      id: ALL_FOLDER_ID,
      title: { text: orderedFolderIds?.[0] === ALL_FOLDER_ID ? lang('FilterAllChatsShort') : lang('FilterAllChats') },
      includedChatIds: MEMO_EMPTY_ARRAY,
      excludedChatIds: MEMO_EMPTY_ARRAY,
      emoticon: '💬',
    } satisfies ApiChatFolder;
  });

  const displayedFolders = createMemo(() => {
    return orderedFolderIds
      ? orderedFolderIds
          .map((id) => {
            if (id === ALL_FOLDER_ID) {
              return allChatsFolder;
            }

            return chatFoldersById[id] || {};
          })
          .filter(Boolean)
      : undefined;
  });

  const folderUnreadChatsCountersById = useFolderManagerForUnreadChatsByFolder();
  const handleReadAllChats = (folderId: number) => {
    const unreadChatIds = folderUnreadChatsCountersById[folderId];
    if (!unreadChatIds?.length) return;

    unreadChatIds.forEach((chatId) => {
      markChatMessagesRead({ id: chatId });
    });
  };

  const folderCountersById = useFolderManagerForUnreadCounters();
  const folderTabs = createMemo(() => {
    if (!displayedFolders() || !displayedFolders().length) {
      return undefined;
    }

    return displayedFolders().map((folder, i) => {
      const { id, title } = folder;
      const isBlocked = id !== ALL_FOLDER_ID && i > maxFolders - 1;
      // TODO(codemod): getGlobal() in a memo / JSX is a one-time read: use useGlobal() (store contract §12.4)
      const canShareFolder = selectCanShareFolder(getGlobal(), id);
      const contextActions: MenuItemContextAction[] = [];

      if (!isReadOnly) {
        if (canShareFolder) {
          contextActions.push({
            title: lang('FilterShare'),
            icon: 'link',
            handler: () => {
              const chatListCount = Object.values(chatFoldersById).reduce(
                (acc, el) => acc + (el.isChatList ? 1 : 0),
                0,
              );
              if (chatListCount >= maxChatLists! && !folder.isChatList) {
                openLimitReachedModal({
                  limit: 'chatlistJoined',
                });
                return;
              }

              // Greater amount can be after premium downgrade
              if (folderInvitesById![id]?.length >= maxFolderInvites!) {
                openLimitReachedModal({
                  limit: 'chatlistInvites',
                });
                return;
              }

              openShareChatFolderModal({
                folderId: id,
              });
            },
          });
        }

        if (id === ALL_FOLDER_ID) {
          contextActions.push({
            title: lang('FilterEditFolders'),
            icon: 'edit',
            handler: () => {
              openSettingsScreen({ screen: SettingsScreens.Folders });
            },
          });

          if (folderUnreadChatsCountersById[id]?.length) {
            contextActions.push({
              title: lang('ChatListMarkAllAsRead'),
              icon: 'readchats',
              handler: () => handleReadAllChats(folder.id),
            });
          }
        } else {
          contextActions.push({
            title: lang('EditFolder'),
            icon: 'edit',
            handler: () => {
              openEditChatFolder({ folderId: id });
            },
          });

          if (folderUnreadChatsCountersById[id]?.length) {
            contextActions.push({
              title: lang('ChatListMarkAllAsRead'),
              icon: 'readchats',
              handler: () => handleReadAllChats(folder.id),
            });
          }

          contextActions.push({
            title: lang('FilterMenuDelete'),
            icon: 'delete',
            destructive: true,
            handler: () => {
              openDeleteChatFolderModal({ folderId: id });
            },
          });
        }

        if (!isMobile) {
          contextActions.push({
            isSeparator: true,
          });

          contextActions.push({
            title: sidebarMode ? lang('TabsPositionTop') : lang('TabsPositionLeft'),
            icon: 'forums',
            handler: () => {
              setSharedSettingOption({ foldersPosition: sidebarMode ? 'top' : 'left' });
            },
          });
        }
      }

      const folderNameOptions: FolderNameOptions = {
        text: title.text,
        entities: title.entities,
        noCustomEmojiPlayback: folder.noTitleAnimations,
      };

      let folderIcon: string | ApiMessageEntityCustomEmoji | undefined = folder.emoticon;

      if (sidebarMode) {
        folderNameOptions.emojiSize = 10;
        const currentCustomEmoji = title.entities?.find(
          (entity): entity is ApiMessageEntityCustomEmoji =>
            entity.type === ApiMessageEntityTypes.CustomEmoji && entity.offset === 0,
        );
        if (currentCustomEmoji) {
          folderIcon = currentCustomEmoji;
          const { offset, length } = currentCustomEmoji;

          folderNameOptions.text = title.text.replace(title.text.substring(offset, offset + length), '');
          folderNameOptions.entities = title.entities
            ?.filter((entity) => entity.offset !== offset)
            .map((entity) => ({
              ...entity,
              offset: entity.offset - length,
            }));
        }
      }

      const folderName: JSX.Element[] | string = renderTextWithEntities(folderNameOptions);

      return {
        id,
        title: folderName,
        badgeCount: folderCountersById[id]?.chatsCount,
        isBadgeActive: Boolean(folderCountersById[id]?.notificationsCount),
        isBlocked,
        contextActions: contextActions.length ? contextActions : undefined,
        emoticon: noEmoticons ? undefined : folderIcon,
        noTitleAnimations: folder.noTitleAnimations,
      } satisfies TabWithProperties;
    });
  });

  return {
    displayedFolders,
    folderTabs,
  };
};

export default useFolderTabs;
