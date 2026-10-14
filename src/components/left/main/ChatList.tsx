import { createEffect, createMemo, createSignal } from 'frameact';
import { getActions } from '../../../global';
import { depsOf } from '../../../util/effectDeps';

import type { GlobalState } from '../../../global/types';
import { LeftColumnContent } from '../../../types';

import {
  ALL_FOLDER_ID,
  ARCHIVE_MINIMIZED_HEIGHT,
  ARCHIVED_FOLDER_ID,
  CHAT_HEIGHT_PX,
  CHAT_LIST_SLICE,
  SAVED_FOLDER_ID,
} from '../../../config';
import { IS_APP, IS_MAC_OS } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import { getOrderKey, getPinnedChatsCount } from '../../../util/folderManager';
import { ARCHIVE_ANIMATION_ID } from './hooks';

import usePeerStoriesPolling from '../../../hooks/polling/usePeerStoriesPolling';
import useTopOverscroll from '../../../hooks/scroll/useTopOverscroll';
import { useFolderManagerForOrderedIds } from '../../../hooks/useFolderManager';
import { useHotkeys } from '../../../hooks/useHotkeys';
import useInfiniteScroll from '../../../hooks/useInfiniteScroll';
import { useIntersectionObserver } from '../../../hooks/useIntersectionObserver';
import useOrderDiff from './hooks/useOrderDiff';

import InfiniteScroll from '../../ui/InfiniteScroll';
import Loading from '../../ui/Loading';
import Archive from './Archive';
import Chat from './Chat';
import EmptyFolder from './EmptyFolder';
import ChatListPanes from './panes/ChatListPanes';

type OwnProps = {
  className?: string;
  folderType: 'all' | 'archived' | 'saved' | 'folder';
  folderId?: number;
  isActive: boolean;
  canDisplayArchive?: boolean;
  archiveSettings?: GlobalState['archiveSettings'];
  isForumPanelOpen?: boolean;
  isMainList?: boolean;
  withTags?: boolean;
  isFoldersSidebarShown?: boolean;
  isStoryRibbonShown?: boolean;
  foldersDispatch?: FolderEditDispatch;
  noAbsolutePositioning?: boolean;
  noVirtualization?: boolean;
  noScrollRestore?: boolean;
  noFastList?: boolean;
  scrollContainerClosest?: string;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
};

const INTERSECTION_THROTTLE = 200;
const RESERVED_HOTKEYS = new Set(['9', '0']);

const ChatList = (props: OwnProps) => {
  const { openChat, openNextChat, closeForumPanel, closeCommunityPanel, toggleStoryRibbon, openLeftColumnContent } =
    getActions();
  let containerRef!: HTMLDivElement;
  const [panesHeight, setPanesHeight] = createSignal(0);

  const isArchived = createMemo(() => props.folderType === 'archived');
  const isAllFolder = createMemo(() => props.folderType === 'all');
  const isSaved = createMemo(() => props.folderType === 'saved');
  const resolvedFolderId = createMemo(() =>
    isAllFolder() ? ALL_FOLDER_ID : isArchived() ? ARCHIVED_FOLDER_ID : isSaved() ? SAVED_FOLDER_ID : props.folderId!,
  );

  const shouldDisplayArchive = createMemo(() => isAllFolder() && props.canDisplayArchive && props.archiveSettings);

  const orderedIds = useFolderManagerForOrderedIds(() => resolvedFolderId());
  usePeerStoriesPolling(orderedIds);

  const chatsHeight = (orderedIds?.length || 0) * CHAT_HEIGHT_PX;
  const archiveHeight = createMemo(() =>
    shouldDisplayArchive() ? (props.archiveSettings?.isMinimized ? ARCHIVE_MINIMIZED_HEIGHT : CHAT_HEIGHT_PX) : 0,
  );

  const orderDiffResult = createMemo(() => useOrderDiff(orderedIds, () => panesHeight()));
  const orderDiffById = () => orderDiffResult().orderDiffById;
  const shiftDiff = () => orderDiffResult().shiftDiff;
  const getAnimationType = () => orderDiffResult().getAnimationType;
  const onReorderAnimationEnd = () => orderDiffResult().onReorderAnimationEnd;

  const chatListSlice = createMemo(() =>
    props.noVirtualization ? Math.max(CHAT_LIST_SLICE, orderedIds?.length || 0) : CHAT_LIST_SLICE,
  );
  const [viewportIds, getMore] = useInfiniteScroll(
    undefined,
    () => orderedIds,
    undefined,
    () => chatListSlice(),
  );

  // Support <Alt>+<Up/Down> to navigate between chats
  useHotkeys(() =>
    createMemo(() =>
      props.isActive && orderedIds?.length
        ? {
            'Alt+ArrowUp': (e: KeyboardEvent) => {
              e.preventDefault();
              openNextChat({ targetIndexDelta: -1, orderedIds });
            },
            'Alt+ArrowDown': (e: KeyboardEvent) => {
              e.preventDefault();
              openNextChat({ targetIndexDelta: 1, orderedIds });
            },
          }
        : undefined,
    ),
  );

  // Support <Cmd>+<Digit> to navigate between chats
  // TODO(codemod): dependency on a container (archiveSettings) keeps its identity while its content changes: track the fields the effect reads instead (store contract §12.7)
  createEffect(
    depsOf(
      () =>
        [
          props.archiveSettings,
          isSaved(),
          props.isActive,
          openChat,
          openNextChat,
          orderedIds,
          shouldDisplayArchive(),
          props.isMainList,
        ] as const,
    ),
    ([archiveSettings2, isSaved2, isActive2, , , , shouldDisplayArchive2, isMainList2]) => {
      if (!isActive2 || isSaved2 || !orderedIds || !IS_APP) {
        return undefined;
      }

      function handleKeyDown(e: KeyboardEvent) {
        if (((IS_MAC_OS && e.metaKey) || (!IS_MAC_OS && e.ctrlKey)) && e.code.startsWith('Digit')) {
          const [, digit] = e.code.match(/Digit(\d)/) || [];
          if (!digit || RESERVED_HOTKEYS.has(digit)) return;

          const isArchiveInList = shouldDisplayArchive2 && archiveSettings2 && !archiveSettings2.isMinimized;

          const shift = isArchiveInList ? -1 : 0;
          const position = Number(digit) + shift - 1;

          if (isArchiveInList && position === -1) {
            if (isMainList2) openLeftColumnContent({ contentKey: LeftColumnContent.Archived });
            return;
          }

          if (position > orderedIds!.length - 1) return;

          openChat({ id: orderedIds![position], shouldReplaceHistory: true });
        }
      }

      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    },
  );

  const { observe } = useIntersectionObserver({
    rootRef: () => containerRef,
    throttleMs: INTERSECTION_THROTTLE,
  });

  const handleArchivedClick = () => {
    openLeftColumnContent({ contentKey: LeftColumnContent.Archived });
    closeForumPanel();
    closeCommunityPanel();
  };

  const handleShowStoryRibbon = () => {
    toggleStoryRibbon({ isShown: true, isArchived: isArchived() });
  };

  const handleHideStoryRibbon = () => {
    toggleStoryRibbon({ isShown: false, isArchived: isArchived() });
  };

  useTopOverscroll({
    containerRef: () => containerRef,
    onOverscroll: handleShowStoryRibbon,
    onReset: handleHideStoryRibbon,
    isDisabled: () => isSaved(),
    isOverscrolled: () => props.isStoryRibbonShown,
  });

  function renderChats() {
    const viewportOffset = orderedIds!.indexOf(viewportIds()![0]);

    const pinnedCount = getPinnedChatsCount(resolvedFolderId()) || 0;

    return viewportIds()!.map((id, i) => {
      const isPinned = viewportOffset + i < pinnedCount;
      const offsetTop = props.noAbsolutePositioning
        ? undefined
        : panesHeight() + archiveHeight() + (viewportOffset + i) * CHAT_HEIGHT_PX;

      return (
        <Chat
          teactOrderKey={isPinned ? i : getOrderKey(id, isSaved())}
          chatId={id}
          isPinned={isPinned}
          folderId={props.folderId}
          isSavedDialog={isSaved()}
          animationType={getAnimationType()(id)}
          orderDiff={orderDiffById()[id]}
          shiftDiff={shiftDiff()}
          onReorderAnimationEnd={onReorderAnimationEnd()}
          offsetTop={offsetTop}
          observeIntersection={observe}
          withTags={props.withTags}
          isFoldersSidebarShown={props.isFoldersSidebarShown}
        />
      );
    });
  }

  const totalHeight = createMemo(() => chatsHeight + archiveHeight() + panesHeight());

  return (
    <InfiniteScroll
      className={buildClassName(
        'chat-list custom-scroll',
        props.isForumPanelOpen && 'forum-panel-open',
        props.className,
      )}
      ref={containerRef}
      items={viewportIds()}
      itemSelector=".ListItem:not(.chat-item-archive)"
      preloadBackwards={CHAT_LIST_SLICE}
      withAbsolutePositioning={!props.noAbsolutePositioning}
      maxHeight={!props.noAbsolutePositioning ? totalHeight() : undefined}
      scrollContainerClosest={props.scrollContainerClosest}
      noScrollRestore={props.noScrollRestore}
      noFastList={props.noFastList}
      onLoadMore={getMore}
      onScroll={props.onScroll}
    >
      {!isSaved() && <ChatListPanes noBanners={!isAllFolder()} onHeightChange={setPanesHeight} />}
      {shouldDisplayArchive() && (
        <Archive
          archiveSettings={props.archiveSettings}
          onClick={handleArchivedClick}
          animationType={getAnimationType()(ARCHIVE_ANIMATION_ID)}
          offsetTop={panesHeight()}
          isFoldersSidebarShown={props.isFoldersSidebarShown}
        />
      )}
      {viewportIds()?.length ? (
        renderChats()
      ) : viewportIds() && !viewportIds().length && !isSaved() ? (
        <EmptyFolder folderId={props.folderId} folderType={props.folderType} foldersDispatch={props.foldersDispatch!} />
      ) : (
        <Loading />
      )}
    </InfiniteScroll>
  );
};

export default ChatList;
