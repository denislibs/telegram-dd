import { createEffect, createMemo, onMount } from 'frameact';
import { getActions, withGlobal } from '../../../global';
import { depsOf } from '../../../util/effectDeps';
import { createShowTransition } from '../../../lib/kit';

import type { ApiChatFolder, ApiChatlistExportedInvite } from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { AnimationLevel } from '../../../types';

import { ALL_FOLDER_ID } from '../../../config';
import { selectTabState } from '../../../global/selectors';
import { selectCurrentLimit } from '../../../global/selectors/limits';
import { selectSharedSettings } from '../../../global/selectors/sharedState';
import { IS_TOUCH_ENV } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import captureEscKeyListener from '../../../util/captureEscKeyListener';
import { captureEvents, SwipeDirection } from '../../../util/captureEvents';
import { resolveTransitionName } from '../../../util/resolveTransitionName';

import useFolderTabs from '../../../hooks/useFolderTabs';
import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useScrolledState from '../../../hooks/useScrolledState';

import StoryRibbon from '../../story/StoryRibbon';
import Transition from '../../ui/Transition';
import ChatFolderTabList from './ChatFolderTabList';
import ChatList from './ChatList';

type OwnProps = {
  foldersDispatch: FolderEditDispatch;
  isForumPanelOpen?: boolean;
  isFoldersSidebarShown?: boolean;
};

type StateProps = {
  chatFoldersById: Record<number, ApiChatFolder>;
  folderInvitesById: Record<number, ApiChatlistExportedInvite[]>;
  orderedFolderIds?: number[];
  activeChatFolder: number;
  currentUserId?: string;
  animationLevel: AnimationLevel;
  shouldSkipHistoryAnimations?: boolean;
  maxFolders: number;
  maxChatLists: number;
  maxFolderInvites: number;
  hasArchivedChats?: boolean;
  hasArchivedStories?: boolean;
  archiveSettings: GlobalState['archiveSettings'];
  isStoryRibbonShown?: boolean;
};

const SAVED_MESSAGES_HOTKEY = '0';
const FIRST_FOLDER_INDEX = 0;

const ChatFolders = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { loadChatFolders, setActiveChatFolder, openChat } = getActions();

  let transitionRef!: HTMLDivElement;

  const lang = useLang();

  const { isAtBeginning, handleScroll, updateScrollState } = useScrolledState();

  onMount(() => {
    loadChatFolders();
  });

  createEffect(
    depsOf(() => [props.activeChatFolder, updateScrollState] as const),
    ([activeChatFolder2]) => {
      const activeList = transitionRef?.querySelector<HTMLElement>('.chat-list.Transition_slide-active');
      updateScrollState(activeList ?? undefined);
    },
  );

  const {
    ref,
    shouldRender: shouldRenderStoryRibbon,
    isClosing: getIsStoryRibbonClosing,
  } = createShowTransition({
    isOpen: () => props.isStoryRibbonShown,
    className: false,
  });
  const isStoryRibbonClosing = createMemo(getIsStoryRibbonClosing);

  const scrollToTop = () => {
    // TODO(codemod): ref is a callback ref now: keep the element in a let assigned from ref={(el) => { ref(el); element = el; }}
    const activeList = ref.current?.querySelector<HTMLElement>('#LeftColumn .chat-list.Transition_slide-active');
    activeList?.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const folderTabsResult = createMemo(() =>
    useFolderTabs({
      sidebarMode: false,
      noEmoticons: true,
      orderedFolderIds: () => props.orderedFolderIds,
      chatFoldersById: () => props.chatFoldersById,
      maxFolders: () => props.maxFolders,
      maxChatLists: () => props.maxChatLists,
      folderInvitesById: () => props.folderInvitesById,
      maxFolderInvites: () => props.maxFolderInvites,
    }),
  );
  const displayedFolders = () => folderTabsResult().displayedFolders;
  const folderTabs = () => folderTabsResult().folderTabs;

  const allChatsFolderIndex = createMemo(() => displayedFolders()?.findIndex((folder) => folder.id === ALL_FOLDER_ID));
  const isInAllChatsFolder = createMemo(() => allChatsFolderIndex() === props.activeChatFolder);
  const isInFirstFolder = createMemo(() => FIRST_FOLDER_INDEX === props.activeChatFolder);

  const openFolder = (index: number) => {
    if (props.activeChatFolder === index) return;

    setActiveChatFolder({ activeChatFolder: index }, { forceOnHeavyAnimation: true });
  };

  const handleSwitchTab = (index: number) => {
    if (props.activeChatFolder === index) {
      scrollToTop();
      return;
    }

    openFolder(index);
  };

  // Prevent `activeTab` pointing at non-existing folder after update
  createEffect(
    depsOf(() => [props.activeChatFolder, folderTabs(), setActiveChatFolder] as const),
    ([activeChatFolder2, folderTabs2]) => {
      if (!folderTabs2?.length) {
        return;
      }

      if (activeChatFolder2 >= folderTabs2.length) {
        setActiveChatFolder({ activeChatFolder: FIRST_FOLDER_INDEX });
      }
    },
  );

  createEffect(
    depsOf(() => [props.activeChatFolder, folderTabs(), props.isForumPanelOpen, setActiveChatFolder] as const),
    ([activeChatFolder2, folderTabs2, isForumPanelOpen2]) => {
      if (!IS_TOUCH_ENV || !folderTabs2?.length || isForumPanelOpen2) {
        return undefined;
      }

      return captureEvents(transitionRef!, {
        selectorToPreventScroll: '.chat-list',
        onSwipe: (e, direction) => {
          if (direction === SwipeDirection.Left) {
            setActiveChatFolder(
              { activeChatFolder: Math.min(activeChatFolder2 + 1, folderTabs2.length - 1) },
              { forceOnHeavyAnimation: true },
            );
            return true;
          } else if (direction === SwipeDirection.Right) {
            setActiveChatFolder(
              { activeChatFolder: Math.max(0, activeChatFolder2 - 1) },
              { forceOnHeavyAnimation: true },
            );
            return true;
          }

          return false;
        },
      });
    },
  );

  let isNotInFirstFolderRef;
  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  isNotInFirstFolderRef = !isInFirstFolder();
  createEffect(
    depsOf(() => [props.activeChatFolder, setActiveChatFolder] as const),
    ([activeChatFolder2]) =>
      isNotInFirstFolderRef
        ? captureEscKeyListener(() => {
            if (isNotInFirstFolderRef) {
              setActiveChatFolder({ activeChatFolder: FIRST_FOLDER_INDEX });
            }
          })
        : undefined,
  );

  useHistoryBack({
    isActive: () => !isInFirstFolder(),
    onBack: () => setActiveChatFolder({ activeChatFolder: FIRST_FOLDER_INDEX }, { forceOnHeavyAnimation: true }),
  });

  createEffect(
    depsOf(() => [props.currentUserId, folderTabs(), openChat, setActiveChatFolder] as const),
    ([currentUserId2, folderTabs2]) => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.shiftKey && e.code.startsWith('Digit') && folderTabs2) {
          const [, digit] = e.code.match(/Digit(\d)/) || [];
          if (!digit) return;

          if (digit === SAVED_MESSAGES_HOTKEY) {
            openChat({ id: currentUserId2, shouldReplaceHistory: true });
            return;
          }

          const folder = Number(digit) - 1;
          if (folder > folderTabs2.length - 1) return;

          setActiveChatFolder({ activeChatFolder: folder }, { forceOnHeavyAnimation: true });
          e.preventDefault();
        }
      };

      document.addEventListener('keydown', handleKeyDown, true);

      return () => {
        document.removeEventListener('keydown', handleKeyDown, true);
      };
    },
  );

  const { ref: placeholderRef, shouldRender: shouldRenderPlaceholder } = createShowTransition({
    isOpen: () => !props.orderedFolderIds && !props.isFoldersSidebarShown,
    noMountTransition: true,
  });

  function renderCurrentTab(isActive: boolean) {
    const activeFolder = Object.values(props.chatFoldersById).find(
      ({ id }) => id === folderTabs()![props.activeChatFolder].id,
    );
    const isFolder = activeFolder && !isInAllChatsFolder();

    return (
      <ChatList
        folderType={isFolder ? 'folder' : 'all'}
        folderId={isFolder ? activeFolder.id : undefined}
        isActive={isActive}
        isForumPanelOpen={props.isForumPanelOpen}
        foldersDispatch={props.foldersDispatch}
        isMainList
        canDisplayArchive={(props.hasArchivedChats || props.hasArchivedStories) && !props.archiveSettings.isHidden}
        archiveSettings={props.archiveSettings}
        isFoldersSidebarShown={props.isFoldersSidebarShown}
        isStoryRibbonShown={props.isStoryRibbonShown}
        withTags
        onScroll={handleScroll}
      />
    );
  }

  const hasFolders = createMemo(() => folderTabs() && folderTabs().length > 1);
  const shouldRenderFolders = createMemo(() => hasFolders() && !props.isFoldersSidebarShown);

  return (
    <div
      ref={ref}
      class={buildClassName(
        'ChatFolders',
        shouldRenderStoryRibbon() && 'with-story-ribbon',
        props.isFoldersSidebarShown && 'ChatFolders--tabs-sidebar-shown',
      )}
    >
      {shouldRenderStoryRibbon() && <StoryRibbon isClosing={isStoryRibbonClosing()} />}
      <div
        class={buildClassName(
          'ChatFolders-content',
          shouldRenderFolders() && 'with-tabs',
          !shouldRenderFolders() && !isAtBeginning && 'scrolled',
        )}
      >
        {shouldRenderFolders() ? (
          <ChatFolderTabList
            tabs={folderTabs()}
            activeTab={props.activeChatFolder}
            onSwitchTab={handleSwitchTab}
            onFileHoverOpen={openFolder}
          />
        ) : shouldRenderPlaceholder() ? (
          <div ref={placeholderRef} class="tabs-placeholder" />
        ) : undefined}
        {/* TODO(codemod): <Transition> children: use the render function and render by slide.key (framework guide §6) */}
        <Transition
          ref={transitionRef}
          name={resolveTransitionName(
            'slideOptimized',
            props.animationLevel,
            props.shouldSkipHistoryAnimations,
            lang.isRtl,
          )}
          activeKey={props.activeChatFolder}
          renderCount={hasFolders() ? folderTabs().length : undefined}
        >
          {renderCurrentTab}
        </Transition>
      </div>
    </div>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  const {
    chatFolders: { byId: chatFoldersById, orderedIds: orderedFolderIds, invites: folderInvitesById },
    chats: {
      listIds: { archived },
    },
    stories: {
      orderedPeerIds: { archived: archivedStories },
    },
    currentUserId,
    archiveSettings,
  } = global;
  const { animationLevel } = selectSharedSettings(global);
  const { shouldSkipHistoryAnimations, activeChatFolder } = selectTabState(global);
  const {
    storyViewer: { isRibbonShown: isStoryRibbonShown },
  } = selectTabState(global);

  return {
    chatFoldersById,
    folderInvitesById,
    orderedFolderIds,
    activeChatFolder,
    currentUserId,
    animationLevel,
    shouldSkipHistoryAnimations,
    hasArchivedChats: Boolean(archived?.length),
    hasArchivedStories: Boolean(archivedStories?.length),
    maxFolders: selectCurrentLimit(global, 'dialogFilters'),
    maxFolderInvites: selectCurrentLimit(global, 'chatlistInvites'),
    maxChatLists: selectCurrentLimit(global, 'chatlistJoined'),
    archiveSettings,
    isStoryRibbonShown,
  };
};

export default ChatFolders;
