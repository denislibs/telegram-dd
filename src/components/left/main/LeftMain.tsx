import type { Update } from '@tauri-apps/plugin-updater';
import { createEffect, createMemo, createSignal, onMount } from 'frameact';
import { getActions } from '../../../global';
import { createShowTransition } from '../../../lib/kit';

import type { FolderEditDispatch } from '../../../hooks/reducers/useFoldersReducer';
import { LeftColumnContent } from '../../../types';

import { DEBUG } from '../../../config';
import { selectCommunityPanelId } from '../../../global/selectors';
import { IS_TAURI } from '../../../util/browser/globalEnvironment';
import { IS_TOUCH_ENV } from '../../../util/browser/windowEnvironment';

import useSelector from '../../../hooks/data/useSelector';
import useInterval from '../../../hooks/schedulers/useInterval';
import useForumPanelRender from '../../../hooks/useForumPanelRender';
import useOldLang from '../../../hooks/useOldLang';

import Button from '../../ui/Button';
import Transition from '../../ui/Transition';
import NewChatButton from '../NewChatButton';
import LeftSearch from '../search/LeftSearch.async';
import ChatFolders from './ChatFolders';
import CommunityPanel from './community/CommunityPanel';
import ContactList from './ContactList.async';
import ForumPanel from './forum/ForumPanel';
import LeftMainHeader from './LeftMainHeader';

import './LeftMain.scss';

type OwnProps = {
  content: LeftColumnContent;
  searchQuery?: string;
  searchDate?: number;
  contactsFilter: string;
  shouldSkipTransition?: boolean;
  foldersDispatch: FolderEditDispatch;
  isAppUpdateAvailable?: boolean;
  isForumPanelOpen?: boolean;
  isClosingSearch?: boolean;
  onSearchQuery: (query: string) => void;
  onTopicSearch: NoneToVoidFunction;
  isAccountFrozen?: boolean;
  onReset: () => void;
  isFoldersSidebarShown?: boolean;
};

const TRANSITION_RENDER_COUNT = Object.keys(LeftColumnContent).length / 2;
const BUTTON_CLOSE_DELAY_MS = 250;
const TAURI_CHECK_UPDATE_INTERVAL = 10 * 60 * 1000;

let closeTimeout: number | undefined;

const LeftMain = (props: OwnProps) => {
  const { openLeftColumnContent } = getActions();
  const [isNewChatButtonShown, setIsNewChatButtonShown] = createSignal(IS_TOUCH_ENV);
  const [tauriUpdate, setTauriUpdate] = createSignal<Update | undefined>(undefined);
  const [isTauriUpdateDownloading, setIsTauriUpdateDownloading] = createSignal(false);

  const { shouldRenderForumPanel, handleForumPanelAnimationEnd, handleForumPanelAnimationStart, isAnimationStarted } =
    useForumPanelRender(() => Boolean(props.isForumPanelOpen));
  const isForumPanelRendered = createMemo(() => props.isForumPanelOpen && props.content === LeftColumnContent.ChatList);
  const isForumPanelVisible = createMemo(() => isForumPanelRendered() && isAnimationStarted());

  const communityPanelId = useSelector((global) => selectCommunityPanelId(global));
  const isCommunityPanelOpen = createMemo(() => Boolean(communityPanelId()));
  const {
    shouldRenderForumPanel: shouldRenderCommunityPanel,
    handleForumPanelAnimationEnd: handleCommunityPanelAnimationEnd,
    handleForumPanelAnimationStart: handleCommunityPanelAnimationStart,
  } = useForumPanelRender(isCommunityPanelOpen);
  const isCommunityPanelRendered = createMemo(
    () => isCommunityPanelOpen() && props.content === LeftColumnContent.ChatList,
  );

  // Deviation: tt's `useShowTransitionDeprecated` returned the class names; the kit's transition writes them itself
  // through `ref` (`opacity-transition fast shown open`, same tokens).
  const updateButtonTransition = createShowTransition({
    isOpen: () => Boolean(props.isAppUpdateAvailable) || Boolean(tauriUpdate()),
  });

  let isMouseInsideRef = false;

  const handleMouseEnter = () => {
    if (props.content !== LeftColumnContent.ChatList) {
      return;
    }
    isMouseInsideRef = true;
    setIsNewChatButtonShown(true);
  };

  const handleMouseLeave = () => {
    isMouseInsideRef = false;

    if (closeTimeout) {
      clearTimeout(closeTimeout);
      closeTimeout = undefined;
    }

    closeTimeout = window.setTimeout(() => {
      if (!isMouseInsideRef) {
        setIsNewChatButtonShown(false);
      }
    }, BUTTON_CLOSE_DELAY_MS);
  };

  const handleSelectContacts = () => {
    openLeftColumnContent({ contentKey: LeftColumnContent.Contacts });
  };

  const handleUpdateClick = async () => {
    const update = tauriUpdate();
    if (update) {
      try {
        setIsTauriUpdateDownloading(true);
        await update.downloadAndInstall();
        setIsTauriUpdateDownloading(false);

        await window.tauri?.relaunch();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to download and install Tauri update', e);
      } finally {
        setIsTauriUpdateDownloading(false);
      }
    } else {
      window.location.reload();
    }
  };

  const handleSelectNewChannel = () => {
    openLeftColumnContent({ contentKey: LeftColumnContent.NewChannelStep1 });
  };

  const handleSelectNewGroup = () => {
    openLeftColumnContent({ contentKey: LeftColumnContent.NewGroupStep1 });
  };

  createEffect(
    () => props.content,
    (content2) => {
      let autoCloseTimeout: number | undefined;
      if (content2 !== LeftColumnContent.ChatList) {
        autoCloseTimeout = window.setTimeout(() => {
          setIsNewChatButtonShown(false);
        }, BUTTON_CLOSE_DELAY_MS);
      } else if (isMouseInsideRef || IS_TOUCH_ENV) {
        setIsNewChatButtonShown(true);
      }

      return () => {
        if (autoCloseTimeout) {
          clearTimeout(autoCloseTimeout);
          autoCloseTimeout = undefined;
        }
      };
    },
  );

  const checkTauriUpdate = () => {
    window.tauri
      ?.checkUpdate()
      .then((update) => setTauriUpdate(update ?? undefined))
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error('Tauri update check failed:', e);
      });
  };

  onMount(() => {
    checkTauriUpdate();
  });

  useInterval(checkTauriUpdate, IS_TAURI && !DEBUG ? TAURI_CHECK_UPDATE_INTERVAL : undefined);

  const lang = useOldLang();

  return (
    <div
      id="LeftColumn-main"
      onMouseEnter={!IS_TOUCH_ENV ? handleMouseEnter : undefined}
      onMouseLeave={!IS_TOUCH_ENV ? handleMouseLeave : undefined}
    >
      <LeftMainHeader
        shouldHideSearch={isForumPanelVisible()}
        content={props.content}
        contactsFilter={props.contactsFilter}
        onSearchQuery={props.onSearchQuery}
        onReset={props.onReset}
        shouldSkipTransition={props.shouldSkipTransition}
        isClosingSearch={props.isClosingSearch}
        isFoldersSidebarShown={props.isFoldersSidebarShown}
      />
      <Transition
        name={props.shouldSkipTransition ? 'none' : 'zoomFade'}
        renderCount={TRANSITION_RENDER_COUNT}
        activeKey={props.content}
        shouldCleanup
        cleanupExceptionKey={LeftColumnContent.ChatList}
        shouldWrap
        wrapExceptionKey={LeftColumnContent.ChatList}
      >
        {(slide) => {
          switch (slide.key) {
            case LeftColumnContent.ChatList:
              return (
                <ChatFolders
                  foldersDispatch={props.foldersDispatch}
                  isForumPanelOpen={isForumPanelVisible()}
                  isFoldersSidebarShown={props.isFoldersSidebarShown}
                />
              );
            case LeftColumnContent.GlobalSearch:
              return (
                <LeftSearch
                  searchQuery={props.searchQuery}
                  searchDate={props.searchDate}
                  isActive={slide.isActive()}
                  onReset={props.onReset}
                />
              );
            case LeftColumnContent.Contacts:
              return <ContactList filter={props.contactsFilter} isActive={slide.isActive()} onReset={props.onReset} />;
            default:
              return undefined;
          }
        }}
      </Transition>
      {updateButtonTransition.shouldRender() && (
        <Button
          fluid
          badge
          ref={updateButtonTransition.ref}
          className="btn-update"
          onClick={handleUpdateClick}
          isLoading={isTauriUpdateDownloading()}
        >
          {lang('lng_update_telegram')}
        </Button>
      )}
      {shouldRenderCommunityPanel() && (
        <CommunityPanel
          isOpen={isCommunityPanelOpen()}
          isHidden={!isCommunityPanelRendered()}
          onOpenAnimationStart={handleCommunityPanelAnimationStart}
          onCloseAnimationEnd={handleCommunityPanelAnimationEnd}
        />
      )}
      {shouldRenderForumPanel() && (
        <ForumPanel
          isOpen={props.isForumPanelOpen}
          isHidden={!isForumPanelRendered()}
          onTopicSearch={props.onTopicSearch}
          onOpenAnimationStart={handleForumPanelAnimationStart}
          onCloseAnimationEnd={handleForumPanelAnimationEnd}
        />
      )}
      <NewChatButton
        isShown={isNewChatButtonShown()}
        onNewPrivateChat={handleSelectContacts}
        onNewChannel={handleSelectNewChannel}
        onNewGroup={handleSelectNewGroup}
        isAccountFrozen={props.isAccountFrozen}
      />
    </div>
  );
};

export default LeftMain;
