import { createEffect, createMemo, createSignal } from 'frameact';
import { ManualFor, Match, Switch } from 'frameact/dom';
import { getActions } from '../../../global';

import type { GlobalState } from '../../../global/types';
import type { FolderEditDispatch } from '../../../hooks/reducers/useFoldersReducer';
import { LeftColumnContent } from '../../../types';

import {
  ALL_FOLDER_ID,
  ARCHIVE_MINIMIZED_HEIGHT,
  ARCHIVED_FOLDER_ID,
  CHAT_HEIGHT_PX,
  CHAT_LIST_SLICE,
  SAVED_FOLDER_ID,
} from '../../../config';
import { IS_ANDROID, IS_APP, IS_MAC_OS } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import buildStyle from '../../../util/buildStyle';
import { depsOf } from '../../../util/effectDeps';
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

  const shouldDisplayArchive = createMemo(() =>
    Boolean(isAllFolder() && props.canDisplayArchive && props.archiveSettings),
  );

  const orderedIds = useFolderManagerForOrderedIds(resolvedFolderId);
  usePeerStoriesPolling(orderedIds);

  const chatsHeight = createMemo(() => (orderedIds()?.length || 0) * CHAT_HEIGHT_PX);
  const archiveHeight = createMemo(() =>
    shouldDisplayArchive() ? (props.archiveSettings?.isMinimized ? ARCHIVE_MINIMIZED_HEIGHT : CHAT_HEIGHT_PX) : 0,
  );

  const chatListSlice = createMemo(() =>
    props.noVirtualization ? Math.max(CHAT_LIST_SLICE, orderedIds()?.length || 0) : CHAT_LIST_SLICE,
  );
  const [viewportIds, getMore] = useInfiniteScroll(undefined, orderedIds, undefined, chatListSlice);

  // The rendered window is what changes when tt's list re-rendered without a reorder (a scroll): `useOrderDiff` drops the
  // stale diff then, so that rows mounted by a later scroll do not replay an old reorder.
  const { orderDiffById, shiftDiff, getAnimationType, onReorderAnimationEnd } = useOrderDiff(
    orderedIds,
    panesHeight,
    undefined,
    viewportIds,
  );

  // Support <Alt>+<Up/Down> to navigate between chats
  useHotkeys(
    createMemo(() => {
      const orderedIds2 = orderedIds();

      return props.isActive && orderedIds2?.length
        ? {
            'Alt+ArrowUp': (e: KeyboardEvent) => {
              e.preventDefault();
              openNextChat({ targetIndexDelta: -1, orderedIds: orderedIds2 });
            },
            'Alt+ArrowDown': (e: KeyboardEvent) => {
              e.preventDefault();
              openNextChat({ targetIndexDelta: 1, orderedIds: orderedIds2 });
            },
          }
        : undefined;
    }),
  );

  // The archive is a row of the list when it is shown and not minimized (tt reads `archiveSettings` in the handler: its
  // fields are tracked here instead, the container keeps its identity).
  const isArchiveInList = createMemo(() => Boolean(shouldDisplayArchive() && !props.archiveSettings?.isMinimized));

  // Support <Cmd>+<Digit> to navigate between chats
  createEffect(
    depsOf(() => [isSaved(), props.isActive, orderedIds(), isArchiveInList(), props.isMainList] as const),
    ([isSaved2, isActive2, orderedIds2, isArchiveInList2, isMainList2]) => {
      if (!isActive2 || isSaved2 || !orderedIds2 || !IS_APP) {
        return undefined;
      }

      function handleKeyDown(e: KeyboardEvent) {
        if (((IS_MAC_OS && e.metaKey) || (!IS_MAC_OS && e.ctrlKey)) && e.code.startsWith('Digit')) {
          const [, digit] = e.code.match(/Digit(\d)/) || [];
          if (!digit || RESERVED_HOTKEYS.has(digit)) return;

          const shift = isArchiveInList2 ? -1 : 0;
          const position = Number(digit) + shift - 1;

          if (isArchiveInList2 && position === -1) {
            if (isMainList2) openLeftColumnContent({ contentKey: LeftColumnContent.Archived });
            return;
          }

          if (position > orderedIds2!.length - 1) return;

          openChat({ id: orderedIds2![position], shouldReplaceHistory: true });
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

  // The position of the first viewport id in the whole list, and the number of pinned chats: `offsetTop` of a row is
  // `(viewportOffset + index) * CHAT_HEIGHT_PX`; the pinned count follows `orderedIds` (folderManager's pin changes
  // always change the ordered ids).
  const viewportOffset = createMemo(() => {
    const viewportIds2 = viewportIds();
    return viewportIds2?.length ? orderedIds()!.indexOf(viewportIds2[0]) : 0;
  });
  const pinnedCount = createMemo(() => {
    orderedIds();
    return getPinnedChatsCount(resolvedFolderId()) || 0;
  });

  // Deviation: tt's `teactFastList` + `teactOrderKey` is `<ManualFor orderKey>`: kept rows are never moved in the DOM, a
  // row moves only when its order key changes; the visual position is `offsetTop`, not the DOM order. A pinned row's key
  // is its index in `viewportIds` (tt: `isPinned ? i : getOrderKey(id, isSaved)`).
  // The index of each id in the window comes from a map built once per window: `indexOf` per row was O(n) per row, O(n^2) per
  // update, which matters with `noVirtualization` (the whole list is the window).
  const indexInViewport = createMemo(() => new Map(viewportIds()?.map((id, index) => [id, index])));
  const getRowOrderKey = (id: string) => {
    const index = indexInViewport().get(id)!;
    return viewportOffset() + index < pinnedCount() ? index : getOrderKey(id, isSaved());
  };

  function renderChats() {
    return (
      <ManualFor each={viewportIds()} orderKey={getRowOrderKey}>
        {(id, index) => {
          const isPinned = () => viewportOffset() + index() < pinnedCount();
          const offsetTop = () =>
            props.noAbsolutePositioning
              ? undefined
              : panesHeight() + archiveHeight() + (viewportOffset() + index()) * CHAT_HEIGHT_PX;

          return (
            <Chat
              chatId={id}
              isPinned={isPinned()}
              folderId={props.folderId}
              isSavedDialog={isSaved()}
              animationType={getAnimationType()(id)}
              orderDiff={orderDiffById()[id]}
              shiftDiff={shiftDiff()}
              onReorderAnimationEnd={onReorderAnimationEnd}
              offsetTop={offsetTop()}
              observeIntersection={observe}
              withTags={props.withTags}
              isFoldersSidebarShown={props.isFoldersSidebarShown}
            />
          );
        }}
      </ManualFor>
    );
  }

  const totalHeight = createMemo(() => chatsHeight() + archiveHeight() + panesHeight());

  // Deviation: tt's InfiniteScroll wraps the children of an absolutely positioned list in `<div style="position:
  // relative">`; the ui/InfiniteScroll adapter does not (a wrapper component would flatten the rows' slot), so the list
  // renders the wrapper itself, around the panes, the archive and the rows.
  const hasWrapper = createMemo(() => !props.noAbsolutePositioning && Boolean(viewportIds()?.length));

  const renderPanes = () => !isSaved() && <ChatListPanes noBanners={!isAllFolder()} onHeightChange={setPanesHeight} />;

  const renderArchive = () =>
    shouldDisplayArchive() && (
      <Archive
        archiveSettings={props.archiveSettings!}
        onClick={handleArchivedClick}
        animationType={getAnimationType()(ARCHIVE_ANIMATION_ID)}
        offsetTop={panesHeight()}
        isFoldersSidebarShown={props.isFoldersSidebarShown}
      />
    );

  // The rows (or the empty / loading placeholder) are the sole content of their slot.
  const renderList = () => (
    <Switch fallback={<Loading />}>
      <Match when={viewportIds()?.length}>{renderChats()}</Match>
      <Match when={viewportIds() && !viewportIds()!.length && !isSaved()}>
        <EmptyFolder folderId={props.folderId} folderType={props.folderType} foldersDispatch={props.foldersDispatch!} />
      </Match>
    </Switch>
  );

  return (
    <InfiniteScroll
      className={buildClassName(
        'chat-list custom-scroll',
        props.isForumPanelOpen && 'forum-panel-open',
        props.className,
      )}
      ref={(el) => {
        containerRef = el;
      }}
      items={viewportIds()}
      itemSelector=".ListItem:not(.chat-item-archive)"
      preloadBackwards={CHAT_LIST_SLICE}
      withAbsolutePositioning={!props.noAbsolutePositioning}
      maxHeight={!props.noAbsolutePositioning ? totalHeight() : undefined}
      scrollContainerClosest={props.scrollContainerClosest}
      noScrollRestore={props.noScrollRestore}
      noFastList={props.noFastList}
      onLoadMore={getMore}
      onScroll={(e) => props.onScroll?.(e as unknown as React.UIEvent<HTMLDivElement>)}
      beforeChildren={
        hasWrapper() ? undefined : (
          <>
            {renderPanes()}
            {renderArchive()}
          </>
        )
      }
    >
      {hasWrapper() ? (
        <div style={buildStyle('position: relative', IS_ANDROID && `height: ${totalHeight()}px`)}>
          {renderPanes()}
          {renderArchive()}
          {renderList()}
        </div>
      ) : (
        renderList()
      )}
    </InfiniteScroll>
  );
};

export default ChatList;
