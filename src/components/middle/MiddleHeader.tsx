import { createMemo, previous } from 'frameact';
import { getActions, withGlobal } from '../../global';

import type { ApiChat, ApiSticker, ApiTypingStatus } from '../../api/types';
import type { GlobalState } from '../../global/types';
import type { Signal } from '../../util/signals';
import { MAIN_THREAD_ID } from '../../api/types';
import { type MessageListType, StoryViewerOrigin, type ThreadId } from '../../types';

import { EDITABLE_INPUT_CSS_SELECTOR, MIN_SCREEN_WIDTH_FOR_STATIC_LEFT_COLUMN } from '../../config';
import { getIsSavedDialog } from '../../global/helpers';
import {
  selectChat,
  selectCustomEmoji,
  selectIsChatWithSelf,
  selectIsInSelectMode,
  selectIsRightColumnShown,
  selectPeer,
  selectPinnedIds,
  selectScheduledIds,
  selectTabState,
} from '../../global/selectors';
import { selectThreadLocalStateParam, selectThreadMessagesCount } from '../../global/selectors/threads';
import { IS_TAURI } from '../../util/browser/globalEnvironment';
import { IS_MAC_OS } from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';
import { isUserId } from '../../util/entities/ids';

import useAppLayout from '../../hooks/useAppLayout';
import useConnectionStatus from '../../hooks/useConnectionStatus';
import useLang from '../../hooks/useLang';
import useLongPress from '../../hooks/useLongPress';
import useWindowSize from '../../hooks/window/useWindowSize';

import GroupChatInfo from '../common/GroupChatInfo';
import PrivateChatInfo from '../common/PrivateChatInfo';
import UnreadCounter from '../common/UnreadCounter';
import Button from '../ui/Button';
import Transition from '../ui/Transition';
import HeaderActions from './HeaderActions';

import './MiddleHeader.scss';

const BACK_BUTTON_INACTIVE_TIME = 450;
const EMOJI_STATUS_SIZE = 22;
const SEARCH_LONGTAP_THRESHOLD = 500;

type OwnProps = {
  chatId: string;
  threadId: ThreadId;
  messageListType: MessageListType;
  isComments?: boolean;
  isMobile?: boolean;
  getCurrentPinnedIndex: Signal<number>;
  getLoadingPinnedId: Signal<number | undefined>;
  onFocusPinnedMessage: (messageId: number) => void;
};

type StateProps = {
  chat?: ApiChat;
  isSavedDialog?: boolean;
  typingStatusByPeerId?: Record<string, ApiTypingStatus>;
  isSelectModeActive?: boolean;
  isLeftColumnShown?: boolean;
  isRightColumnShown?: boolean;
  messagesCount?: number;
  isChatWithSelf?: boolean;
  shouldSkipHistoryAnimations?: boolean;
  currentTransitionKey: number;
  connectionState?: GlobalState['connectionState'];
  isSyncing?: boolean;
  isFetchingDifference?: boolean;
  emojiStatusSticker?: ApiSticker;
  emojiStatusSlug?: string;
};

const MiddleHeader = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const {
    openThreadWithInfo,
    openChat,
    openPreviousChat,
    toggleLeftColumn,
    exitMessageSelectMode,
    openPremiumModal,
    openStickerSet,
    updateMiddleSearch,
    openUniqueGiftBySlug,
  } = getActions();

  const lang = useLang();

  let isBackButtonActiveRef = true;
  const { isTablet } = useAppLayout();

  const { width: windowWidth } = useWindowSize();

  const isLeftColumnHideable = windowWidth <= MIN_SCREEN_WIDTH_FOR_STATIC_LEFT_COLUMN;
  const shouldShowCloseButton = createMemo(() => isTablet && props.isLeftColumnShown);

  let componentRef!: HTMLDivElement;

  const handleOpenSearch = () => {
    updateMiddleSearch({ chatId: props.chatId, threadId: props.threadId, update: {} });
  };

  const handleOpenChat = (event: React.MouseEvent | React.TouchEvent) => {
    if ((event.target as Element).closest('.title > .custom-emoji')) return;

    // Force close My Profile if clicked on Saved Messages header
    openThreadWithInfo({ chatId: props.chatId, threadId: props.threadId, isOwnProfile: false });
  };

  const {
    onMouseDown: handleLongPressMouseDown,
    onMouseUp: handleLongPressMouseUp,
    onMouseLeave: handleLongPressMouseLeave,
    onTouchStart: handleLongPressTouchStart,
    onTouchEnd: handleLongPressTouchEnd,
  } = useLongPress({
    onStart: handleOpenSearch,
    onClick: handleOpenChat,
    threshold: SEARCH_LONGTAP_THRESHOLD,
  });

  const setBackButtonActive = () => {
    setTimeout(() => {
      isBackButtonActiveRef = true;
    }, BACK_BUTTON_INACTIVE_TIME);
  };

  const handleUserStatusClick = () => {
    if (props.emojiStatusSlug) {
      openUniqueGiftBySlug({ slug: props.emojiStatusSlug });
      return;
    }
    openPremiumModal({ fromUserId: props.chatId });
  };

  const handleChannelStatusClick = () => {
    if (props.emojiStatusSlug) {
      openUniqueGiftBySlug({ slug: props.emojiStatusSlug });
      return;
    }
    openStickerSet({
      stickerSetInfo: props.emojiStatusSticker!.stickerSetInfo,
    });
  };

  const navigateBack = () => {
    if (!isBackButtonActiveRef) return;

    // Workaround for missing UI when quickly clicking the Back button
    isBackButtonActiveRef = false;
    if (props.isMobile) {
      const messageInput = document.querySelector<HTMLDivElement>(EDITABLE_INPUT_CSS_SELECTOR);
      messageInput?.blur();
    }

    if (props.isSelectModeActive) {
      exitMessageSelectMode();
      setBackButtonActive();
      return;
    }

    if (props.messageListType === 'thread' && props.currentTransitionKey === 0) {
      if (!isTablet || shouldShowCloseButton()) {
        openChat({ id: undefined }, { forceOnHeavyAnimation: true });
      } else {
        toggleLeftColumn();
      }

      setBackButtonActive();

      return;
    }

    openPreviousChat();
    setBackButtonActive();
  };

  const handleBackClick = (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
    if (
      isBackButtonActiveRef &&
      props.messageListType === 'thread' &&
      props.currentTransitionKey === 0 &&
      (!isTablet || shouldShowCloseButton())
    ) {
      e.stopPropagation(); // Stop propagation to prevent chat re-opening on tablets
    }

    navigateBack();
  };

  const prevTransitionKey = previous(() => props.currentTransitionKey);

  const cleanupExceptionKey =
    createMemo(() => prevTransitionKey() !== undefined && prevTransitionKey() < props.currentTransitionKey ? prevTransitionKey() : undefined);

  const connectionStatusResult = createMemo(() => useConnectionStatus(lang, () => props.connectionState, () => props.isSyncing || props.isFetchingDifference, true));
  const connectionStatusText = () => connectionStatusResult().connectionStatusText;

  function renderInfoTitle() {
    if (props.messagesCount === undefined) {
      return lang('Loading');
    }

    if (props.messageListType === 'thread') {
      if (!props.messagesCount) {
        return lang(props.isComments ? 'CommentsTitle' : 'RepliesTitle');
      }

      return lang(props.isComments ? 'Comments' : 'Replies', { count: props.messagesCount }, { pluralValue: props.messagesCount });
    }

    if (props.messageListType === 'pinned') {
      return lang('PinnedMessagesCount', { count: props.messagesCount }, { pluralValue: props.messagesCount });
    }

    if (props.messageListType === 'scheduled') {
      if (props.isChatWithSelf) {
        return lang('Reminders');
      }

      return lang('Messages', { count: props.messagesCount }, { pluralValue: props.messagesCount });
    }

    return undefined;
  }

  function renderInfo() {
    if (props.messageListType === 'thread') {
      if (props.threadId === MAIN_THREAD_ID || props.isSavedDialog || props.chat?.isForum) {
        return renderChatInfo();
      }
    }

    return (
      <>
        {renderBackButton(props.currentTransitionKey === 0)}
        <h3>{renderInfoTitle()}</h3>
      </>
    );
  }

  function renderChatInfo() {
    const savedMessagesStatus = props.isSavedDialog
      ? props.messagesCount !== undefined
        ? lang('Messages', { count: props.messagesCount }, { pluralValue: props.messagesCount })
        : lang('SavedMessages')
      : undefined;

    const realChatId = props.isSavedDialog ? String(props.threadId) : props.chatId;

    const displayChatId = props.chat?.isMonoforum ? props.chat.linkedMonoforumId! : realChatId;
    return (
      <>
        {(isLeftColumnHideable || props.currentTransitionKey > 0) && renderBackButton(shouldShowCloseButton(), !props.isSavedDialog)}
        <div
          class="chat-info-wrapper"
          onMouseDown={handleLongPressMouseDown}
          onMouseUp={handleLongPressMouseUp}
          onMouseLeave={handleLongPressMouseLeave}
          onTouchStart={handleLongPressTouchStart}
          onTouchEnd={handleLongPressTouchEnd}
        >
          {isUserId(displayChatId) ? (
            <PrivateChatInfo
              userId={displayChatId}
              threadId={!props.isSavedDialog ? props.threadId : undefined}
              typingStatusByPeerId={props.typingStatusByPeerId}
              status={connectionStatusText() || savedMessagesStatus}
              withDots={Boolean(connectionStatusText())}
              withFullInfo={props.threadId === MAIN_THREAD_ID}
              withMediaViewer={props.threadId === MAIN_THREAD_ID}
              withStory={!props.isChatWithSelf}
              withUpdatingStatus
              isSavedDialog={props.isSavedDialog}
              storyViewerOrigin={StoryViewerOrigin.MiddleHeaderAvatar}
              emojiStatusSize={EMOJI_STATUS_SIZE}
              noRtl
              onEmojiStatusClick={handleUserStatusClick}
            />
          ) : (
            <GroupChatInfo
              chatId={displayChatId}
              threadId={!props.isSavedDialog ? props.threadId : undefined}
              typingStatusByPeerId={props.typingStatusByPeerId}
              withMonoforumStatus={props.chat?.isMonoforum}
              status={connectionStatusText() || savedMessagesStatus}
              withDots={Boolean(connectionStatusText())}
              withMediaViewer={props.threadId === MAIN_THREAD_ID}
              withFullInfo={props.threadId === MAIN_THREAD_ID}
              withUpdatingStatus
              withStory
              isSavedDialog={props.isSavedDialog}
              storyViewerOrigin={StoryViewerOrigin.MiddleHeaderAvatar}
              emojiStatusSize={EMOJI_STATUS_SIZE}
              onEmojiStatusClick={handleChannelStatusClick}
              noRtl
            />
          )}
        </div>
      </>
    );
  }

  function renderBackButton(asClose = false, withUnreadCounter = false) {
    return (
      <div class="back-button">
        <Button
          round
          size="smaller"
          color="translucent"
          onClick={handleBackClick}
          onFileHoverOpen={navigateBack}
          ariaLabel={lang(asClose ? 'Close' : 'Back')}
        >
          <div class={buildClassName('animated-close-icon', !asClose && 'state-back')} />
        </Button>
        {withUnreadCounter && <UnreadCounter />}
      </div>
    );
  }

  return (
    <div class="MiddleHeader" ref={componentRef} data-tauri-drag-region={IS_TAURI && IS_MAC_OS ? true : undefined}>
      {/* TODO(codemod): <Transition> children: use the render function and render by slide.key (framework guide §6) */}
      <Transition
        name={props.shouldSkipHistoryAnimations ? 'none' : 'slideFade'}
        activeKey={props.currentTransitionKey}
        shouldCleanup
        cleanupExceptionKey={cleanupExceptionKey()}
      >
        {renderInfo()}
      </Transition>
      <div class="header-tools">
        <HeaderActions chatId={props.chatId} threadId={props.threadId} messageListType={props.messageListType} isMobile={props.isMobile} />
      </div>
    </div>
  );
};

const mapStateToProps = (global: GlobalState, { chatId, threadId, messageListType, isMobile }: OwnProps): Complete<StateProps> => {
    const { isLeftColumnShown, shouldSkipHistoryAnimations, messageLists } = selectTabState(global);
    const chat = selectChat(global, chatId);
    const peer = selectPeer(global, chatId);

    const isSavedDialog = getIsSavedDialog(chatId, threadId, global.currentUserId);

    let messagesCount: number | undefined;
    if (messageListType === 'pinned') {
      const pinnedIds = selectPinnedIds(global, chatId, threadId);
      messagesCount = pinnedIds?.length;
    } else if (messageListType === 'scheduled') {
      const scheduledIds = selectScheduledIds(global, chatId, threadId);
      messagesCount = scheduledIds?.length;
    } else if (messageListType === 'thread' && threadId !== MAIN_THREAD_ID) {
      messagesCount = selectThreadMessagesCount(global, chatId, threadId);
    }

    const typingStatusByPeerId = selectThreadLocalStateParam(global, chatId, threadId, 'typingStatusByPeerId');

    const emojiStatus = peer?.emojiStatus;
    const emojiStatusSticker = emojiStatus && selectCustomEmoji(global, emojiStatus.documentId);
    const emojiStatusSlug = emojiStatus?.type === 'collectible' ? emojiStatus.slug : undefined;

    return {
      typingStatusByPeerId,
      isLeftColumnShown,
      isRightColumnShown: selectIsRightColumnShown(global, isMobile),
      isSelectModeActive: selectIsInSelectMode(global),
      chat,
      messagesCount,
      isChatWithSelf: selectIsChatWithSelf(global, chatId),
      shouldSkipHistoryAnimations,
      currentTransitionKey: Math.max(0, messageLists.length - 1),
      connectionState: global.connectionState,
      isSyncing: global.isSyncing,
      isFetchingDifference: global.isFetchingDifference,
      emojiStatusSticker,
      emojiStatusSlug,
      isSavedDialog,
    };
  };

export default MiddleHeader;
