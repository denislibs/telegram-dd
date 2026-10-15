import { type Accessor, createEffect, createMemo, createSignal, frozenWhile } from 'frameact';
import { Show } from 'frameact/dom';
import { getActions, withGlobal } from '../../global';

import type { ApiChat, ApiSticker, ApiTypingStatus } from '../../api/types';
import type { GlobalState } from '../../global/types';
import type { TransitionSlide } from '../../lib/kit';
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
import { areRecordsShallowEqual } from '../../util/areShallowEqual';
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
  getCurrentPinnedIndex: Accessor<number>;
  getLoadingPinnedId: Accessor<number | undefined>;
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

  const windowSize = useWindowSize();

  const isLeftColumnHideable = createMemo(() => windowSize().width <= MIN_SCREEN_WIDTH_FOR_STATIC_LEFT_COLUMN);
  const shouldShowCloseButton = createMemo(() => Boolean(isTablet() && props.isLeftColumnShown));

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
      if (!isTablet() || shouldShowCloseButton()) {
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
      (!isTablet() || shouldShowCloseButton())
    ) {
      e.stopPropagation(); // Stop propagation to prevent chat re-opening on tablets
    }

    navigateBack();
  };

  // Deviation: `usePreviousDeprecated` is an effect over the key (`previous()` is lazy, and the Transition reads the
  // exception only when a step ends, so it would miss the steps).
  const [cleanupExceptionKey, setCleanupExceptionKey] = createSignal<number | undefined>(undefined);
  createEffect(
    () => props.currentTransitionKey,
    (currentTransitionKey2, prevTransitionKey) => {
      setCleanupExceptionKey(
        prevTransitionKey !== undefined && prevTransitionKey < currentTransitionKey2 ? prevTransitionKey : undefined,
      );
    },
  );

  const { connectionStatusText } = useConnectionStatus(
    lang,
    () => props.connectionState,
    () => props.isSyncing || props.isFetchingDifference,
    true,
  );

  // Deviation: tt's inactive `Transition` slide keeps the last render of its key, so a slide that is not the active one
  // must not follow the props (the previous chat info slides away while the new key's title slides in): every slide
  // reads the values of its render through `frozenWhile`.
  const slideSource = createMemo(
    () => ({
      chatId: props.chatId,
      threadId: props.threadId,
      messageListType: props.messageListType,
      isComments: props.isComments,
      chat: props.chat,
      isSavedDialog: props.isSavedDialog,
      messagesCount: props.messagesCount,
      isChatWithSelf: props.isChatWithSelf,
      typingStatusByPeerId: props.typingStatusByPeerId,
      currentTransitionKey: props.currentTransitionKey,
    }),
    { equals: areRecordsShallowEqual },
  );
  type SlideState = ReturnType<typeof slideSource>;

  function renderInfoTitle(state: Accessor<SlideState>) {
    if (state().messagesCount === undefined) {
      return lang('Loading');
    }

    const messagesCount = state().messagesCount!;

    if (state().messageListType === 'thread') {
      if (!messagesCount) {
        return lang(state().isComments ? 'CommentsTitle' : 'RepliesTitle');
      }

      return lang(
        state().isComments ? 'Comments' : 'Replies',
        { count: messagesCount },
        { pluralValue: messagesCount },
      );
    }

    if (state().messageListType === 'pinned') {
      return lang('PinnedMessagesCount', { count: messagesCount }, { pluralValue: messagesCount });
    }

    if (state().messageListType === 'scheduled') {
      if (state().isChatWithSelf) {
        return lang('Reminders');
      }

      return lang('Messages', { count: messagesCount }, { pluralValue: messagesCount });
    }

    return undefined;
  }

  // Deviation: `renderInfo` and the functions below take the slide's state as an accessor and read it in the JSX, so a
  // change of one field updates one binding (tt re-rendered the whole info and kept the elements by position).
  function renderInfo(state: Accessor<SlideState>) {
    const withChatInfo = createMemo(
      () =>
        state().messageListType === 'thread' &&
        (state().threadId === MAIN_THREAD_ID || state().isSavedDialog || state().chat?.isForum),
    );

    return (
      <Show
        when={withChatInfo()}
        fallback={
          <>
            {renderBackButton(() => state().currentTransitionKey === 0)}
            <h3>{renderInfoTitle(state)}</h3>
          </>
        }
      >
        {renderChatInfo(state)}
      </Show>
    );
  }

  function renderChatInfo(state: Accessor<SlideState>) {
    const savedMessagesStatus = () =>
      state().isSavedDialog
        ? state().messagesCount !== undefined
          ? lang('Messages', { count: state().messagesCount! }, { pluralValue: state().messagesCount! })
          : lang('SavedMessages')
        : undefined;

    const realChatId = () => (state().isSavedDialog ? String(state().threadId) : state().chatId);

    const displayChatId = createMemo(() =>
      state().chat?.isMonoforum ? state().chat!.linkedMonoforumId! : realChatId(),
    );
    return (
      <>
        <Show when={isLeftColumnHideable() || state().currentTransitionKey > 0}>
          {renderBackButton(shouldShowCloseButton, () => !state().isSavedDialog)}
        </Show>
        <div
          class="chat-info-wrapper"
          onMouseDown={handleLongPressMouseDown}
          onMouseUp={handleLongPressMouseUp}
          onMouseLeave={handleLongPressMouseLeave}
          onTouchStart={handleLongPressTouchStart}
          onTouchEnd={handleLongPressTouchEnd}
        >
          {/* `key={displayChatId}` of tt: a new chat id remounts the info. */}
          <Show when={{ id: displayChatId() }} keyed>
            {(key) =>
              isUserId(key.id) ? (
                <PrivateChatInfo
                  userId={key.id}
                  threadId={!state().isSavedDialog ? state().threadId : undefined}
                  typingStatusByPeerId={state().typingStatusByPeerId}
                  status={connectionStatusText() || savedMessagesStatus()}
                  withDots={Boolean(connectionStatusText())}
                  withFullInfo={state().threadId === MAIN_THREAD_ID}
                  withMediaViewer={state().threadId === MAIN_THREAD_ID}
                  withStory={!state().isChatWithSelf}
                  withUpdatingStatus
                  isSavedDialog={state().isSavedDialog}
                  storyViewerOrigin={StoryViewerOrigin.MiddleHeaderAvatar}
                  emojiStatusSize={EMOJI_STATUS_SIZE}
                  noRtl
                  onEmojiStatusClick={handleUserStatusClick}
                />
              ) : (
                <GroupChatInfo
                  chatId={key.id}
                  threadId={!state().isSavedDialog ? state().threadId : undefined}
                  typingStatusByPeerId={state().typingStatusByPeerId}
                  withMonoforumStatus={state().chat?.isMonoforum}
                  status={connectionStatusText() || savedMessagesStatus()}
                  withDots={Boolean(connectionStatusText())}
                  withMediaViewer={state().threadId === MAIN_THREAD_ID}
                  withFullInfo={state().threadId === MAIN_THREAD_ID}
                  withUpdatingStatus
                  withStory
                  isSavedDialog={state().isSavedDialog}
                  storyViewerOrigin={StoryViewerOrigin.MiddleHeaderAvatar}
                  emojiStatusSize={EMOJI_STATUS_SIZE}
                  onEmojiStatusClick={handleChannelStatusClick}
                  noRtl
                />
              )
            }
          </Show>
        </div>
      </>
    );
  }

  function renderBackButton(asClose: () => boolean, withUnreadCounter?: () => boolean) {
    return (
      <div class="back-button">
        <Button
          round
          size="smaller"
          color="translucent"
          onClick={handleBackClick}
          onFileHoverOpen={navigateBack}
          ariaLabel={lang(asClose() ? 'Close' : 'Back')}
        >
          <div class={buildClassName('animated-close-icon', !asClose() && 'state-back')} />
        </Button>
        {withUnreadCounter?.() && <UnreadCounter />}
      </div>
    );
  }

  const renderSlide = (slide: TransitionSlide) => {
    const state = frozenWhile(slideSource, () => !slide.isActive());

    return renderInfo(state);
  };

  return (
    <div class="MiddleHeader" data-tauri-drag-region={IS_TAURI && IS_MAC_OS ? true : undefined}>
      <Transition
        name={props.shouldSkipHistoryAnimations ? 'none' : 'slideFade'}
        activeKey={props.currentTransitionKey}
        shouldCleanup
        cleanupExceptionKey={cleanupExceptionKey()}
      >
        {renderSlide}
      </Transition>
      <div class="header-tools">
        <HeaderActions
          chatId={props.chatId}
          threadId={props.threadId}
          messageListType={props.messageListType}
          isMobile={props.isMobile}
        />
      </div>
    </div>
  );
};

const mapStateToProps = (
  global: GlobalState,
  { chatId, threadId, messageListType, isMobile }: OwnProps,
): Complete<StateProps> => {
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
