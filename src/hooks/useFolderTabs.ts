import { createMemo } from 'frameact';
import { getActions, trackGlobal, useGlobal } from '../global';

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
import { type MaybeAccessor, read } from '../util/accessors';
import { MEMO_EMPTY_ARRAY } from '../util/memo';
import { renderTextWithEntities } from '../components/common/helpers/renderTextWithEntities';
import useAppLayout from './useAppLayout';
import { useFolderManagerForUnreadChatsByFolder, useFolderManagerForUnreadCounters } from './useFolderManager';
import useLang from './useLang';

type FolderNameOptions = {
  text: string;
  entities?: ApiMessageEntity[];
  noCustomEmojiPlayback?: boolean;
  emojiSize?: number;
};

// Deviation: the reactive parameters are `MaybeAccessor`s (a hook runs once); `isReadOnly` selects the shape of the
// parameters and stays a plain value.
type Params = {
  sidebarMode: MaybeAccessor<boolean>;
  orderedFolderIds?: MaybeAccessor<number[] | undefined>;
  chatFoldersById: MaybeAccessor<Record<number, ApiChatFolder>>;
  maxFolders: MaybeAccessor<number>;
  noEmoticons?: MaybeAccessor<boolean | undefined>;
} & (
  | {
      isReadOnly?: false;
      maxChatLists: MaybeAccessor<number>;
      folderInvitesById: MaybeAccessor<Record<number, ApiChatlistExportedInvite[]>>;
      maxFolderInvites: MaybeAccessor<number>;
    }
  | {
      isReadOnly: true;
    }
);

const useFolderTabs = (params: Params) => {
  const { isReadOnly } = params;

  const { maxChatLists, folderInvitesById, maxFolderInvites } = !isReadOnly ? params : {};

  const lang = useLang();
  const { isMobile } = useAppLayout();
  const global = useGlobal();

  const {
    openShareChatFolderModal,
    openDeleteChatFolderModal,
    openEditChatFolder,
    openLimitReachedModal,
    markChatMessagesRead,
    openSettingsScreen,
    setSharedSettingOption,
  } = getActions();

  const allChatsFolder = createMemo<ApiChatFolder>(() => {
    return {
      id: ALL_FOLDER_ID,
      title: {
        text:
          read(params.orderedFolderIds)?.[0] === ALL_FOLDER_ID ? lang('FilterAllChatsShort') : lang('FilterAllChats'),
      },
      includedChatIds: MEMO_EMPTY_ARRAY,
      excludedChatIds: MEMO_EMPTY_ARRAY,
      emoticon: '💬',
    } satisfies ApiChatFolder;
  });

  const displayedFolders = createMemo(() => {
    const orderedFolderIds = read(params.orderedFolderIds);
    const chatFoldersById = read(params.chatFoldersById);

    return orderedFolderIds
      ? orderedFolderIds
          .map((id) => {
            if (id === ALL_FOLDER_ID) {
              return allChatsFolder();
            }

            return chatFoldersById[id] || {};
          })
          .filter(Boolean)
      : undefined;
  });

  const folderUnreadChatsCountersById = useFolderManagerForUnreadChatsByFolder();
  const handleReadAllChats = (folderId: number) => {
    const unreadChatIds = folderUnreadChatsCountersById()[folderId];
    if (!unreadChatIds?.length) return;

    unreadChatIds.forEach((chatId) => {
      markChatMessagesRead({ id: chatId });
    });
  };

  const folderCountersById = useFolderManagerForUnreadCounters();
  const folderTabs = createMemo(() => {
    const folders = displayedFolders();
    if (!folders || !folders.length) {
      return undefined;
    }

    const maxFolders = read(params.maxFolders);
    const sidebarMode = read(params.sidebarMode);
    const noEmoticons = read(params.noEmoticons);
    const unreadChatsByFolderId = folderUnreadChatsCountersById();
    const countersById = folderCountersById();
    const isMobile2 = isMobile();

    return folders.map((folder, i) => {
      const { id, title } = folder;
      const isBlocked = id !== ALL_FOLDER_ID && i > maxFolders - 1;
      const canShareFolder = trackGlobal(() => selectCanShareFolder(global, id));
      const contextActions: MenuItemContextAction[] = [];

      if (!isReadOnly) {
        if (canShareFolder) {
          contextActions.push({
            title: lang('FilterShare'),
            icon: 'link',
            handler: () => {
              const chatListCount = Object.values(read(params.chatFoldersById)).reduce(
                (acc, el) => acc + (el.isChatList ? 1 : 0),
                0,
              );
              if (chatListCount >= read(maxChatLists!) && !folder.isChatList) {
                openLimitReachedModal({
                  limit: 'chatlistJoined',
                });
                return;
              }

              // Greater amount can be after premium downgrade
              if (read(folderInvitesById!)[id]?.length >= read(maxFolderInvites!)) {
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

          if (unreadChatsByFolderId[id]?.length) {
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

          if (unreadChatsByFolderId[id]?.length) {
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

        if (!isMobile2) {
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

      // Deviation: a function, so that every place that renders the title (TabList renders each tab twice) creates its
      // own nodes: a JSX node can sit in one place only.
      const folderName = () => renderTextWithEntities(folderNameOptions);

      return {
        id,
        title: folderName,
        badgeCount: countersById[id]?.chatsCount,
        isBadgeActive: Boolean(countersById[id]?.notificationsCount),
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
