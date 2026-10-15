import {
  createEffect,
  createMemo,
  createMutationEffect,
  createSignal,
  currentOrPrev,
  onDestroy,
  previous,
  requestMeasure,
  requestMutation,
  requestNextMutation,
  untrack,
} from 'frameact';
import { Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';
import { unwrap } from 'frameact/store';
import { forceMeasure } from 'frameact/stricterdom';
import { getActions, getGlobal, withGlobal } from '../../global';

import type {
  ApiAttachment,
  ApiAttachMenuPeerType,
  ApiAvailableEffect,
  ApiAvailableReaction,
  ApiBotCommand,
  ApiBotInlineMediaResult,
  ApiBotInlineResult,
  ApiBotMenuButton,
  ApiChat,
  ApiChatFullInfo,
  ApiDisallowedGifts,
  ApiDraft,
  ApiFormattedText,
  ApiInputRichMessage,
  ApiMessage,
  ApiMessageEntity,
  ApiNewMediaTodo,
  ApiPeer,
  ApiQuickReply,
  ApiReaction,
  ApiStealthMode,
  ApiSticker,
  ApiTopic,
  ApiUser,
  ApiVideo,
  ApiWebPage,
} from '../../api/types';
import type { GlobalState, TabState } from '../../global/types';
import type {
  EditingDraft,
  IAnchorPosition,
  InlineBotSettings,
  MessageList,
  MessageListType,
  ThemeKey,
  ThreadId,
} from '../../types';
import type { RichEditorTooltipsConfig } from './tooltips/types';
import { ApiMediaFormat, ApiMessageEntityTypes, MAIN_THREAD_ID } from '../../api/types';

import {
  BASE_EMOJI_KEYWORD_LANG,
  HEART_REACTION,
  MAX_UPLOAD_FILEPART_SIZE,
  MIN_ROUND_VIDEO_RECORDING_TIME,
  ONE_TIME_MEDIA_TTL_SECONDS,
  ROUND_VIDEO_RECORDING_SIZE,
  SCHEDULED_WHEN_ONLINE,
  SEND_MESSAGE_ACTION_INTERVAL,
  SERVICE_NOTIFICATIONS_USER_ID,
  STARS_CURRENCY_CODE,
  VIDEO_RECORDING_FILENAME,
} from '../../config';
import { createShowTransition } from '../../lib/kit';
import {
  canEditMedia,
  getAllowedAttachmentOptions,
  getMainUsername,
  getMediaFilename,
  getMediaHash,
  getMessageDocumentPhoto,
  getMessagePhoto,
  getReactionKey,
  getStoryKey,
  hasMessageMedia,
  isChatAdmin,
  isChatChannel,
  isChatPublic,
  isChatSuperGroup,
  isSameReaction,
  isSystemBot,
  isUserRightBanned,
} from '../../global/helpers';
import { getChatNotifySettings } from '../../global/helpers/notifications';
import { getPeerTitle } from '../../global/helpers/peers';
import { getRichMessageUsage } from '../../global/helpers/richMessage';
import { containsCustomEmoji, stripCustomEmoji } from '../../global/helpers/symbols';
import {
  selectBot,
  selectCanManageAutoDelete,
  selectCanPlayAnimatedEmojis,
  selectCanScheduleUntilOnline,
  selectCanSendMoneyToUser,
  selectChat,
  selectChatFullInfo,
  selectChatHistoryTtl,
  selectChatMessage,
  selectChatMessageOrEphemeral,
  selectChatType,
  selectCurrentMessageList,
  selectCustomEmoji,
  selectEditingMessage,
  selectEphemeralMessage,
  selectIsChatWithSelf,
  selectIsCurrentUserFrozen,
  selectIsCurrentUserPremium,
  selectIsInSelectMode,
  selectIsPremiumPurchaseBlocked,
  selectIsReactionPickerOpen,
  selectIsRightColumnShown,
  selectNewestMessageWithBotKeyboardButtons,
  selectNotifyDefaults,
  selectNotifyException,
  selectPeer,
  selectPeerPaidMessagesStars,
  selectPeerStory,
  selectPerformanceSettingsValue,
  selectRequestedDraft,
  selectRequestedDraftFiles,
  selectStoppableTypingDraftId,
  selectTabState,
  selectTheme,
  selectTopicFromMessage,
  selectUser,
  selectUserFullInfo,
  selectWebPage,
} from '../../global/selectors';
import { selectCurrentLimit } from '../../global/selectors/limits';
import { selectSharedSettings } from '../../global/selectors/sharedState';
import {
  selectDraft,
  selectEditingDraft,
  selectEditingScheduledDraft,
  selectNoWebPage,
} from '../../global/selectors/threads';
import {
  IS_IOS,
  IS_VIDEO_RECORDING_SUPPORTED,
  IS_VOICE_RECORDING_SUPPORTED,
} from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';
import captureEscKeyListener from '../../util/captureEscKeyListener';
import { formatCountdown, formatMediaDuration } from '../../util/dates/oldDateFormat';
import { processDeepLink } from '../../util/deeplink';
import { tryParseDeepLink } from '../../util/deepLinkParser';
import { depsOf } from '../../util/effectDeps';
import calcTextLineHeightAndCount from '../../util/element/calcTextLineHeightAndCount';
import { isUserId } from '../../util/entities/ids';
import { fetchBlob } from '../../util/files';
import focusEditableElement from '../../util/focusEditableElement';
import { formatStarsAsIcon } from '../../util/localization/format';
import { fetch } from '../../util/mediaLoader';
import { MEMO_EMPTY_ARRAY } from '../../util/memo';
import { getServerTime } from '../../util/serverTime';
import stopEvent from '../../util/stopEvent';
import { getUtf8Length } from '../../util/textFormat';
import { EMPTY_RICH_MEDIA_CAPTION } from '../../util/tiptap/richMedia';
import applyIosAutoCapitalizationFix from '../middle/composer/helpers/applyIosAutoCapitalizationFix';
import buildAttachment, {
  buildGifAttachment,
  prepareAttachment,
  prepareAttachmentsToSend,
} from '../middle/composer/helpers/buildAttachment';
import { parseCheckList } from '../middle/composer/helpers/parseCheckList';
import { armSendCollapseReserve } from '../middle/helpers/messageListReserves';
import {
  buildRichMessageFromFormatted,
  getRichInputAsFormatted,
  isValidInputRichMessage,
} from '../ui/textInput/richText';
import renderText from './helpers/renderText';
import { hasActiveRichEditorTooltip } from './tooltips/helpers';

import useInterval from '../../hooks/schedulers/useInterval';
import useTimeout from '../../hooks/schedulers/useTimeout';
import useContextMenuHandlers from '../../hooks/useContextMenuHandlers';
import useFlag from '../../hooks/useFlag';
import useLang from '../../hooks/useLang';
import useOldLang from '../../hooks/useOldLang';
import usePeerColor from '../../hooks/usePeerColor';
import useResizeObserver from '../../hooks/useResizeObserver';
import useSchedule from '../../hooks/useSchedule';
import useSendMessageAction from '../../hooks/useSendMessageAction';
import useWindowSize from '../../hooks/window/useWindowSize';
import useAttachmentModal from '../middle/composer/hooks/useAttachmentModal';
import useClipboardPaste from '../middle/composer/hooks/useClipboardPaste';
import useDraft, { type ComposerScope } from '../middle/composer/hooks/useDraft';
import useEditing from '../middle/composer/hooks/useEditing';
import useLoadLinkPreview from '../middle/composer/hooks/useLoadLinkPreview';
import usePaidMessageConfirmation from '../middle/composer/hooks/usePaidMessageConfirmation';
import useRichEditor from '../middle/composer/hooks/useRichEditor';
import useRichMedia from '../middle/composer/hooks/useRichMedia';
import useVideoRecording from '../middle/composer/hooks/useVideoRecording';
import useVoiceRecording from '../middle/composer/hooks/useVoiceRecording';

import AttachmentModal from '../middle/composer/AttachmentModal.async';
import AttachMenu from '../middle/composer/AttachMenu';
import BotCommandMenu from '../middle/composer/BotCommandMenu.async';
import BotKeyboardMenu from '../middle/composer/BotKeyboardMenu';
import BotMenuButton from '../middle/composer/BotMenuButton';
import ComposerEmbeddedMessage from '../middle/composer/ComposerEmbeddedMessage';
import CustomSendMenu from '../middle/composer/CustomSendMenu.async';
import DropArea, { DropAreaState } from '../middle/composer/DropArea.async';
import MessageInput from '../middle/composer/MessageInput.async';
import RecordModeMenu, { type RecordMode } from '../middle/composer/RecordModeMenu';
import RoundVideoRecorder from '../middle/composer/RoundVideoRecorder';
import SendAsMenu from '../middle/composer/SendAsMenu.async';
import SymbolMenuButton from '../middle/composer/SymbolMenuButton';
import ToDoListModal from '../middle/composer/ToDoListModal.async';
import VoiceRecordBar from '../middle/composer/VoiceRecordBar';
import WebPagePreview from '../middle/composer/WebPagePreview';
import MessageEffect from '../middle/message/MessageEffect';
import ReactionSelector from '../middle/message/reactions/ReactionSelector';
import Button from '../ui/Button';
import MediaEditor from '../ui/mediaEditor/MediaEditor.async';
import ResponsiveHoverButton from '../ui/ResponsiveHoverButton';
import Spinner from '../ui/Spinner';
import TextTimer from '../ui/TextTimer';
import Transition from '../ui/Transition';
import AnimatedCounter from './AnimatedCounter';
import Avatar from './Avatar';
import AutoDeleteOutlinedIcon from './icons/AutoDeleteOutlinedIcon';
import Icon from './icons/Icon';
import PaymentMessageConfirmDialog from './PaymentMessageConfirmDialog';
import ReactionAnimatedEmoji from './reactions/ReactionAnimatedEmoji';
import RemoveFormattingModal from './RemoveFormattingModal';

import './Composer.scss';

type ComposerType = 'messageList' | 'story';

type OwnProps = {
  type: ComposerType;
  chatId: string;
  threadId: ThreadId;
  storyId?: number;
  messageListType: MessageListType;
  dropAreaState?: string;
  isReady: boolean;
  isMobile?: boolean;
  inputId: string;
  editableInputCssSelector: string;
  editableInputId: string;
  className?: string;
  inputPlaceholder?: JSX.Element | string;
  onDropHide?: NoneToVoidFunction;
  onForward?: NoneToVoidFunction;
  onFocus?: NoneToVoidFunction;
  onBlur?: NoneToVoidFunction;
};

type StateProps = {
  stoppableTypingDraftId?: string;
  isOnActiveTab: boolean;
  recordMode: RecordMode;
  editingMessage?: ApiMessage;
  chat?: ApiChat;
  user?: ApiUser;
  chatFullInfo?: ApiChatFullInfo;
  draft?: ApiDraft;
  replyToTopic?: ApiTopic;
  currentMessageList?: MessageList;
  isChatWithBot?: boolean;
  isChatWithSelf?: boolean;
  canSendMoney?: boolean;
  isChannel?: boolean;
  isForCurrentMessageList: boolean;
  isRightColumnShown?: boolean;
  isSelectModeActive?: boolean;
  isReactionPickerOpen?: boolean;
  shouldDisplayGiftsButton?: boolean;
  isForwarding?: boolean;
  isReplying?: boolean;
  hasSuggestedPost?: boolean;
  forwardedMessagesCount?: number;
  todoListModal: TabState['todoListModal'];
  aiMessageEditorPendingResult: TabState['aiMessageEditorPendingResult'];
  botKeyboardMessageId?: number;
  botKeyboardPlaceholder?: string;
  withScheduledButton?: boolean;
  autoDeletePeriod?: number;
  isInScheduledList?: boolean;
  canScheduleUntilOnline?: boolean;
  currentUserId?: string;
  currentUser?: ApiUser;
  recentEmojis: string[];
  contentToBeScheduled?: TabState['contentToBeScheduled'];
  shouldSuggestStickers?: boolean;
  shouldSuggestCustomEmoji?: boolean;
  baseEmojiKeywords?: Record<string, string[]>;
  emojiKeywords?: Record<string, string[]>;
  topInlineBotIds?: string[];
  topGuestBotIds?: string[];
  isInlineBotLoading: boolean;
  inlineBots?: Record<string, false | InlineBotSettings>;
  botCommands?: ApiBotCommand[] | false;
  botMenuButton?: ApiBotMenuButton;
  sendAsPeer?: ApiPeer;
  sendAsId?: string;
  editingDraft?: EditingDraft;
  requestedDraft?: ApiFormattedText;
  requestedDraftFiles?: File[];
  requestedRichInputMedia?: TabState['requestedRichInputMedia'];
  attachBots: GlobalState['attachMenu']['bots'];
  attachMenuPeerType?: ApiAttachMenuPeerType;
  theme: ThemeKey;
  fileSizeLimit: number;
  captionLimit: number;
  isCurrentUserPremium?: boolean;
  canSendVoiceByPrivacy?: boolean;
  attachmentSettings: GlobalState['attachmentSettings'];
  slowMode?: ApiChatFullInfo['slowMode'];
  shouldUpdateStickerSetOrder?: boolean;
  availableReactions?: ApiAvailableReaction[];
  topReactions?: ApiReaction[];
  canPlayAnimatedEmojis?: boolean;
  canBuyPremium?: boolean;
  shouldCollectDebugLogs?: boolean;
  sentStoryReaction?: ApiReaction;
  stealthMode?: ApiStealthMode;
  canSendOneTimeMedia?: boolean;
  quickReplyMessages?: Record<number, ApiMessage>;
  quickReplies?: Record<number, ApiQuickReply>;
  canSendQuickReplies?: boolean;
  webPagePreview?: ApiWebPage;
  noWebPage?: boolean;
  isContactRequirePremium?: boolean;
  paidMessagesStars?: number;
  effect?: ApiAvailableEffect;
  effectReactions?: ApiReaction[];
  areEffectsSupported?: boolean;
  canPlayEffect?: boolean;
  shouldPlayEffect?: boolean;
  maxMessageLength: number;
  richMessageLengthLimit: number;
  richMessageMaxBlocks: number;
  richMessageMaxDepth: number;
  richMessageMaxMedia: number;
  richMessageMaxTableColumns: number;
  shouldPaidMessageAutoApprove?: boolean;
  isSilentPosting?: boolean;
  paymentMessageConfirmDialogKey?: string;
  starsBalance: number;
  isStarsBalanceModalOpen: boolean;
  disallowedGifts?: ApiDisallowedGifts;
  isAccountFrozen?: boolean;
  isAppConfigLoaded?: boolean;
  insertingPeerIdMention?: string;
  isRichInputExpanded?: boolean;
  mediaEditorMessage?: ApiMessage;
};

enum MainButtonState {
  Stop = 'stop',
  Send = 'send',
  Record = 'record',
  Edit = 'edit',
  Schedule = 'schedule',
  Forward = 'forward',
  SendOneTime = 'sendOneTime',
}

type ConvertedCheckListSource = {
  chatId: string;
  threadId: ThreadId;
};

type ScheduledMessageArgs =
  | TabState['contentToBeScheduled']
  | {
      id: string;
      queryId: string;
      isSilent?: boolean;
    };

const VOICE_RECORDING_FILENAME = 'wonderful-voice-message.ogg';
const CAN_SWITCH_RECORD_MODE = IS_VOICE_RECORDING_SUPPORTED && IS_VIDEO_RECORDING_SUPPORTED;
// When voice recording is active, composer placeholder will hide to prevent overlapping
const SCREEN_WIDTH_TO_HIDE_PLACEHOLDER = 600; // px

const MOBILE_KEYBOARD_HIDE_DELAY_MS = 100;
const SELECT_MODE_TRANSITION_MS = 200;
const SENDING_ANIMATION_DURATION = 350;
const MOUNT_ANIMATION_DURATION = 430;
const PAID_STARS_CLOSE_DURATION = 300;
const APPROXIMATE_RICH_INPUT_FORMAT_OPTIONS = { isApproximate: true };
const MIN_COMPOSER_LINES = 3;
const MAX_TRACKED_RECORD_DEPTH = 4;

// Original helper (not in telegram-tt). An id-less record of the tab state (`aiMessageEditorPendingResult`,
// `contentToBeScheduled`, `requestedRichInputMedia`) is the store's own copy, merged key by key: the prop keeps its
// identity when a new request replaces the previous one, and a change inside it does not change the prop. tt's effects
// ran on each new object; a computation calls this to subscribe to every field (and to the id-less records under it)
// and then reads the committed global (`getGlobal()`, tt's immutable objects) for the identity.
function trackRecord(value: unknown, depth = MAX_TRACKED_RECORD_DEPTH) {
  if (depth <= 0 || !value || typeof value !== 'object' || Array.isArray(value) || 'id' in value) return;
  Object.keys(value).forEach((key) => {
    trackRecord((value as AnyLiteral)[key], depth - 1);
  });
}

const Composer = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const {
    sendMessage,
    stopTypingDraft,
    clearDraft,
    showDialog,
    openTodoListModal,
    closeTodoListModal,
    clearAiMessageEditorPendingResult,
    loadScheduledHistory,
    openThread,
    addRecentEmoji,
    sendInlineBotResult,
    loadSendAs,
    resetOpenChatWithDraft,
    resetRichInputMediaRequest,
    callAttachBot,
    addRecentCustomEmoji,
    showNotification,
    showAllowedMessageTypesNotification,
    openStoryReactionPicker,
    openGiftModal,
    openAutoDeleteTimerModal,
    closeReactionPicker,
    sendStoryReaction,
    editMessage,
    updateAttachmentSettings,
    saveEffectInDraft,
    setReactionEffect,
    hideEffectInComposer,
    updateChatSilentPosting,
    updateInsertingPeerIdMention,
    updateDraftSuggestedPostInfo,
    updateShouldSaveAttachmentsCompression,
    applyDefaultAttachmentsCompression,
    setIsRichInputExpanded,
    setSettingOption,
    openPremiumModal,
    openAiMessageEditorModal,
  } = getActions();

  const oldLang = useOldLang();
  const lang = useLang();
  const isEditingMedia = createMemo(() => Boolean(props.editingMessage && hasMessageMedia(props.editingMessage)));

  let inputRef: HTMLDivElement | undefined;
  let composerRef!: HTMLDivElement;

  let storyReactionRef: HTMLButtonElement | undefined;

  const [isMounted, setIsMounted] = createSignal(false);
  let lastMessageSendTimeSecondsRef: number | undefined;
  const prevDropAreaState = previous(() => props.dropAreaState);
  // Deviation: tt read `windowSize.get()` on each render; the width is a signal here (`useWindowSize`), so the
  // placeholder and the rich-input button follow a resize.
  const windowSizeState = useWindowSize();
  const windowWidth = () => windowSizeState().width;
  // Deviation: tt re-rendered with `useForceUpdate` when a placeholder timer ended; the placeholder memo reads this tick.
  const [placeholderTick, setPlaceholderTick] = createSignal(0);
  const forceUpdate = () => setPlaceholderTick((tick) => tick + 1);

  const isInMessageList = createMemo(() => props.type === 'messageList');
  const isRichInputExpansionActive = createMemo(() => Boolean(isInMessageList() && props.isRichInputExpanded));
  const isInStoryViewer = createMemo(() => props.type === 'story');
  const sendAsPeerIds = createMemo(() => (isInMessageList() ? props.chat?.sendAsPeerIds : undefined));
  const canShowSendAs = createMemo(() => Boolean(sendAsPeerIds()?.length));
  // Prevent Symbol Menu from closing when calendar is open
  const [isSymbolMenuForced, forceShowSymbolMenu, cancelForceShowSymbolMenu] = useFlag();
  const sendMessageAction = useSendMessageAction(
    () => props.chatId,
    () => props.threadId,
  );
  const [isInputHasFocus, markInputHasFocus, unmarkInputHasFocus] = useFlag();
  const [isAttachMenuOpen, onAttachMenuOpen, onAttachMenuClose] = useFlag();
  const [isRemoveFormattingModalOpen, openRemoveFormattingModal, closeRemoveFormattingModal] = useFlag();
  let shouldFocusAfterFormattingRemovalRef = false;

  const canMediaBeReplaced = createMemo(() => isEditingMedia() && canEditMedia(props.editingMessage!));

  const isMonoforum = createMemo(() => props.chat?.isMonoforum);
  const chatFullInfoOrEmpty = createMemo(() => props.chatFullInfo || {});
  const emojiSet = () => chatFullInfoOrEmpty().emojiSet;
  const groupChatMembers = () => chatFullInfoOrEmpty().members;
  const chatBotCommands = () => chatFullInfoOrEmpty().botCommands;
  const chatEmojiSetId = createMemo(() => emojiSet()?.id);

  const isEphemeralReply = createMemo(() => props.draft?.replyInfo?.type === 'ephemeral');
  const canSchedule = createMemo(() => !props.paidMessagesStars && !isMonoforum() && !isEphemeralReply());

  const memoResult = createMemo(() =>
    getAllowedAttachmentOptions(
      props.chat,
      props.chatFullInfo,
      props.isChatWithBot,
      props.isChatWithSelf,
      isInStoryViewer(),
      props.paidMessagesStars,
      props.isInScheduledList,
      isEphemeralReply(),
    ),
  );
  const canSendStickers = () => memoResult().canSendStickers;
  const canSendGifs = () => memoResult().canSendGifs;
  const canAttachMedia = () => memoResult().canAttachMedia;
  const canAttachPolls = () => memoResult().canAttachPolls;
  const canAttachEmbedLinks = () => memoResult().canAttachEmbedLinks;
  const canAttachToDoLists = () => memoResult().canAttachToDoLists;
  const canSendVoices = () => memoResult().canSendVoices;
  const canSendRoundVideos = () => memoResult().canSendRoundVideos;
  const canSendPlainText = () => memoResult().canSendPlainText;
  const canSendAudios = () => memoResult().canSendAudios;
  const canSendVideos = () => memoResult().canSendVideos;
  const canSendPhotos = () => memoResult().canSendPhotos;
  const canSendDocuments = () => memoResult().canSendDocuments;

  const richEditor = useRichEditor(
    () => canSendPhotos() && !isEditingMedia(),
    () => canSendVideos() && !isEditingMedia(),
    () => canSendDocuments() && !isEditingMedia(),
    () => canSendAudios() && !isEditingMedia(),
  );

  const isSentStoryReactionHeart = createMemo(
    () => props.sentStoryReaction && isSameReaction(props.sentStoryReaction, HEART_REACTION),
  );

  let customEmojiNotificationNumberRef = 0;

  const [requestCalendar, calendar] = useSchedule(
    () => isInMessageList() && canSchedule() && props.canScheduleUntilOnline,
    cancelForceShowSymbolMenu,
  );
  const requestMessageSchedule = (callback: Parameters<typeof requestCalendar>[0]) => {
    if (isEphemeralReply()) return;

    requestCalendar(callback);
  };

  useTimeout(() => {
    setIsMounted(true);
  }, MOUNT_ANIMATION_DURATION);

  createEffect(
    depsOf(() => [isInMessageList(), props.storyId] as const),
    ([isInMessageList2, storyId2]) => {
      if (isInMessageList2) return;

      closeReactionPicker();
    },
  );

  createEffect(
    () => props.chatId,
    (chatId2) => {
      lastMessageSendTimeSecondsRef = undefined;
    },
  );

  createEffect(
    depsOf(
      () =>
        [
          props.isReady,
          props.chatId,
          props.threadId,
          isInStoryViewer(),
          props.isAppConfigLoaded,
          isMonoforum(),
        ] as const,
    ),
    ([isReady2, chatId2, threadId2, isInStoryViewer2, isAppConfigLoaded2, isMonoforum2]) => {
      if (isAppConfigLoaded2 && chatId2 && isReady2 && !isInStoryViewer2 && !isMonoforum2) {
        loadScheduledHistory({ chatId: chatId2 });
      }
    },
  );

  createEffect(
    depsOf(() => [props.chat, props.chatId, props.isChannel, props.isReady, loadSendAs, sendAsPeerIds()] as const),
    ([chat2, chatId2, isChannel2, isReady2, , sendAsPeerIds2]) => {
      const isChannelWithProfiles = isChannel2 && chat2?.areProfilesShown;
      const isChatWithSendAs =
        chat2 && isChatSuperGroup(chat2) && Boolean(isChatPublic(chat2) || chat2.isLinkedInDiscussion || chat2.hasGeo);
      if (!sendAsPeerIds2 && isReady2 && (isChatWithSendAs || isChannelWithProfiles)) {
        loadSendAs({ chatId: chatId2 });
      }
    },
  );

  // Deviation: tt's `useSyncEffect` computed the flag during the render; here an effect keeps it in a signal, at tick
  // end (before the frame that renders the button), from the previous `[chatId, sendAsPeerIds]`.
  const [shouldAnimateSendAsButtonRef, setShouldAnimateSendAsButton] = createSignal(false);
  createEffect(
    depsOf(() => [props.chatId, sendAsPeerIds()] as const),
    ([chatId2, sendAsPeerIds2], prev) => {
      const [prevChatId, prevSendAsPeerIds] = prev ?? [];
      // We only animate send-as button if `sendAsPeerIds` was missing when opening the chat
      setShouldAnimateSendAsButton(Boolean(chatId2 === prevChatId && sendAsPeerIds2 && !prevSendAsPeerIds));
    },
  );

  const [attachments, setAttachments] = createSignal<ApiAttachment[]>([]);
  // TODO(port): `useRichMedia` is a stub returning plain values; the real hook returns getters/accessors. The state
  // fields are read through the result object so that the call sites stay reactive when it lands.
  const richMediaResult = useRichMedia({
    richEditor,
    chat: () => props.chat,
    chatId: () => props.chatId,
    threadId: () => props.threadId,
    fileSizeLimit: () => props.fileSizeLimit,
    canSendPhotos: () => Boolean(canSendPhotos() && !isEditingMedia()),
    canSendVideos: () => Boolean(canSendVideos() && !isEditingMedia()),
    canSendDocuments: () => Boolean(canSendDocuments() && !isEditingMedia()),
    canSendAudios: () => Boolean(canSendAudios() && !isEditingMedia()),
    shouldSendInHighQuality: () => props.attachmentSettings.shouldSendInHighQuality,
  });
  const {
    handleFiles: handleRichMediaFiles,
    handleEditMedia: handleRichMediaEdit,
    handleCloseMediaEditor: handleCloseRichMediaEditor,
    handleSaveMediaEdit: handleSaveRichMediaEdit,
  } = richMediaResult;
  const editingRichMediaAttachment = () => richMediaResult.editingAttachment;
  const hasRichMediaBlocking = () => richMediaResult.hasBlockingMedia;
  const hasAttachments = createMemo(() => Boolean(attachments().length));
  const handleRichMediaSelect = (files: File[], shouldSendAsFile?: boolean) => {
    handleRichMediaFiles(files, undefined, undefined, shouldSendAsFile);
  };
  const richMessage = () => richEditor.value;
  const richMessageAsFormatted = createMemo(() => {
    const richMessage2 = richMessage();
    return richMessage2 ? getRichInputAsFormatted(richMessage2) : undefined;
  });
  // `isEmpty()` asks the editor and is not reactive: the value is read so that this re-runs on each document change
  // (tt re-rendered on each one).
  const hasInputContent = createMemo(() => {
    richMessage();
    return richEditor.isReady ? !richEditor.isEmpty() : false;
  });
  const isOverRegularMessageLimit = createMemo(() => {
    const formatted = richMessageAsFormatted();
    return Boolean(formatted && getUtf8Length(formatted.text) > props.maxMessageLength);
  });
  const hasRichOnlyContent = createMemo(() =>
    Boolean(
      hasInputContent() && (!richMessageAsFormatted() || (props.isCurrentUserPremium && isOverRegularMessageLimit())),
    ),
  );

  const expandRichInput = () => {
    setIsRichInputExpanded({ isRichInputExpanded: true });
  };

  const collapseRichInput = () => {
    if (hasRichMediaBlocking()) return;

    setIsRichInputExpanded({ isRichInputExpanded: undefined });
  };

  createEffect(
    depsOf(() => [isEditingMedia(), collapseRichInput, isRichInputExpansionActive()] as const),
    ([isEditingMedia2, collapseRichInput2, isRichInputExpansionActive2]) => {
      if (isEditingMedia2 && isRichInputExpansionActive2) {
        collapseRichInput2();
      }
    },
  );

  const handleRichInputEscape = () => {
    const editor = richEditor.editor;
    if (editor && hasActiveRichEditorTooltip(editor)) {
      return false;
    }

    collapseRichInput();
    return undefined;
  };

  const updateRichMessage = (value?: ApiInputRichMessage, shouldKeepHistory?: boolean) => {
    if (value && !props.isCurrentUserPremium && !props.isChatWithSelf) {
      const formattedValue = getRichInputAsFormatted(value);
      if (formattedValue && containsCustomEmoji(formattedValue)) {
        showCustomEmojiPremiumNotification();
        value = buildRichMessageFromFormatted(stripCustomEmoji(formattedValue));
      }
    }

    if (value && shouldKeepHistory) {
      richEditor.replaceValue(value);
    } else {
      richEditor.setValue(value);
    }
    return value;
  };

  const checkCanSendRichContent = () => {
    if (hasRichMediaBlocking()) {
      return false;
    }

    if (!isInMessageList() || props.isCurrentUserPremium) {
      return true;
    }

    const currentValue = richEditor.getValue();
    if (!currentValue.blocks.length || getRichInputAsFormatted(currentValue)) {
      return true;
    }

    const approximateValue = getRichInputAsFormatted(currentValue, APPROXIMATE_RICH_INPUT_FORMAT_OPTIONS);
    if (!isValidInputRichMessage(currentValue) || !approximateValue) {
      return true;
    }

    openRemoveFormattingModal();
    return false;
  };

  const handleCloseRemoveFormattingModal = () => {
    shouldFocusAfterFormattingRemovalRef = false;
    closeRemoveFormattingModal();
  };

  const handleRemoveFormatting = () => {
    const currentValue = richEditor.getValue();
    const formattedValue = getRichInputAsFormatted(currentValue, APPROXIMATE_RICH_INPUT_FORMAT_OPTIONS)!;
    richEditor.replaceValue(buildRichMessageFromFormatted(formattedValue));
    shouldFocusAfterFormattingRemovalRef = true;
    closeRemoveFormattingModal();
  };

  const handleSubscribeToPremium = () => {
    shouldFocusAfterFormattingRemovalRef = false;
    closeRemoveFormattingModal();
    openPremiumModal();
  };

  const handleRemoveFormattingModalCloseAnimationEnd = () => {
    if (!shouldFocusAfterFormattingRemovalRef) {
      return;
    }

    shouldFocusAfterFormattingRemovalRef = false;
    richEditor.focus();
  };

  createEffect(
    depsOf(() => [props.chatId, props.threadId, props.isCurrentUserPremium, handleCloseRemoveFormattingModal] as const),
    ([chatId2, threadId2, isCurrentUserPremium2]) => {
      handleCloseRemoveFormattingModal();
    },
  );

  createEffect(
    () => attachments(),
    (attachments2) => {
      if (!attachments2.length || !attachments2) {
        updateShouldSaveAttachmentsCompression({ shouldSave: false });
      }
    },
  );

  const canUseInlineBots = createMemo(
    () => !props.chat || isChatAdmin(props.chat) || !isUserRightBanned(props.chat, 'sendInline', props.chatFullInfo),
  );

  const isNeedPremium = createMemo(() => props.isContactRequirePremium && isInStoryViewer());
  const isSendTextBlocked = createMemo(() => isNeedPremium() || (Boolean(props.chat) && !canSendPlainText()));

  const messagesCount = createMemo(() => {
    if (hasAttachments()) return attachments().length;
    const messagesInInput = hasInputContent() ? 1 : 0;
    if (!props.isForwarding || !props.forwardedMessagesCount) return messagesInInput || 1;
    return props.forwardedMessagesCount + messagesInInput;
  });
  const paymentDialogKey = createMemo(
    () => `composer-${props.type}-${props.messageListType}-${props.chatId}-${props.threadId}-${props.storyId}`,
  );
  const starsForAllMessages = createMemo(() =>
    props.paidMessagesStars ? messagesCount() * props.paidMessagesStars : 0,
  );

  const {
    closeConfirmDialog: closeConfirmModalPayForMessage,
    dialogHandler: paymentMessageConfirmDialogHandler,
    shouldAutoApprove: shouldPaidMessageAutoApprove,
    setAutoApprove: setShouldPaidMessageAutoApprove,
    handleWithConfirmation: handleActionWithPaymentConfirmation,
  } = usePaidMessageConfirmation(
    paymentDialogKey,
    starsForAllMessages,
    () => props.isStarsBalanceModalOpen,
    () => props.starsBalance,
  );

  const isPaidSendDeferred = createMemo(() => starsForAllMessages() > 0 && !shouldPaidMessageAutoApprove());

  const hasWebPagePreview = createMemo(
    () =>
      !hasAttachments() && canAttachEmbedLinks() && !props.noWebPage && props.webPagePreview?.webpageType === 'full',
  );
  const isComposerBlocked = createMemo(() => isSendTextBlocked() && !props.editingMessage);

  createEffect(
    () => hasWebPagePreview(),
    (hasWebPagePreview2) => {
      if (!hasWebPagePreview2) {
        updateAttachmentSettings({ isInvertedMedia: undefined });
      }
    },
  );

  const insertTextAndUpdateCursor = (text: string) => {
    if (isComposerBlocked()) return;

    richEditor.insertContent({ type: 'text', text });
  };

  const insertFormattedTextAndUpdateCursor = (text: ApiFormattedText, shouldPrepend = false) => {
    if (isComposerBlocked()) return;

    if (!richEditor.isReady && shouldPrepend) {
      updateRichMessage(buildRichMessageFromFormatted(text));
      return;
    }

    if (!richEditor.isReady) {
      return;
    }

    richEditor.insertContent({ type: 'formattedText', text }, shouldPrepend);
  };

  const insertCustomEmojiAndUpdateCursor = (emoji: ApiSticker) => {
    if (isComposerBlocked()) return;

    richEditor.insertContent({ type: 'customEmoji', emoji });
  };

  // TODO(port): `useAttachmentModal` is a stub returning plain values; the real hook returns getters/accessors. The
  // state fields are read through the result object so that the call sites stay reactive when it lands.
  const attachmentModalResult = useAttachmentModal({
    attachments,
    setAttachments,
    fileSizeLimit: () => props.fileSizeLimit,
    chatId: () => props.chatId,
    canAttachFiles: () => !hasRichOnlyContent(),
    canSendAudios,
    canSendVideos,
    canSendPhotos,
    canSendDocuments,
    editedMessage: () => props.editingMessage,
    shouldSendInHighQuality: () => props.attachmentSettings.shouldSendInHighQuality,
  });
  const shouldForceCompression = () => attachmentModalResult.shouldForceCompression;
  const shouldForceAsFile = () => attachmentModalResult.shouldForceAsFile;
  const { handleAppendFiles, handleFileSelect, handleClearAttachments, handleSetAttachments } = attachmentModalResult;

  let mediaEditRequestRef: number | undefined;
  createEffect(
    depsOf(() => [props.mediaEditorMessage, handleSetAttachments] as const),
    ([mediaEditorMessage2, handleSetAttachments2]) => {
      if (!mediaEditorMessage2) return;
      syncComposerWithChat();
      const media = getMessagePhoto(mediaEditorMessage2) || getMessageDocumentPhoto(mediaEditorMessage2);
      if (!media) return;
      const mediaHash = getMediaHash(media, 'full');
      if (!mediaHash) return;
      const now = Date.now();
      mediaEditRequestRef = now;
      fetch(mediaHash, ApiMediaFormat.BlobUrl).then(async (blobUrl) => {
        if (mediaEditRequestRef !== now) return;
        const blob = await fetchBlob(blobUrl);
        const attachment = await buildAttachment(getMediaFilename(media), blob);
        handleSetAttachments2([attachment]);
      });
    },
  );

  const [isBotKeyboardOpen, openBotKeyboard, closeBotKeyboard] = useFlag();
  const [isBotCommandMenuOpen, openBotCommandMenu, closeBotCommandMenu] = useFlag();
  const [isSymbolMenuOpen, openSymbolMenu, closeSymbolMenu] = useFlag();
  const [isSendAsMenuOpen, openSendAsMenu, closeSendAsMenu] = useFlag();
  const [isHoverDisabled, disableHover, enableHover] = useFlag();

  // TODO(port): `useVoiceRecording` / `useVideoRecording` are stubs returning plain values; the real hooks return
  // getters/accessors. The state fields are read through the result objects (accessors below) so that the call sites
  // stay reactive when they land; the functions are destructured as in tt.
  const voiceRecording = useVoiceRecording();
  const {
    startRecordingVoice,
    stopRecordingVoice,
    cancelRecordingVoice,
    pauseRecordingVoice,
    resumeRecordingVoice,
    toggleViewOnceEnabled,
    subscribeToRecordingPeaks,
    recordButtonRef: mainButtonRef,
    setIsViewOnceEnabled,
  } = voiceRecording;
  const activeVoiceRecording = () => voiceRecording.activeVoiceRecording;
  const isRecordingPaused = () => voiceRecording.isRecordingPaused;
  const isViewOnceEnabled = () => voiceRecording.isViewOnceEnabled;
  // The main button element: `mainButtonRef` is the stub's ref object (tt's `ElementRef`), kept in sync for the
  // recording hook; the context menu hooks read the element through an accessor.
  // TODO(port): the real `useVoiceRecording` returns a callback ref; pass it to the button then.
  let mainButtonEl: HTMLButtonElement | undefined;

  const videoRecording = useVideoRecording();
  const {
    startRecordingVideo,
    stopRecordingVideo,
    finishRecordingVideo,
    discardRecordingVideo,
    pauseRecordingVideo,
    resumeRecordingVideo,
    getProgress,
    subscribeToVideoRecordingPeaks,
  } = videoRecording;
  const activeVideoRecording = () => videoRecording.activeVideoRecording;
  const previewStream = () => videoRecording.previewStream;
  const isVideoRecordingStarting = () => videoRecording.isVideoRecordingStarting;
  const isVideoRecordingReady = () => videoRecording.isVideoRecordingReady;
  const isVideoRecordingPaused = () => videoRecording.isVideoRecordingPaused;
  const isRecordingFinished = () => videoRecording.isRecordingFinished;

  const activeRecording = createMemo(() => activeVoiceRecording() || activeVideoRecording());
  const [isEmbeddedMessageOpen, setIsEmbeddedMessageOpen] = createSignal(false);

  createEffect(
    depsOf(() => [activeRecording(), props.editableInputId] as const),
    ([activeRecording2, editableInputId2]) => {
      if (!activeRecording2) return;
      const input = document.getElementById(editableInputId2);
      if (input && document.activeElement === input) {
        input.blur();
      }
    },
  );

  const shouldSendRecordingStatus = createMemo(() => props.isForCurrentMessageList && !isInStoryViewer());
  useInterval(
    () => {
      sendMessageAction({ type: 'recordAudio' });
    },
    () => (shouldSendRecordingStatus() ? activeVoiceRecording() && SEND_MESSAGE_ACTION_INTERVAL : undefined),
  );
  useInterval(
    () => {
      sendMessageAction({ type: 'recordRound' });
    },
    () => (shouldSendRecordingStatus() ? activeVideoRecording() && SEND_MESSAGE_ACTION_INTERVAL : undefined),
  );

  createEffect(
    depsOf(
      () =>
        [
          activeVoiceRecording(),
          activeVideoRecording(),
          props.isForCurrentMessageList,
          isInStoryViewer(),
          sendMessageAction,
          // Deviation: tt's `sendMessageAction` was re-created per chat and thread, which re-ran this effect on every
          // chat switch (the cancel of the new chat); here it is one stable function.
          props.chatId,
          props.threadId,
        ] as const,
    ),
    ([activeVoiceRecording2, activeVideoRecording2, isForCurrentMessageList2, isInStoryViewer2]) => {
      if (!isForCurrentMessageList2 || isInStoryViewer2) return;
      if (!activeVoiceRecording2 && !activeVideoRecording2) {
        sendMessageAction({ type: 'cancel' });
      }
    },
  );

  createEffect(
    depsOf(() => [props.chatId, props.threadId, discardRecordingVideo] as const),
    ([chatId2, threadId2]) => {
      return () => {
        discardRecordingVideo();
      };
    },
  );

  const canSendTyping = createMemo(
    () =>
      props.isForCurrentMessageList &&
      !isInStoryViewer() &&
      !isRichInputExpansionActive() &&
      !hasRichOnlyContent() &&
      hasInputContent() &&
      !props.editingMessage,
  );
  createEffect(
    depsOf(() => [richMessage(), canSendTyping(), sendMessageAction] as const),
    ([richMessage2, canSendTyping2], prev) => {
      const [prevRichMessage] = prev ?? [];
      if (canSendTyping2 && richMessage2 !== prevRichMessage) {
        sendMessageAction({ type: 'typing' });
      }
    },
  );

  const isAdmin = createMemo(() => props.chat && isChatAdmin(props.chat));
  const [inlineBotHelp, setInlineBotHelp] = createSignal<string | undefined>(undefined);

  const insertMention = (peer: ApiPeer, forceFocus = false) => {
    const username = getMainUsername(peer);
    const text = username ? `@${username}` : getPeerTitle(lang, peer);
    if (!text) {
      return;
    }

    if (forceFocus) {
      richEditor.focus();
    }
    richEditor.insertContent([
      {
        type: 'mention',
        userId: peer.id,
        username,
        text,
      },
      { type: 'text', text: ' ' },
    ]);
  };

  createEffect(
    depsOf(() => [props.insertingPeerIdMention, insertMention] as const),
    ([insertingPeerIdMention2]) => {
      if (!insertingPeerIdMention2) return;
      syncComposerWithChat();
      const peer = selectPeer(getGlobal(), insertingPeerIdMention2);
      if (peer) {
        insertMention(peer, true);
      }
      updateInsertingPeerIdMention({ peerId: undefined });
    },
  );

  let aiMessageToSendRef: ApiInputRichMessage | undefined;
  // Deviation: the store keeps its own copy of this id-less record (see `trackRecord`): the effects key on the committed
  // (tt's) object, a new one per result, and subscribe to the fields of the record.
  const aiMessageEditorPendingResult = () => {
    trackRecord(props.aiMessageEditorPendingResult);
    return selectTabState(getGlobal()).aiMessageEditorPendingResult;
  };
  createEffect(
    depsOf(() => [isInMessageList(), aiMessageEditorPendingResult(), props.chatId, props.threadId] as const),
    ([isInMessageList2, aiMessageEditorPendingResult2, chatId2, threadId2]) => {
      if (!isInMessageList2 || !aiMessageEditorPendingResult2) return;

      const {
        content,
        shouldSendWithAttachments,
        shouldSend,
        chatId: resultChatId,
        threadId: resultThreadId,
      } = aiMessageEditorPendingResult2;

      if (shouldSendWithAttachments) return;
      if (resultChatId !== chatId2 || resultThreadId !== threadId2) return;

      syncComposerWithChat();
      aiMessageToSendRef = updateRichMessage(
        content.type === 'rich' ? content.richMessage : buildRichMessageFromFormatted(content.text),
        true,
      );

      if (!shouldSend) clearAiMessageEditorPendingResult();
    },
  );

  const hasQuickReplies = createMemo(() => Boolean(props.quickReplies && Object.keys(props.quickReplies).length));

  const isDraftDisabled = () =>
    Boolean(isInStoryViewer() || props.requestedDraft || (!props.hasSuggestedPost && isMonoforum()));

  // The chat the content of the input belongs to (see `syncComposerWithChat`)
  let composerScope: ComposerScope = {
    chatId: props.chatId,
    threadId: props.threadId,
    type: props.messageListType,
    isEditing: Boolean(props.editingMessage),
    isDisabled: untrack(isDraftDisabled),
  };

  // Deviation: the store merges an updated draft into its own copy, which keeps its identity (see `trackRecord`), while
  // tt's effects ran on each new draft object, e.g. the one a phone sent while this chat is open: the committed global
  // gives that identity.
  const getCommittedDraft = () => {
    trackRecord(props.draft);
    return props.draft ? selectDraft(getGlobal(), props.chatId, props.threadId) : undefined;
  };

  const { saveFor: saveDraftFor, restoreFor: restoreDraftFor } = useDraft({
    draft: getCommittedDraft,
    chatId: () => props.chatId,
    threadId: () => props.threadId,
    richMessage,
    replaceRichMessage: updateRichMessage,
    editedMessage: () => props.editingMessage,
    isDisabled: isDraftDisabled,
    hasUnresolvedMedia: () => hasRichMediaBlocking(),
    getScope: () => composerScope,
    syncChat: () => syncComposerWithChat(),
  });

  useLoadLinkPreview({
    chatId: () => props.chatId,
    threadId: () => props.threadId,
    richMessage,
  });

  const resetComposer = (shouldPreserveInput = false, shouldSkipCollapseLatch = false) => {
    if (!shouldPreserveInput) {
      if (!shouldSkipCollapseLatch) {
        const footer = inputRef?.closest<HTMLElement>('.middle-column-footer');
        const scroller = footer?.parentElement?.querySelector<HTMLElement>(':scope > .MessageList');
        if (scroller) {
          armSendCollapseReserve(scroller);
        }
      }

      updateRichMessage(undefined);
    }

    setAttachments(MEMO_EMPTY_ARRAY);
    collapseRichInput();

    if (props.isMobile) {
      // @optimization
      setTimeout(() => closeSymbolMenu(), SENDING_ANIMATION_DURATION);
    } else {
      closeSymbolMenu();
    }
  };

  const validateTextLength = (text: string, isAttachmentModal?: boolean) => {
    const maxLength = isAttachmentModal ? props.captionLimit : props.maxMessageLength;
    const textLength = getUtf8Length(text);
    if (textLength > maxLength) {
      const extraLength = textLength - maxLength;
      showNotification({
        message: {
          key: 'ErrorMessageTooLong',
          variables: {
            count: extraLength,
          },
          options: {
            pluralValue: extraLength,
          },
        },
      });

      return false;
    }
    return true;
  };

  const validateRichMessageLimits = (value: ApiInputRichMessage) => {
    const usage = getRichMessageUsage(value);

    if (usage.textLength > props.richMessageLengthLimit) {
      const extraLength = usage.textLength - props.richMessageLengthLimit;
      showNotification({
        message: {
          key: 'ErrorMessageTooLong',
          variables: { count: extraLength },
          options: { pluralValue: extraLength },
        },
      });
      return false;
    }

    if (usage.blockCount > props.richMessageMaxBlocks) {
      const extraCount = usage.blockCount - props.richMessageMaxBlocks;
      showNotification({
        message: {
          key: 'ErrorRichMessageTooManyBlocks',
          variables: { count: extraCount },
          options: { pluralValue: extraCount },
        },
      });
      return false;
    }

    if (usage.maxDepth > props.richMessageMaxDepth) {
      showNotification({
        message: {
          key: 'ErrorRichMessageTooDeep',
          variables: { count: props.richMessageMaxDepth },
        },
      });
      return false;
    }

    if (usage.mediaCount > props.richMessageMaxMedia) {
      const extraCount = usage.mediaCount - props.richMessageMaxMedia;
      showNotification({
        message: {
          key: 'ErrorRichMessageTooManyMedia',
          variables: { count: extraCount },
          options: { pluralValue: extraCount },
        },
      });
      return false;
    }

    if (usage.maxTableColumnCount > props.richMessageMaxTableColumns) {
      showNotification({
        message: {
          key: 'ErrorRichMessageTableTooWide',
          variables: { count: props.richMessageMaxTableColumns },
        },
      });
      return false;
    }

    return true;
  };

  const [handleEditComplete, handleEditCancel, shouldForceShowEditing, saveEditingDraftFor] = useEditing(
    richMessage,
    updateRichMessage,
    () => props.editingMessage,
    resetComposer,
    validateTextLength,
    () => props.chatId,
    () => props.threadId,
    () => props.messageListType,
    () => props.draft,
    () => props.editingDraft,
    () => composerScope,
    () => syncComposerWithChat(),
  );

  // Handle chat change (should be placed after `useDraft` and `useEditing`)
  // Deviation: tt did it in the cleanup of a layout effect: every cleanup of a commit ran before every effect, so the
  // content of the chat being left was saved from the value of the last render, the input was reset, and only then
  // `useDraft` / `useEditing` restored the content of the new chat and the requested draft, AI result, mention and media
  // effects below inserted theirs. Here effects have no common commit: some of them are held back by a heavy animation
  // (store-dirtied frame effects park), the others are not, and none runs in creation order. So the chat change is one
  // function with a single owner that does the three steps in that order, synchronously: it saves the content of the chat
  // being left from a snapshot taken before anything touched it (under the chat the content belongs to, `composerScope`),
  // resets the input, and restores the draft of the new chat. It runs at the first of the effect below or an effect that
  // is about to write new content (they call it first), whichever comes first, and is a no-op once it has run.
  const syncComposerWithChat = () => {
    if (props.chatId === composerScope.chatId && props.threadId === composerScope.threadId) return;

    const leftScope = composerScope;
    const snapshot = untrack(richMessage);
    composerScope = {
      chatId: props.chatId,
      threadId: props.threadId,
      type: props.messageListType,
      isEditing: Boolean(props.editingMessage),
      isDisabled: isDraftDisabled(),
    };

    saveDraftFor(leftScope, snapshot);
    saveEditingDraftFor(leftScope, snapshot);
    cancelRecordingVoice();
    resetComposer(false, true);
    restoreDraftFor();
  };
  createEffect(
    depsOf(
      () =>
        [
          props.chatId,
          props.threadId,
          props.messageListType,
          Boolean(props.editingMessage),
          isDraftDisabled(),
        ] as const,
    ),
    ([, , messageListType, isEditing, isDisabled]) => {
      syncComposerWithChat();
      // Same chat: keep what the next chat change needs to know about this one
      composerScope.type = messageListType;
      composerScope.isEditing = isEditing;
      composerScope.isDisabled = isDisabled;
    },
  );
  onDestroy(() => {
    cancelRecordingVoice();
    resetComposer(false, true);
  });

  const areAllGiftsDisallowed = createMemo(() => {
    if (!props.disallowedGifts) {
      return undefined;
    }
    return Object.values(props.disallowedGifts).every(Boolean);
  });

  const shouldShowGiftButton = createMemo(() =>
    Boolean(!props.isChatWithSelf && props.shouldDisplayGiftsButton && !areAllGiftsDisallowed()),
  );
  const shouldShowSuggestedPostButton = createMemo(
    () =>
      isMonoforum() &&
      !props.editingMessage &&
      !props.isForwarding &&
      !props.isReplying &&
      !props.draft?.suggestedPostInfo,
  );

  const showCustomEmojiPremiumNotification = () => {
    const notificationNumber = customEmojiNotificationNumberRef;
    if (!notificationNumber) {
      showNotification({
        message: oldLang('UnlockPremiumEmojiHint'),
        action: {
          action: 'openPremiumModal',
          payload: { initialSection: 'animated_emoji' },
        },
        actionText: oldLang('PremiumMore'),
      });
    } else {
      showNotification({
        message: oldLang('UnlockPremiumEmojiHint2'),
        action: {
          action: 'openChat',
          payload: { id: props.currentUserId, shouldReplaceHistory: true },
        },
        actionText: oldLang('Open'),
      });
    }
    customEmojiNotificationNumberRef = Number(!notificationNumber);
  };

  const isStoryReactionPickerOpen = createMemo(() => isInStoryViewer() && Boolean(props.isReactionPickerOpen));
  const isComposerEngaged = createMemo(
    () =>
      isInputHasFocus() ||
      isSymbolMenuOpen() ||
      isSymbolMenuForced() ||
      isBotKeyboardOpen() ||
      isSendAsMenuOpen() ||
      isStoryReactionPickerOpen() ||
      Boolean(activeRecording()) ||
      attachments().length > 0,
  );
  const isComposerActive = createMemo(() => isComposerEngaged() || isAttachMenuOpen());

  const mainButtonState = createMemo(() => {
    if (!isComposerEngaged() && props.onForward && !(hasInputContent() && !hasAttachments())) {
      return MainButtonState.Forward;
    }

    if (props.editingMessage && shouldForceShowEditing()) {
      return MainButtonState.Edit;
    }

    if (
      isInMessageList() &&
      props.stoppableTypingDraftId &&
      !props.editingMessage &&
      !props.isInScheduledList &&
      !props.isForwarding &&
      !activeVoiceRecording() &&
      !activeVideoRecording()
    ) {
      return MainButtonState.Stop;
    }

    if (
      (IS_VOICE_RECORDING_SUPPORTED || IS_VIDEO_RECORDING_SUPPORTED) &&
      !activeVoiceRecording() &&
      !activeVideoRecording() &&
      !props.isForwarding &&
      !isRichInputExpansionActive() &&
      !(hasInputContent() && !hasAttachments())
    ) {
      return MainButtonState.Record;
    }

    if (props.isInScheduledList) {
      return MainButtonState.Schedule;
    }

    return MainButtonState.Send;
  });
  const canShowCustomSendMenu = createMemo(() => !props.isInScheduledList);

  const {
    isContextMenuOpen: isCustomSendMenuOpen,
    handleContextMenu,
    handleContextMenuClose,
    handleContextMenuHide,
  } = useContextMenuHandlers(
    () => mainButtonEl,
    () => !(mainButtonState() === MainButtonState.Send && canShowCustomSendMenu()),
  );

  const canSwitchRecordMode = createMemo(
    () => CAN_SWITCH_RECORD_MODE && props.canSendVoiceByPrivacy && canSendVoices() && canSendRoundVideos(),
  );

  const {
    isContextMenuOpen: isRecordModeMenuOpen,
    handleContextMenu: handleRecordModeContextMenu,
    handleContextMenuClose: handleRecordModeMenuClose,
    handleContextMenuHide: handleRecordModeMenuHide,
  } = useContextMenuHandlers(
    () => mainButtonEl,
    () => !(mainButtonState() === MainButtonState.Record && canSwitchRecordMode()),
  );

  const handleSelectRecordMode = (mode: RecordMode) => {
    setSettingOption({ lastRecordMessageMode: mode });
    handleRecordModeMenuClose();
  };

  const {
    contextMenuAnchor: storyReactionPickerAnchor,
    handleContextMenu: handleStoryPickerContextMenu,
    handleBeforeContextMenu: handleBeforeStoryPickerContextMenu,
    handleContextMenuHide: handleStoryPickerContextMenuHide,
  } = useContextMenuHandlers(
    () => storyReactionRef,
    () => !isInStoryViewer(),
  );

  createEffect(
    depsOf(() => [props.chatId, props.isReactionPickerOpen, props.storyId, storyReactionPickerAnchor()] as const),
    ([chatId2, isReactionPickerOpen2, storyId2, storyReactionPickerAnchor2]) => {
      if (isReactionPickerOpen2) return;

      if (storyReactionPickerAnchor2) {
        openStoryReactionPicker({
          peerId: chatId2,
          storyId: storyId2!,
          position: storyReactionPickerAnchor2,
        });
        handleStoryPickerContextMenuHide();
      }
    },
  );

  const peerColor = usePeerColor({
    peer: () => props.sendAsPeer || props.currentUser,
    theme: () => props.theme,
  });
  const peerColorClass = () => peerColor().className;
  const peerColorStyle = () => peerColor().style;

  const hasGifFromPicker = createMemo(() => attachments().some((a) => a.gif));

  const resolveFilePasteTarget = () => {
    if (isRichInputExpansionActive()) {
      return 'richMedia';
    }

    const currentRichMessage = richEditor.getValue();
    const hasUnrepresentableRichContent = Boolean(
      currentRichMessage.blocks.length && !getRichInputAsFormatted(currentRichMessage),
    );

    return hasUnrepresentableRichContent ? 'none' : 'attachmentModal';
  };
  const getRichMediaPastePosition = () => richEditor.editor?.state.selection.from;

  useClipboardPaste(
    () => Boolean(props.isForCurrentMessageList || isInStoryViewer()),
    insertFormattedTextAndUpdateCursor,
    handleSetAttachments,
    () => props.editingMessage,
    resolveFilePasteTarget,
    () => !attachments().length,
    hasGifFromPicker,
    handleRichMediaFiles,
    getRichMediaPastePosition,
  );

  // Deviation: `wasEditing` comes from the bar, which resets the editing id first. tt read `editingMessage` of the render
  // closure, which was still set; here the prop already follows the store.
  const handleEmbeddedClear = (wasEditing: boolean) => {
    if (hasRichMediaBlocking()) return;

    if (wasEditing) {
      handleEditCancel();
    }
  };

  const checkSlowMode = () => {
    if (props.slowMode && !isAdmin()) {
      const messageInput = document.querySelector<HTMLDivElement>(props.editableInputCssSelector);

      const nowSeconds = getServerTime();
      const secondsSinceLastMessage =
        lastMessageSendTimeSecondsRef && Math.floor(nowSeconds - lastMessageSendTimeSecondsRef);
      const nextSendDateNotReached = props.slowMode.nextSendDate && props.slowMode.nextSendDate > nowSeconds;

      if (
        (secondsSinceLastMessage !== undefined && secondsSinceLastMessage < props.slowMode.seconds) ||
        nextSendDateNotReached
      ) {
        const secondsRemaining = nextSendDateNotReached
          ? props.slowMode.nextSendDate! - nowSeconds
          : props.slowMode.seconds - secondsSinceLastMessage!;

        showDialog({
          data: {
            type: 'localized',
            text: {
              key: 'SlowModeHint',
              variables: {
                time: formatMediaDuration(secondsRemaining),
              },
            },
          },
        });

        messageInput?.blur();

        return false;
      }
    }
    return true;
  };

  const validateEphemeralReply = () => {
    if (
      props.draft?.replyInfo?.type === 'ephemeral' &&
      !selectEphemeralMessage(getGlobal(), props.chatId, props.draft.replyInfo.replyToMsgId)
    ) {
      showNotification({ message: { key: 'EphemeralReplyUnavailable' } });
      return false;
    }

    return true;
  };

  const canSendAttachments = (attachmentsToSend: ApiAttachment[]): boolean => {
    if (!props.currentMessageList && !props.storyId) {
      return false;
    }
    if (attachmentsToSend.some(({ isPreparing }) => isPreparing)) {
      return false;
    }

    const currentRichMessage = richEditor.getValue();
    const formattedRichMessage = currentRichMessage.blocks.length
      ? getRichInputAsFormatted(currentRichMessage)
      : undefined;
    if (currentRichMessage.blocks.length && !formattedRichMessage) {
      return false;
    }

    const { text } = formattedRichMessage || { text: '' };
    if (!text && !attachmentsToSend.length) {
      return false;
    }
    if (!validateTextLength(text, true)) return false;
    if (!checkSlowMode()) return false;

    return true;
  };

  const sendAttachments = ({
    attachments: attachmentsToSend,
    sendCompressed = props.attachmentSettings.shouldCompress,
    sendGrouped = props.attachmentSettings.shouldSendGrouped,
    isSilent,
    scheduledAt,
    scheduleRepeatPeriod,
    isInvertedMedia,
  }: {
    attachments: ApiAttachment[];
    sendCompressed?: boolean;
    sendGrouped?: boolean;
    isSilent?: boolean;
    scheduledAt?: number;
    scheduleRepeatPeriod?: number;
    isInvertedMedia?: true;
  }) => {
    if (!validateEphemeralReply()) return;

    if (!props.currentMessageList && !props.storyId) {
      return;
    }
    isSilent = isSilent || props.isSilentPosting;

    const currentRichMessage = richEditor.getValue();
    const formattedRichMessage = currentRichMessage.blocks.length
      ? getRichInputAsFormatted(currentRichMessage)
      : undefined;
    const { text, entities } = formattedRichMessage || { text: '' };

    isInvertedMedia = text && sendCompressed && sendGrouped ? isInvertedMedia : undefined;

    if (props.editingMessage) {
      editMessage({
        messageList: props.currentMessageList,
        text,
        entities,
        attachments: prepareAttachmentsToSend(attachmentsToSend, sendCompressed),
      });
    } else {
      sendMessage({
        messageList: props.currentMessageList,
        text,
        entities,
        scheduledAt,
        scheduleRepeatPeriod,
        isSilent,
        shouldUpdateStickerSetOrder: props.shouldUpdateStickerSetOrder,
        attachments: prepareAttachmentsToSend(attachmentsToSend, sendCompressed),
        shouldGroupMessages: sendGrouped,
        isInvertedMedia,
      });
    }

    lastMessageSendTimeSecondsRef = getServerTime();

    clearDraft({ chatId: props.chatId, threadId: props.threadId, isLocalOnly: true });

    const shouldSkipCollapseLatch = Boolean(props.editingMessage) || Boolean(scheduledAt && !props.isInScheduledList);

    // Wait until message animation starts
    requestMeasure(() => {
      resetComposer(false, shouldSkipCollapseLatch);
    });
  };

  const handleSendAttachmentsFromModal = (sendCompressed: boolean, sendGrouped: boolean, isInvertedMedia?: true) => {
    if (canSendAttachments(attachments())) {
      if (props.editingMessage) {
        sendAttachments({
          attachments: attachments(),
          sendCompressed,
          sendGrouped,
          isInvertedMedia,
        });
        return;
      }

      handleActionWithPaymentConfirmation(sendAttachments, {
        attachments: attachments(),
        sendCompressed,
        sendGrouped,
        isInvertedMedia,
      });
    }
  };

  const handleSendAttachments = (
    sendCompressed: boolean,
    sendGrouped: boolean,
    isSilent?: boolean,
    scheduledAt?: number,
    isInvertedMedia?: true,
    scheduleRepeatPeriod?: number,
  ) => {
    if (canSendAttachments(attachments())) {
      sendAttachments({
        attachments: attachments(),
        sendCompressed,
        sendGrouped,
        isSilent,
        scheduledAt,
        scheduleRepeatPeriod,
        isInvertedMedia,
      });
    }
  };

  const handleSendCore = (
    currentAttachments: ApiAttachment[],
    isSilent = false,
    scheduledAt?: number,
    scheduleRepeatPeriod?: number,
    shouldSkipWebPagePreview?: boolean,
  ) => {
    const richEditorValue = richEditor.getValue();
    const currentRichMessage = richEditorValue.blocks.length ? richEditorValue : undefined;
    const formattedRichMessage = currentRichMessage ? getRichInputAsFormatted(currentRichMessage) : undefined;
    const richMessageToSend = hasRichOnlyContent() ? currentRichMessage : undefined;
    const { text, entities } = richMessageToSend ? { text: '' } : formattedRichMessage || { text: '' };

    if (currentAttachments.length) {
      if (canSendAttachments(currentAttachments)) {
        sendAttachments({
          attachments: currentAttachments,
          scheduledAt,
          scheduleRepeatPeriod,
          isSilent,
        });
      }
      return;
    }

    if (richMessageToSend) {
      if (
        !props.currentMessageList ||
        !isValidInputRichMessage(richMessageToSend) ||
        !validateRichMessageLimits(richMessageToSend)
      ) {
        return;
      }
      if (!checkSlowMode()) return;

      const effectId = props.effect?.id;
      if (props.areEffectsSupported) {
        saveEffectInDraft({ chatId: props.chatId, threadId: props.threadId, effectId: undefined });
      }

      if (props.editingMessage) {
        editMessage({
          messageList: props.currentMessageList,
          text: '',
          richMessage: richMessageToSend,
        });
      } else {
        sendMessage({
          messageList: props.currentMessageList,
          richMessage: richMessageToSend,
          scheduledAt,
          scheduleRepeatPeriod,
          isSilent,
          shouldUpdateStickerSetOrder: props.shouldUpdateStickerSetOrder,
          effectId,
        });
      }

      lastMessageSendTimeSecondsRef = getServerTime();
      clearDraft({
        chatId: props.chatId,
        threadId: props.threadId,
        isLocalOnly: true,
        shouldKeepReply: props.isForwarding,
      });

      const shouldSkipCollapseLatch = Boolean(props.editingMessage) || Boolean(scheduledAt && !props.isInScheduledList);

      requestMeasure(() => {
        resetComposer(false, shouldSkipCollapseLatch);
      });
      return;
    }

    if (!text && !props.isForwarding) {
      return;
    }

    if (!validateTextLength(text)) return;

    const messageInput = document.querySelector<HTMLDivElement>(props.editableInputCssSelector);

    const effectId = props.effect?.id;

    if (text || props.isForwarding) {
      if (!checkSlowMode()) return;

      const shouldUseWebPagePreview = hasWebPagePreview() && !shouldSkipWebPagePreview;
      const isInvertedMedia = shouldUseWebPagePreview ? props.attachmentSettings.isInvertedMedia : undefined;

      if (props.areEffectsSupported) {
        saveEffectInDraft({ chatId: props.chatId, threadId: props.threadId, effectId: undefined });
      }

      sendMessage({
        messageList: props.currentMessageList,
        text,
        entities,
        scheduledAt,
        scheduleRepeatPeriod,
        isSilent,
        shouldUpdateStickerSetOrder: props.shouldUpdateStickerSetOrder,
        isInvertedMedia,
        effectId,
        webPageMediaSize: shouldSkipWebPagePreview ? undefined : props.attachmentSettings.webPageMediaSize,
        webPageUrl: shouldUseWebPagePreview ? props.webPagePreview!.url : undefined,
      });
    }

    lastMessageSendTimeSecondsRef = getServerTime();
    clearDraft({
      chatId: props.chatId,
      threadId: props.threadId,
      isLocalOnly: true,
      shouldKeepReply: props.isForwarding,
    });

    if (IS_IOS && messageInput && messageInput === document.activeElement) {
      applyIosAutoCapitalizationFix(messageInput);
    }

    // Wait until message animation starts
    requestMeasure(() => {
      resetComposer(false, Boolean(scheduledAt && !props.isInScheduledList));
    });
  };

  const handleSend = async (
    isSilent = false,
    scheduledAt?: number,
    scheduleRepeatPeriod?: number,
    shouldSkipWebPagePreview?: boolean,
  ) => {
    if (!validateEphemeralReply()) return;

    if (!props.currentMessageList && !props.storyId) {
      return;
    }

    isSilent = isSilent || Boolean(props.isSilentPosting);

    let currentAttachments = attachments();

    if (activeVoiceRecording()) {
      const record = await stopRecordingVoice();
      const ttlSeconds = isViewOnceEnabled() ? ONE_TIME_MEDIA_TTL_SECONDS : undefined;
      if (record) {
        const { blob, duration, waveform } = record;
        currentAttachments = [
          await buildAttachment(VOICE_RECORDING_FILENAME, blob, { voice: { duration, waveform }, ttlSeconds }),
        ];
      }
    }

    if (activeVideoRecording()) {
      const record = await stopRecordingVideo();
      const ttlSeconds = isViewOnceEnabled() ? ONE_TIME_MEDIA_TTL_SECONDS : undefined;
      if (record && record.durationMs >= MIN_ROUND_VIDEO_RECORDING_TIME) {
        const { blob, duration } = record;
        currentAttachments = [
          await prepareAttachment(
            await buildAttachment(VIDEO_RECORDING_FILENAME, blob, {
              isRoundVideo: true,
              ttlSeconds,
              quick: { width: ROUND_VIDEO_RECORDING_SIZE, height: ROUND_VIDEO_RECORDING_SIZE, duration },
            }),
          ),
        ];
      }
    }

    handleSendCore(currentAttachments, isSilent, scheduledAt, scheduleRepeatPeriod, shouldSkipWebPagePreview);
  };

  const handleSendWithConfirmation = (
    isSilent = false,
    scheduledAt?: number,
    scheduleRepeatPeriod?: number,
    shouldSkipWebPagePreview?: boolean,
  ) => {
    if (!checkCanSendRichContent()) {
      return;
    }

    handleActionWithPaymentConfirmation(
      handleSend,
      isSilent,
      scheduledAt,
      scheduleRepeatPeriod,
      shouldSkipWebPagePreview,
    );
  };

  createEffect(
    depsOf(
      () =>
        [
          isInMessageList(),
          aiMessageEditorPendingResult(),
          richMessage(),
          props.chatId,
          props.threadId,
          props.editingMessage,
          isComposerBlocked(),
        ] as const,
    ),
    ([
      isInMessageList2,
      aiMessageEditorPendingResult2,
      richMessage2,
      chatId2,
      threadId2,
      editingMessage2,
      isComposerBlocked2,
    ]) => {
      if (
        !isInMessageList2 ||
        !aiMessageEditorPendingResult2?.shouldSend ||
        richMessage2 !== aiMessageToSendRef ||
        aiMessageEditorPendingResult2.chatId !== chatId2 ||
        aiMessageEditorPendingResult2.threadId !== threadId2
      ) {
        return;
      }

      const { isSilent, scheduledAt, scheduleRepeatPeriod } = aiMessageEditorPendingResult2;
      clearAiMessageEditorPendingResult();
      if (!editingMessage2 && !isComposerBlocked2) {
        handleSendWithConfirmation(isSilent, scheduledAt, scheduleRepeatPeriod, true);
      }
    },
  );

  const handleOpenAiEditor = () => {
    if (!isInMessageList() || hasRichMediaBlocking()) return;

    const value = richEditor.isEmpty() ? { blocks: [] } : richEditor.getValue();
    const formattedText = getRichInputAsFormatted(value);
    const shouldUseRichApi = isRichInputExpansionActive() || hasRichOnlyContent();
    openAiMessageEditorModal({
      chatId: props.chatId,
      threadId: props.threadId,
      isEditing: Boolean(props.editingMessage),
      content: shouldUseRichApi ? { type: 'rich', richMessage: value } : { type: 'text', text: formattedText! },
    });
  };

  const handleTodoListCreate = () => {
    if (!props.isCurrentUserPremium) {
      showNotification({
        message: lang('SubscribeToTelegramPremiumForCreateToDo'),
        action: {
          action: 'openPremiumModal',
          payload: { initialSection: 'todo' },
        },
        actionText: lang('PremiumMore'),
      });
      return;
    }

    const { todoItemsMax, todoTitleLengthMax, todoItemLengthMax } = getGlobal().appConfig;
    const initialCheckList = parseCheckList(richEditor.getValue(), {
      maxItemsCount: todoItemsMax,
      maxTitleLength: todoTitleLengthMax,
      maxItemLength: todoItemLengthMax,
    });

    openTodoListModal({ chatId: props.chatId, initialCheckList });
  };

  const handleOpenRichInput = () => {
    if (!isInMessageList() || isEditingMedia()) {
      return;
    }

    closeSymbolMenu();
    expandRichInput();
  };

  const handleClickBotMenu = () => {
    if (props.botMenuButton?.type !== 'webApp') {
      return;
    }

    const parsedLink = tryParseDeepLink(props.botMenuButton.url);

    if (parsedLink?.type === 'publicUsernameOrBotLink' && parsedLink.appName) {
      processDeepLink(props.botMenuButton.url);
    } else {
      callAttachBot({
        chatId: props.chatId,
        url: props.botMenuButton.url,
        threadId: props.threadId,
      });
    }
  };

  const handleActivateBotCommandMenu = () => {
    closeSymbolMenu();
    openBotCommandMenu();
  };

  const handleMessageSchedule = (
    args: ScheduledMessageArgs,
    scheduledAt: number,
    scheduleRepeatPeriod: number | undefined,
    messageList: MessageList,
    effectId?: string,
  ) => {
    if (!validateEphemeralReply() || isEphemeralReply()) return;

    if (args && 'queryId' in args) {
      const { id, queryId, isSilent } = args;
      sendInlineBotResult({
        id,
        chatId: props.chatId,
        threadId: props.threadId,
        queryId,
        scheduledAt,
        isSilent: isSilent || props.isSilentPosting,
      });
      return;
    }

    const { isSilent, ...restArgs } = args || {};

    if (!args || Object.keys(restArgs).length === 0) {
      void handleSend(Boolean(isSilent), scheduledAt, scheduleRepeatPeriod);
    } else if (args.sendCompressed !== undefined || args.sendGrouped !== undefined) {
      const { sendCompressed = false, sendGrouped = false, isInvertedMedia } = args;
      void handleSendAttachments(
        sendCompressed,
        sendGrouped,
        isSilent,
        scheduledAt,
        isInvertedMedia,
        scheduleRepeatPeriod,
      );
    } else {
      sendMessage({
        ...args,
        messageList,
        scheduledAt,
        scheduleRepeatPeriod,
        effectId,
      });
    }
  };

  // Deviation: keyed on the committed (tt's) record, a new object per request (see `trackRecord`).
  const contentToBeScheduled = () => {
    trackRecord(props.contentToBeScheduled);
    return selectTabState(getGlobal()).contentToBeScheduled;
  };
  createEffect(
    depsOf(() => [contentToBeScheduled(), props.currentMessageList] as const),
    ([contentToBeScheduled2, currentMessageList2], prev) => {
      const [prevContentToBeScheduled] = prev ?? [];
      if (currentMessageList2 && contentToBeScheduled2 && contentToBeScheduled2 !== prevContentToBeScheduled) {
        requestMessageSchedule((scheduledAt, scheduleRepeatPeriod) => {
          handleMessageSchedule(
            contentToBeScheduled2,
            scheduledAt,
            scheduleRepeatPeriod,
            currentMessageList2,
            undefined,
          );
        });
      }
    },
  );

  createEffect(
    depsOf(
      () =>
        [
          props.editableInputId,
          insertFormattedTextAndUpdateCursor,
          props.requestedDraft,
          resetOpenChatWithDraft,
          updateRichMessage,
        ] as const,
    ),
    ([editableInputId2, , requestedDraft2]) => {
      if (requestedDraft2) {
        syncComposerWithChat();
        updateRichMessage(undefined);
        insertFormattedTextAndUpdateCursor(requestedDraft2, true);
        resetOpenChatWithDraft();

        requestNextMutation(() => {
          const messageInput = document.getElementById(editableInputId2)!;
          // Deviation: `focus()` is a layout read; the next mutation is a mutate-phase task
          forceMeasure(() => focusEditableElement(messageInput, true));
        });
      }
    },
  );

  createEffect(
    depsOf(() => [handleFileSelect, props.requestedDraftFiles, resetOpenChatWithDraft] as const),
    ([handleFileSelect2, requestedDraftFiles2]) => {
      if (requestedDraftFiles2?.length) {
        syncComposerWithChat();
        void handleFileSelect2(requestedDraftFiles2);
        resetOpenChatWithDraft();
      }
    },
  );

  const applyRichInputMediaRequest = (request: NonNullable<TabState['requestedRichInputMedia']>) => {
    if (
      request.chatId !== props.chatId ||
      request.threadId !== props.threadId ||
      request.messageListType !== props.messageListType
    ) {
      return;
    }
    if (!isRichInputExpansionActive() || !richEditor.editor) return;

    if (request.files) {
      handleRichMediaSelect(request.files);
      return;
    }
    if (!request.audio) return;

    const isInserted = richEditor.insertMedia(
      [{ type: 'audio', media: request.audio, caption: EMPTY_RICH_MEDIA_CAPTION }],
      richEditor.editor.state.selection.from,
    );
    if (!isInserted) {
      showNotification({ message: lang('RichMediaSkippedFiles', { count: 1 }, { pluralValue: 1 }) });
    }
  };

  // Deviation: keyed on the committed (tt's) record, a new object per request (see `trackRecord`).
  createEffect(
    () => {
      trackRecord(props.requestedRichInputMedia);
      return isInMessageList() ? selectTabState(getGlobal()).requestedRichInputMedia : undefined;
    },
    (requestedRichInputMedia2) => {
      if (!requestedRichInputMedia2) return;
      syncComposerWithChat();

      resetRichInputMediaRequest();
      applyRichInputMediaRequest(requestedRichInputMedia2);
    },
  );

  createEffect(
    depsOf(
      () =>
        [
          props.requestedDraftFiles,
          updateShouldSaveAttachmentsCompression,
          applyDefaultAttachmentsCompression,
        ] as const,
    ),
    ([requestedDraftFiles2]) => {
      if (requestedDraftFiles2?.length) {
        updateShouldSaveAttachmentsCompression({ shouldSave: true });
        applyDefaultAttachmentsCompression();
      } else {
        updateShouldSaveAttachmentsCompression({ shouldSave: false });
      }
    },
  );

  const handleCustomEmojiSelect = (emoji: ApiSticker) => {
    const emojiSetId = 'id' in emoji.stickerSetInfo && emoji.stickerSetInfo.id;
    if (!emoji.isFree && !props.isCurrentUserPremium && !props.isChatWithSelf && emojiSetId !== chatEmojiSetId()) {
      showCustomEmojiPremiumNotification();
      return;
    }

    insertCustomEmojiAndUpdateCursor(emoji);
  };

  const handleGifSelect = (gif: ApiVideo, isSilent?: boolean, isScheduleRequested?: boolean) => {
    if (!validateEphemeralReply() || (isEphemeralReply() && isScheduleRequested)) return;

    if (!props.currentMessageList && !props.storyId) {
      return;
    }

    isSilent = isSilent || props.isSilentPosting;

    if (props.isInScheduledList || isScheduleRequested) {
      forceShowSymbolMenu();
      requestMessageSchedule((scheduledAt, scheduleRepeatPeriod) => {
        cancelForceShowSymbolMenu();
        handleActionWithPaymentConfirmation(
          handleMessageSchedule,
          { gif, isSilent },
          scheduledAt,
          scheduleRepeatPeriod,
          props.currentMessageList!,
        );
        requestMeasure(() => {
          resetComposer(true);
        });
      });
    } else {
      handleActionWithPaymentConfirmation(sendMessage, { messageList: props.currentMessageList, gif, isSilent });
      requestMeasure(() => {
        resetComposer(true);
      });
    }

    clearDraft({ chatId: props.chatId, threadId: props.threadId, isLocalOnly: true });
  };

  const handleGifAddCaption = (gif: ApiVideo) => {
    handleSetAttachments([buildGifAttachment(gif)]);
    closeSymbolMenu();
  };

  const handleStickerSelect = (
    sticker: ApiSticker,
    isSilent?: boolean,
    isScheduleRequested?: boolean,
    shouldPreserveInput = false,
    canUpdateStickerSetsOrder?: boolean,
  ) => {
    if (!validateEphemeralReply() || (isEphemeralReply() && isScheduleRequested)) return;

    if (!props.currentMessageList && !props.storyId) {
      return;
    }

    isSilent = isSilent || props.isSilentPosting;

    if (props.isInScheduledList || isScheduleRequested) {
      forceShowSymbolMenu();
      requestMessageSchedule((scheduledAt, scheduleRepeatPeriod) => {
        cancelForceShowSymbolMenu();
        handleActionWithPaymentConfirmation(
          handleMessageSchedule,
          { sticker, isSilent },
          scheduledAt,
          scheduleRepeatPeriod,
          props.currentMessageList!,
        );
        requestMeasure(() => {
          resetComposer(shouldPreserveInput, !props.isInScheduledList || isPaidSendDeferred());
        });
      });
    } else {
      handleActionWithPaymentConfirmation(sendMessage, {
        messageList: props.currentMessageList,
        sticker,
        isSilent,
        shouldUpdateStickerSetOrder: props.shouldUpdateStickerSetOrder && canUpdateStickerSetsOrder,
      });
      clearDraft({ chatId: props.chatId, threadId: props.threadId, isLocalOnly: true });

      requestMeasure(() => {
        resetComposer(shouldPreserveInput, isPaidSendDeferred());
      });
    }
  };

  const handleInlineBotSelect = (
    inlineBotId: string,
    inlineResult: ApiBotInlineResult | ApiBotInlineMediaResult,
    isSilent?: boolean,
    isScheduleRequested?: boolean,
  ) => {
    if (!validateEphemeralReply() || isEphemeralReply()) return;

    if (!props.currentMessageList && !props.storyId) {
      return;
    }

    isSilent = isSilent || props.isSilentPosting;

    if (props.isInScheduledList || isScheduleRequested) {
      requestMessageSchedule((scheduledAt, scheduleRepeatPeriod) => {
        handleActionWithPaymentConfirmation(
          handleMessageSchedule,
          {
            id: inlineResult.id,
            queryId: inlineResult.queryId,
            isSilent,
          },
          scheduledAt,
          scheduleRepeatPeriod,
          props.currentMessageList!,
        );
      });
    } else {
      handleActionWithPaymentConfirmation(sendInlineBotResult, {
        id: inlineResult.id,
        queryId: inlineResult.queryId,
        threadId: props.threadId,
        chatId: props.chatId,
        isSilent,
      });
    }

    const messageInput = document.querySelector<HTMLDivElement>(props.editableInputCssSelector);
    if (IS_IOS && messageInput && messageInput === document.activeElement) {
      applyIosAutoCapitalizationFix(messageInput);
    }

    clearDraft({ chatId: props.chatId, threadId: props.threadId, isLocalOnly: true });
    requestMeasure(() => {
      resetComposer(false, Boolean(isScheduleRequested && !props.isInScheduledList) || isPaidSendDeferred());
    });
  };

  const handleBotCommandSelect = () => {
    clearDraft({ chatId: props.chatId, threadId: props.threadId, isLocalOnly: true });
    requestMeasure(() => {
      resetComposer();
    });
  };

  const getTooltipBoundary = () => composerRef;
  const getRichEditorTooltipContext = () => ({
    chatId: props.chatId,
    threadId: props.threadId,
    currentUserId: props.currentUserId,
    currentUser: props.currentUser,
    groupChatMembers: groupChatMembers(),
    topInlineBotIds: canUseInlineBots() ? props.topInlineBotIds : undefined,
    topGuestBotIds: props.topGuestBotIds,
    // Deviation: plain values. These are store proxies here, which `memoized` (the keyword library of the `:` tooltip)
    // never caches, so the library was rebuilt on each keystroke; tt got the immutable global objects.
    recentEmojiIds: props.recentEmojis && unwrap(props.recentEmojis),
    baseEmojiKeywords: props.baseEmojiKeywords && unwrap(props.baseEmojiKeywords),
    emojiKeywords: props.emojiKeywords && unwrap(props.emojiKeywords),
    inlineBots: props.inlineBots,
    botCommands: props.botCommands,
    chatBotCommands: chatBotCommands(),
    quickReplies: props.canSendQuickReplies && props.isCurrentUserPremium ? props.quickReplies : undefined,
    quickReplyMessages: props.quickReplyMessages,
    isSavedMessages: props.isChatWithSelf,
    isInScheduledList: props.isInScheduledList,
    isCurrentUserPremium: props.isCurrentUserPremium,
    canSendGifs: canSendGifs(),
  });
  const getIsEmojiTooltipEnabled = () =>
    Boolean(
      props.isReady &&
      props.isOnActiveTab &&
      (isInStoryViewer() || props.isForCurrentMessageList) &&
      props.shouldSuggestStickers &&
      !hasAttachments(),
    );
  const getIsCustomEmojiTooltipEnabled = () =>
    Boolean(
      props.isReady &&
      props.isOnActiveTab &&
      (isInStoryViewer() || props.isForCurrentMessageList) &&
      props.shouldSuggestCustomEmoji &&
      !hasAttachments(),
    );
  const getIsStickerTooltipEnabled = () =>
    Boolean(
      props.isReady &&
      props.isOnActiveTab &&
      (isInStoryViewer() || props.isForCurrentMessageList) &&
      props.shouldSuggestStickers &&
      canSendStickers() &&
      !hasAttachments(),
    );
  const getIsMentionTooltipEnabled = () =>
    Boolean(isInMessageList() && props.isReady && props.isForCurrentMessageList && !hasAttachments());
  const getIsInlineBotTooltipEnabled = () =>
    Boolean(
      canUseInlineBots() && isInMessageList() && props.isReady && props.isForCurrentMessageList && !hasAttachments(),
    );
  const getIsCommandTooltipEnabled = () =>
    Boolean(
      isInMessageList() &&
      props.isReady &&
      props.isForCurrentMessageList &&
      ((props.botCommands && props.botCommands.length) ||
        chatBotCommands()?.length ||
        (hasQuickReplies() && props.canSendQuickReplies && props.isCurrentUserPremium)),
    );
  const getIsFormatterEnabled = () =>
    Boolean(
      props.isReady && props.isOnActiveTab && (isInStoryViewer() || props.isForCurrentMessageList) && !hasAttachments(),
    );
  const richEditorTooltips = createMemo<RichEditorTooltipsConfig>(() => ({
    emoji: {
      isEnabled: getIsEmojiTooltipEnabled,
      addRecentEmoji,
      addRecentCustomEmoji,
    },
    customEmoji: {
      isEnabled: getIsCustomEmojiTooltipEnabled,
      addRecentCustomEmoji,
    },
    sticker: {
      isEnabled: getIsStickerTooltipEnabled,
      onSelect: handleStickerSelect,
    },
    mention: isInMessageList() ? { isEnabled: getIsMentionTooltipEnabled } : undefined,
    command: isInMessageList()
      ? {
          isEnabled: getIsCommandTooltipEnabled,
          onSelect: handleBotCommandSelect,
        }
      : undefined,
    inlineBot: isInMessageList()
      ? {
          isEnabled: getIsInlineBotTooltipEnabled,
          onSelect: handleInlineBotSelect,
          onHelpChange: setInlineBotHelp,
        }
      : undefined,
    formatter: {
      isEnabled: getIsFormatterEnabled,
      capabilities: 'full',
    },
    getTooltipBoundary,
    getContext: getRichEditorTooltipContext,
  }));

  const handleToDoListSend = (todo: ApiNewMediaTodo) => {
    if (!validateEphemeralReply()) return;

    const currentMessageList = props.currentMessageList;
    if (!currentMessageList) {
      return;
    }

    const convertedSource = props.todoListModal?.initialCheckList
      ? { chatId: props.chatId, threadId: props.threadId }
      : undefined;

    if (props.isInScheduledList) {
      requestMessageSchedule((scheduledAt, scheduleRepeatPeriod) => {
        handleActionWithPaymentConfirmation(
          scheduleTodoList,
          { todo },
          scheduledAt,
          scheduleRepeatPeriod,
          currentMessageList,
          convertedSource,
        );
      });
    } else {
      handleActionWithPaymentConfirmation(
        sendTodoList,
        { messageList: currentMessageList, todo, isSilent: props.isSilentPosting },
        convertedSource,
      );
    }
  };

  const sendTodoList = (
    params: { messageList: MessageList; todo: ApiNewMediaTodo; isSilent?: boolean },
    convertedSource?: ConvertedCheckListSource,
  ) => {
    sendMessage(params);
    if (convertedSource) clearConvertedDraft(convertedSource);
  };

  const scheduleTodoList = (
    args: ScheduledMessageArgs,
    scheduledAt: number,
    scheduleRepeatPeriod: number | undefined,
    messageList: MessageList,
    convertedSource?: ConvertedCheckListSource,
  ) => {
    handleMessageSchedule(args, scheduledAt, scheduleRepeatPeriod, messageList);
    if (convertedSource) clearConvertedDraft(convertedSource);
  };

  const clearConvertedDraft = (source: ConvertedCheckListSource) => {
    clearDraft({ chatId: source.chatId, threadId: source.threadId, isLocalOnly: true });

    if (source.chatId !== props.chatId || source.threadId !== props.threadId) {
      return;
    }

    requestMeasure(() => {
      resetComposer(false, isPaidSendDeferred());
    });
  };

  const sendSilent = (additionalArgs?: ScheduledMessageArgs) => {
    if (props.isInScheduledList) {
      requestMessageSchedule((scheduledAt, scheduleRepeatPeriod) => {
        handleMessageSchedule(
          { ...additionalArgs, isSilent: true },
          scheduledAt,
          scheduleRepeatPeriod,
          props.currentMessageList!,
        );
      });
    } else if (additionalArgs && ('sendCompressed' in additionalArgs || 'sendGrouped' in additionalArgs)) {
      const { sendCompressed = false, sendGrouped = false, isInvertedMedia } = additionalArgs;
      void handleSendAttachments(sendCompressed, sendGrouped, true, undefined, isInvertedMedia);
    } else {
      void handleSend(true);
    }
  };

  const handleSendAsMenuOpen = () => {
    const messageInput = document.querySelector<HTMLDivElement>(props.editableInputCssSelector);

    if (!props.isMobile || messageInput !== document.activeElement) {
      closeBotCommandMenu();
      closeSymbolMenu();
      openSendAsMenu();
      return;
    }

    messageInput?.blur();
    setTimeout(() => {
      closeBotCommandMenu();
      closeSymbolMenu();
      openSendAsMenu();
    }, MOBILE_KEYBOARD_HIDE_DELAY_MS);
  };

  createEffect(
    depsOf(() => [attachments(), isComposerBlocked(), updateRichMessage] as const),
    ([attachments2, isComposerBlocked2]) => {
      if (!isComposerBlocked2) return;

      syncComposerWithChat();
      updateRichMessage(undefined);
    },
  );

  const handleFormattedDateInsert = (text: ApiFormattedText) => {
    insertFormattedTextAndUpdateCursor(text);
  };

  const removeSymbol = () => {
    richEditor.deleteCharacterBeforeSelection();
  };

  const handleAllScheduledClick = () => {
    openThread({
      chatId: props.chatId,
      threadId: props.threadId,
      type: 'scheduled',
      noForumTopicPanel: true,
    });
  };

  const handleGiftClick = () => {
    openGiftModal({ forUserId: props.chatId });
  };

  const handleAutoDeleteClick = () => {
    openAutoDeleteTimerModal({ chatId: props.chatId });
  };
  const handleSuggestPostClick = () => {
    updateDraftSuggestedPostInfo({
      price: { currency: STARS_CURRENCY_CODE, amount: 0, nanos: 0 },
    });
  };

  const handleToggleSilentPosting = () => {
    const newValue = !props.isSilentPosting;
    updateChatSilentPosting({ chatId: props.chatId, isEnabled: newValue });

    showNotification({
      localId: 'silentPosting',
      icon: newValue ? 'mute' : 'unmute',
      message: lang(`ComposerSilentPosting${newValue ? 'Enabled' : 'Disabled'}Tootlip`),
    });
  };

  createEffect(
    depsOf(() => [props.isRightColumnShown, closeSymbolMenu, props.isMobile] as const),
    ([isRightColumnShown2, , isMobile2]) => {
      if (isRightColumnShown2 && isMobile2) {
        closeSymbolMenu();
      }
    },
  );

  createEffect(
    depsOf(() => [props.isSelectModeActive, enableHover, disableHover, props.isReady] as const),
    ([isSelectModeActive2, , , isReady2]) => {
      if (!isReady2) return undefined;

      let timeout: number | undefined;
      if (isSelectModeActive2) {
        disableHover();
      } else {
        timeout = window.setTimeout(() => {
          enableHover();
        }, SELECT_MODE_TRANSITION_MS);
      }
      return () => {
        if (timeout) {
          clearTimeout(timeout);
        }
      };
    },
  );

  const [shouldShowRichInputButton, setShouldShowRichInputButton] = createSignal(false);

  const updateShouldShowRichInputButton = () => {
    if (hasAttachments()) {
      setShouldShowRichInputButton(false);
      return;
    }

    requestMeasure(() => {
      const input = inputRef;
      if (!input || (!hasInputContent() && !input.textContent)) {
        setShouldShowRichInputButton(false);
        return;
      }
      const { totalLines } = calcTextLineHeightAndCount(input, true);
      setShouldShowRichInputButton(totalLines >= MIN_COMPOSER_LINES);
    });
  };

  createEffect(
    depsOf(() => [richMessage(), hasAttachments(), hasInputContent(), windowWidth()] as const),
    () => {
      updateShouldShowRichInputButton();
    },
  );
  useResizeObserver(() => inputRef, updateShouldShowRichInputButton, hasAttachments);

  const withBotMenuButton = createMemo(
    () =>
      props.isChatWithBot &&
      props.botMenuButton?.type === 'webApp' &&
      !props.editingMessage &&
      props.messageListType === 'thread',
  );
  const isBotMenuButtonOpen = createMemo(() => withBotMenuButton() && !hasInputContent() && !activeRecording());

  const isComposerHasFocus = createMemo(
    () => isComposerActive() || isBotCommandMenuOpen() || isBotMenuButtonOpen() || isCustomSendMenuOpen(),
  );
  const isReactionSelectorOpen = createMemo(
    () =>
      isComposerHasFocus() &&
      !props.isReactionPickerOpen &&
      isInStoryViewer() &&
      !isAttachMenuOpen() &&
      !isSymbolMenuOpen() &&
      !activeRecording() &&
      !hasInputContent(),
  );

  createEffect(
    depsOf(() => [editingRichMediaAttachment(), handleRichInputEscape, isRichInputExpansionActive()] as const),
    ([editingRichMediaAttachment2, handleRichInputEscape2, isRichInputExpansionActive2]) => {
      if (!isRichInputExpansionActive2 || editingRichMediaAttachment2) {
        return undefined;
      }

      function handleDocumentMouseDown(e: MouseEvent) {
        const target = e.target as HTMLElement | undefined;
        if (!target) {
          return;
        }

        if (
          target.closest('.message-input-wrapper') ||
          target.closest('.main-button') ||
          target.closest('[data-text-formatter]') ||
          target.closest('.Menu') ||
          target.closest('.Modal') ||
          target.closest('[aria-modal="true"]') ||
          target.closest('.symbol-menu') ||
          target.closest('.composer-tooltip')
        ) {
          return;
        }

        collapseRichInput();
      }

      const releaseEscKeyListener = captureEscKeyListener(handleRichInputEscape2);
      document.addEventListener('mousedown', handleDocumentMouseDown);

      return () => {
        releaseEscKeyListener();
        document.removeEventListener('mousedown', handleDocumentMouseDown);
      };
    },
  );

  const slowModePlaceholder = createMemo(() =>
    (() => {
      placeholderTick();
      if (!props.slowMode?.nextSendDate || props.slowMode.nextSendDate < getServerTime()) return undefined;

      return lang(
        'SlowModePlaceholder',
        {
          timer: <TextTimer endsAt={props.slowMode.nextSendDate} onEnd={forceUpdate} />,
        },
        { withNodes: true },
      );
    })(),
  );

  const placeholder = createMemo(() => {
    placeholderTick();
    if (activeRecording() && windowWidth() <= SCREEN_WIDTH_TO_HIDE_PLACEHOLDER) {
      return '';
    }

    if (!isComposerBlocked()) {
      if (slowModePlaceholder()) return slowModePlaceholder();
      if (props.botKeyboardPlaceholder) return props.botKeyboardPlaceholder;
      if (props.inputPlaceholder) return props.inputPlaceholder;
      if (props.paidMessagesStars) {
        return lang(
          'ComposerPlaceholderPaidMessage',
          {
            amount: formatStarsAsIcon(lang, props.paidMessagesStars, {
              asFont: true,
              className: 'placeholder-star-icon',
            }),
          },
          {
            withNodes: true,
          },
        );
      }

      if (props.isReplying && props.hasSuggestedPost) {
        return lang('ComposerPlaceholderCaption');
      }

      if (props.stealthMode?.activeUntil && isInStoryViewer() && props.stealthMode.activeUntil > getServerTime()) {
        return lang(
          'StealthModeComposerPlaceholder',
          {
            timer: <TextTimer endsAt={props.stealthMode.activeUntil} onEnd={forceUpdate} />,
          },
          { withNodes: true },
        );
      }

      if (props.chat?.adminRights?.anonymous) {
        return lang('ComposerPlaceholderAnonymous');
      }

      if (props.chat?.isBotForum && !props.user?.canManageBotForumTopics && props.threadId === MAIN_THREAD_ID) {
        return lang('ComposerPlaceholderBotTopicGeneral');
      }

      if (
        props.chat?.isForum &&
        !props.chat.isBotForum &&
        props.chat.isForumAsMessages &&
        props.threadId === MAIN_THREAD_ID
      ) {
        return props.replyToTopic
          ? lang('ComposerPlaceholderTopic', { topic: props.replyToTopic.title })
          : lang('ComposerPlaceholderTopicGeneral');
      }
      if (props.isChannel) {
        return lang(props.isSilentPosting ? 'ComposerPlaceholderBroadcastSilent' : 'ComposerPlaceholderBroadcast');
      }
      return lang('ComposerPlaceholder');
    }

    if (isInStoryViewer()) return lang('ComposerStoryPlaceholderLocked');

    return lang('ComposerPlaceholderNoText');
  });

  createEffect(
    depsOf(() => [isComposerHasFocus(), props.onBlur, props.onFocus] as const),
    ([isComposerHasFocus2, onBlur2, onFocus2]) => {
      if (isComposerHasFocus2) {
        onFocus2?.();
      } else {
        onBlur2?.();
      }
    },
  );

  // Deviation: `ReactionSelector` takes the transition classes as `className` (tt's `useShowTransitionDeprecated`):
  // they are built from the kit transition's state with the class names of tt's hook.
  const { shouldRender: shouldRenderReactionSelector, state: reactionSelectorTransitionState } = createShowTransition({
    isOpen: isReactionSelectorOpen,
    className: false,
  });
  const reactionSelectorTransitonClassNames = createMemo(() => {
    const state = reactionSelectorTransitionState();
    return buildClassName(
      'opacity-transition',
      'fast',
      state === 'open' ? 'open' : 'not-open',
      state !== 'closed' ? 'shown' : 'not-shown',
      state === 'closing' && 'closing',
    );
  });
  const shouldForceVoiceMode = createMemo(
    () => IS_VOICE_RECORDING_SUPPORTED && !canSendRoundVideos() && canSendVoices(),
  );
  const shouldForceVideoMode = createMemo(
    () => IS_VIDEO_RECORDING_SUPPORTED && !canSendVoices() && canSendRoundVideos(),
  );
  const isRecordingVideoMode = createMemo(
    () =>
      IS_VIDEO_RECORDING_SUPPORTED &&
      (props.recordMode === 'video' || !IS_VOICE_RECORDING_SUPPORTED || shouldForceVideoMode()) &&
      !shouldForceVoiceMode(),
  );
  const areRecordingsNotAllowed = createMemo(
    () =>
      mainButtonState() === MainButtonState.Record &&
      (!canAttachMedia() ||
        !props.canSendVoiceByPrivacy ||
        (isRecordingVideoMode() ? !canSendRoundVideos() : !canSendVoices())),
  );

  const mainButtonHandler = () => {
    switch (mainButtonState()) {
      case MainButtonState.Stop:
        stopTypingDraft({ chatId: props.chatId, threadId: props.threadId, randomId: props.stoppableTypingDraftId! });
        break;
      case MainButtonState.Forward:
        props.onForward?.();
        break;
      case MainButtonState.Send:
        handleSendWithConfirmation();
        break;
      case MainButtonState.Record: {
        if (areRecordingsNotAllowed()) {
          if (!props.canSendVoiceByPrivacy) {
            showNotification({
              message: isRecordingVideoMode()
                ? {
                    key: 'VideoMessagesRestrictedByPrivacy',
                    variables: { user: props.chat?.title ?? '' },
                    options: { withNodes: true, withMarkdown: true },
                  }
                : oldLang('VoiceMessagesRestrictedByPrivacy', props.chat?.title),
            });
          } else if (isRecordingVideoMode() ? !canSendRoundVideos() : !canSendVoices()) {
            showAllowedMessageTypesNotification({ chatId: props.chatId, messageListType: props.messageListType });
          }
        } else {
          setIsViewOnceEnabled(false);
          if (isRecordingVideoMode()) {
            void startRecordingVideo();
          } else {
            void startRecordingVoice();
          }
        }
        break;
      }
      case MainButtonState.Edit:
        if (hasRichOnlyContent()) {
          handleSendWithConfirmation();
        } else {
          handleEditComplete();
        }
        break;
      case MainButtonState.Schedule: {
        if (!checkCanSendRichContent()) {
          break;
        }
        if (activeVoiceRecording()) {
          pauseRecordingVoice();
        }
        if (activeVideoRecording()) {
          finishRecordingVideo();
        }
        const currentMessageList = props.currentMessageList;
        if (!currentMessageList) {
          return;
        }
        requestMessageSchedule((scheduledAt, scheduleRepeatPeriod) => {
          handleMessageSchedule({}, scheduledAt, scheduleRepeatPeriod, currentMessageList, props.effect?.id);
        });
        break;
      }
      default:
        break;
    }
  };

  const mainButtonContextMenuHandler = createMemo(() => {
    let mainButtonContextMenuHandler2: typeof handleContextMenu | undefined;
    if (mainButtonState() === MainButtonState.Send && canShowCustomSendMenu()) {
      mainButtonContextMenuHandler2 = handleContextMenu;
    } else if (mainButtonState() === MainButtonState.Record) {
      mainButtonContextMenuHandler2 = canSwitchRecordMode() ? handleRecordModeContextMenu : stopEvent;
    }
    return mainButtonContextMenuHandler2;
  });

  const sendButtonAriaLabel = createMemo(() => {
    let sendButtonAriaLabel2 = 'SendMessage';
    switch (mainButtonState()) {
      case MainButtonState.Forward:
        sendButtonAriaLabel2 = 'Forward';
        break;
      case MainButtonState.Edit:
        sendButtonAriaLabel2 = 'Save edited message';
        break;
      case MainButtonState.Record:
        if (!canAttachMedia()) {
          sendButtonAriaLabel2 = 'Conversation.DefaultRestrictedMedia';
        } else {
          sendButtonAriaLabel2 = isRecordingVideoMode() ? 'AccDescrVideoMessage' : 'AccDescrVoiceMessage';
        }
    }
    return sendButtonAriaLabel2;
  });

  const fullClassName = createMemo(() =>
    buildClassName(
      'Composer',
      isInMessageList() && 'is-chat-composer',
      isInStoryViewer() && 'is-story-composer',
      isInStoryViewer() && isComposerEngaged() && 'is-story-composer-focused',
      !props.isSelectModeActive && 'shown',
      isHoverDisabled() && 'hover-disabled',
      isMounted() && 'mounted',
      isEmbeddedMessageOpen() && 'with-embedded',
      props.className,
    ),
  );
  const handleToggleReaction = (reaction: ApiReaction) => {
    let text: string | undefined;
    let entities: ApiMessageEntity[] | undefined;

    if (reaction.type === 'emoji') {
      text = reaction.emoticon;
    }

    if (reaction.type === 'custom') {
      const sticker = selectCustomEmoji(getGlobal(), reaction.documentId);
      if (!sticker) {
        return;
      }

      if (!sticker.isFree && !props.isCurrentUserPremium && !props.isChatWithSelf) {
        showCustomEmojiPremiumNotification();
        return;
      }
      text = sticker.emoji || '';
      entities = text
        ? [
            {
              type: ApiMessageEntityTypes.CustomEmoji,
              offset: 0,
              length: text.length,
              documentId: sticker.id,
            },
          ]
        : undefined;
    }

    handleActionWithPaymentConfirmation(sendMessage, { text, entities, isReaction: true });
    closeReactionPicker();
  };

  const handleToggleEffectReaction = (reaction: ApiReaction) => {
    setReactionEffect({ chatId: props.chatId, threadId: props.threadId, reaction });

    closeReactionPicker();
  };

  const handleReactionPickerOpen = (position: IAnchorPosition) => {
    if (props.isMobile) {
      document.querySelector<HTMLDivElement>(props.editableInputCssSelector)?.blur();
    }

    openStoryReactionPicker({
      peerId: props.chatId,
      storyId: props.storyId!,
      position,
      sendAsMessage: true,
    });
  };

  const handleLikeStory = () => {
    const reaction = props.sentStoryReaction ? undefined : HEART_REACTION;
    sendStoryReaction({
      peerId: props.chatId,
      storyId: props.storyId!,
      containerId: getStoryKey(props.chatId, props.storyId!),
      reaction,
    });
  };

  const handleSendScheduled = () => {
    if (!checkCanSendRichContent()) {
      return;
    }

    requestMessageSchedule((scheduledAt, scheduleRepeatPeriod) => {
      handleMessageSchedule({}, scheduledAt, scheduleRepeatPeriod, props.currentMessageList!, undefined);
    });
  };

  const handleSendSilent = () => {
    if (!checkCanSendRichContent()) {
      return;
    }

    handleActionWithPaymentConfirmation(sendSilent);
  };

  const sendWhenOnline = () => {
    handleActionWithPaymentConfirmation(
      handleMessageSchedule,
      {},
      SCHEDULED_WHEN_ONLINE,
      undefined,
      props.currentMessageList!,
      props.effect?.id,
    );
  };

  const handleSendWhenOnline = () => {
    if (!checkCanSendRichContent()) {
      return;
    }

    sendWhenOnline();
  };

  const handleSendScheduledAttachments = (
    sendCompressed: boolean,
    sendGrouped: boolean,
    isInvertedMedia?: true,
    scheduledAt?: number,
    scheduleRepeatPeriod?: number,
  ) => {
    if (scheduledAt) {
      handleActionWithPaymentConfirmation(
        handleMessageSchedule,
        { sendCompressed, sendGrouped, isInvertedMedia },
        scheduledAt,
        scheduleRepeatPeriod,
        props.currentMessageList!,
        undefined,
      );
    } else {
      requestMessageSchedule((calendarScheduledAt, calendarRepeatPeriod) => {
        handleActionWithPaymentConfirmation(
          handleMessageSchedule,
          { sendCompressed, sendGrouped, isInvertedMedia },
          calendarScheduledAt,
          calendarRepeatPeriod,
          props.currentMessageList!,
          undefined,
        );
      });
    }
  };

  const handleSendSilentAttachments = (sendCompressed: boolean, sendGrouped: boolean, isInvertedMedia?: true) => {
    handleActionWithPaymentConfirmation(sendSilent, { sendCompressed, sendGrouped, isInvertedMedia });
  };

  const handleRemoveEffect = () => {
    saveEffectInDraft({ chatId: props.chatId, threadId: props.threadId, effectId: undefined });
  };

  const handleStopEffect = () => {
    hideEffectInComposer({});
  };

  const onSend = createMemo(() => {
    switch (mainButtonState()) {
      case MainButtonState.Edit:
        return hasRichOnlyContent() ? handleSendWithConfirmation : handleEditComplete;
      case MainButtonState.Schedule:
        return handleSendScheduled;
      default:
        return handleSendWithConfirmation;
    }
  });

  const withBotCommands = createMemo(
    () =>
      props.isChatWithBot &&
      props.botMenuButton?.type === 'commands' &&
      !props.editingMessage &&
      props.botCommands !== false &&
      !activeRecording(),
  );

  const effectEmoji = createMemo(() => props.areEffectsSupported && props.effect?.emoticon);

  const canExpandRichInput = createMemo(() => isInMessageList() && !isRichInputExpansionActive() && !isEditingMedia());
  const canOpenRichInput = createMemo(
    () =>
      shouldShowRichInputButton() &&
      isInMessageList() &&
      !hasAttachments() &&
      !props.isRichInputExpanded &&
      !isComposerBlocked() &&
      !isEditingMedia(),
  );
  const canCloseRichInput = createMemo(() => Boolean(isRichInputExpansionActive() && !isComposerBlocked()));
  const canToggleRichInput = createMemo(() => canOpenRichInput() || canCloseRichInput());
  const shouldShowAiButton = createMemo(
    () =>
      (isRichInputExpansionActive() || (shouldShowRichInputButton() && hasInputContent())) &&
      !isInStoryViewer() &&
      !hasAttachments() &&
      !isComposerBlocked() &&
      !activeRecording() &&
      !hasRichMediaBlocking(),
  );
  const { ref: voiceRecordBarRef, shouldRender: shouldRenderVoiceRecordBar } = createShowTransition({
    isOpen: () => Boolean(activeRecording()),
  });
  const renderedRecording = currentOrPrev(() => activeRecording());

  const { ref: roundVideoRecorderRef, shouldRender: shouldRenderRoundVideoRecorder } = createShowTransition({
    isOpen: () => isVideoRecordingStarting() || Boolean(activeVideoRecording() && previewStream()),
    className: false,
  });
  const renderedVideoRecording = currentOrPrev(() => activeVideoRecording());
  const renderedPreviewStream = currentOrPrev(() => previewStream());

  const isPaidSend = createMemo(() => Boolean(props.paidMessagesStars && mainButtonState() === MainButtonState.Send));
  const { ref: paidStarsRef, shouldRender: shouldRenderPaidStars } = createShowTransition({
    isOpen: () => isPaidSend(),
    className: 'slow',
    closeDuration: PAID_STARS_CLOSE_DURATION,
  });

  let paidStarsEl: HTMLDivElement | undefined;
  // Deviation: tt's passive effect ran after the commit that rendered the stars. Here a mutation effect runs in the
  // mutate phase that inserts them and books the measurement for the next frame (`requestMeasure` from the mutate phase),
  // when the element is attached and laid out.
  createMutationEffect(
    depsOf(() => [shouldRenderPaidStars(), starsForAllMessages()] as const),
    ([shouldRenderPaidStars2]) => {
      if (!shouldRenderPaidStars2) return;

      requestMeasure(() => {
        const starsEl = paidStarsEl;
        const buttonEl = mainButtonEl;
        if (!starsEl?.isConnected || !buttonEl) return;

        const width = starsEl.scrollWidth + 1;
        requestMutation(() => {
          buttonEl.style.setProperty('--paid-stars-width', `${width}px`);
        });
      });
    },
  );

  return (
    <div ref={composerRef} class={fullClassName()}>
      <Show
        when={
          isInMessageList() &&
          canAttachMedia() &&
          !hasRichOnlyContent() &&
          props.isReady &&
          !isRichInputExpansionActive()
        }
      >
        <DropArea
          isOpen={props.dropAreaState !== DropAreaState.None}
          withQuick={props.dropAreaState === DropAreaState.QuickFile || prevDropAreaState() === DropAreaState.QuickFile}
          editingMessage={props.editingMessage}
          onHide={() => props.onDropHide?.()}
          onFileSelect={handleFileSelect}
        />
      </Show>
      <Show when={shouldRenderReactionSelector() && !isNeedPremium()}>
        <ReactionSelector
          topReactions={props.topReactions}
          allAvailableReactions={props.availableReactions}
          onToggleReaction={handleToggleReaction}
          isPrivate
          isReady={props.isReady}
          canBuyPremium={props.canBuyPremium}
          isCurrentUserPremium={props.isCurrentUserPremium}
          isInSavedMessages={props.isChatWithSelf}
          isInStoryViewer={isInStoryViewer()}
          canPlayAnimatedEmojis={props.canPlayAnimatedEmojis}
          onShowMore={handleReactionPickerOpen}
          className={reactionSelectorTransitonClassNames()}
        />
      </Show>
      <AttachmentModal
        chatId={props.chatId}
        threadId={props.threadId}
        richEditor={richEditor}
        canShowCustomSendMenu={canShowCustomSendMenu()}
        attachments={attachments()}
        isReady={props.isReady}
        shouldForceCompression={shouldForceCompression()}
        shouldForceAsFile={shouldForceAsFile()}
        isForCurrentMessageList={props.isForCurrentMessageList}
        isForMessage={isInMessageList()}
        shouldSchedule={canSchedule() && props.isInScheduledList}
        canSchedule={canSchedule()}
        forceDarkTheme={isInStoryViewer()}
        onSendSilent={handleSendSilentAttachments}
        onSend={handleSendAttachmentsFromModal}
        onSendScheduled={handleSendScheduledAttachments}
        onFileAppend={handleAppendFiles}
        onClear={handleClearAttachments}
        onAttachmentsUpdate={handleSetAttachments}
        editingMessage={props.editingMessage}
        onSendWhenOnline={sendWhenOnline}
        canScheduleUntilOnline={canSchedule() && props.canScheduleUntilOnline && !isViewOnceEnabled()}
        paidMessagesStars={props.paidMessagesStars}
      />
      <MediaEditor
        isOpen={Boolean(editingRichMediaAttachment())}
        imageUrl={editingRichMediaAttachment()?.blobUrl}
        mimeType={editingRichMediaAttachment()?.mimeType}
        filename={editingRichMediaAttachment()?.filename}
        onClose={handleCloseRichMediaEditor}
        onSave={handleSaveRichMediaEdit}
      />
      <Show when={props.isForCurrentMessageList}>
        <ToDoListModal modal={props.todoListModal} onClear={closeTodoListModal} onSend={handleToDoListSend} />
      </Show>
      <SendAsMenu
        isOpen={isSendAsMenuOpen()}
        onClose={closeSendAsMenu}
        chatId={props.chatId}
        selectedSendAsId={props.sendAsId}
        sendAsPeerIds={sendAsPeerIds()}
        isCurrentUserPremium={props.isCurrentUserPremium}
      />
      <Show when={isInMessageList()}>
        <ComposerEmbeddedMessage
          onClear={handleEmbeddedClear}
          onIsOpenChange={setIsEmbeddedMessageOpen}
          shouldForceShowEditing={Boolean(shouldForceShowEditing() && props.editingMessage)}
          isHidden={isRichInputExpansionActive()}
          chatId={props.chatId}
          threadId={props.threadId}
          messageListType={props.messageListType}
        />
        <Show when={!isRichInputExpansionActive()}>
          <WebPagePreview
            chatId={props.chatId}
            threadId={props.threadId}
            isDisabled={!canAttachEmbedLinks() || hasAttachments() || hasRichOnlyContent() || !hasInputContent()}
            isEditing={Boolean(props.editingMessage)}
          />
        </Show>
      </Show>
      <div class={buildClassName('composer-wrapper', isRichInputExpansionActive() && 'rich-input-expanded')}>
        <div
          class={buildClassName('message-input-wrapper', peerColorClass(), activeRecording() && 'is-voice-recording')}
          style={peerColorStyle()}
        >
          <Show when={isInMessageList() && !isRichInputExpansionActive()}>
            <Show when={withBotMenuButton()}>
              <BotMenuButton
                isOpen={isBotMenuButtonOpen()}
                text={props.botMenuButton?.type === 'webApp' ? props.botMenuButton.text : ''}
                isDisabled={Boolean(activeRecording())}
                onClick={handleClickBotMenu}
              />
            </Show>
            <Show when={withBotCommands()}>
              <ResponsiveHoverButton
                className={buildClassName(
                  'bot-commands',
                  'composer-action-button',
                  isBotCommandMenuOpen() && 'activated',
                )}
                round
                disabled={props.botCommands === undefined}
                color="translucent"
                onActivate={handleActivateBotCommandMenu}
                ariaLabel="Open bot command keyboard"
              >
                <Icon name="hamburger" />
              </ResponsiveHoverButton>
            </Show>
            <Show when={canShowSendAs() && props.sendAsPeer}>
              <Button
                round
                color="translucent"
                onClick={isSendAsMenuOpen() ? closeSendAsMenu : handleSendAsMenuOpen}
                ariaLabel={oldLang('SendMessageAsTitle')}
                className={buildClassName(
                  'send-as-button',
                  'composer-action-button',
                  shouldAnimateSendAsButtonRef() && 'appear-animation',
                )}
              >
                <Avatar peer={props.sendAsPeer} size="tiny" />
              </Button>
            </Show>
          </Show>
          <Show when={!isNeedPremium()}>
            <AttachMenu
              chatId={props.chatId}
              threadId={props.threadId}
              editingMessage={props.editingMessage}
              canEditMedia={canMediaBeReplaced()}
              isRichInputExpanded={isRichInputExpansionActive()}
              isButtonVisible={!activeRecording()}
              canAttachMedia={canAttachMedia()}
              canAttachFiles={isRichInputExpansionActive() || !hasRichOnlyContent()}
              canAttachPolls={canAttachPolls()}
              canAttachToDoLists={canAttachToDoLists()}
              canSendPhotos={canSendPhotos()}
              canSendVideos={canSendVideos()}
              canSendDocuments={canSendDocuments()}
              canSendAudios={canSendAudios()}
              canInsertDate={!isComposerBlocked()}
              onFileSelect={isRichInputExpansionActive() ? handleRichMediaSelect : handleFileSelect}
              onDateInsert={handleFormattedDateInsert}
              onTodoListCreate={handleTodoListCreate}
              isScheduled={props.isInScheduledList}
              attachBots={isInMessageList() ? props.attachBots : undefined}
              canSendMoney={isInMessageList() ? props.canSendMoney : undefined}
              peerType={props.attachMenuPeerType}
              shouldCollectDebugLogs={props.shouldCollectDebugLogs}
              theme={props.theme}
              onMenuOpen={onAttachMenuOpen}
              onMenuClose={onAttachMenuClose}
              messageListType={props.messageListType}
              paidMessagesStars={props.paidMessagesStars}
              canExpandRichInput={canExpandRichInput()}
              menuPositionX={isInMessageList() ? 'left' : 'right'}
              onRichInputExpand={handleOpenRichInput}
            />
          </Show>
          <div
            class={buildClassName('rich-editor-history', isRichInputExpansionActive() && 'rich-editor-history-open')}
            aria-hidden={!isRichInputExpansionActive()}
            inert={!isRichInputExpansionActive()}
          >
            <Button
              round
              faded
              size="smaller"
              color="translucent"
              ariaLabel={lang('Undo')}
              iconName="undo"
              disabled={!richEditor.canUndo}
              onClick={richEditor.undo}
            />
            <Button
              round
              faded
              size="smaller"
              color="translucent"
              ariaLabel={lang('Redo')}
              iconName="redo"
              disabled={!richEditor.canRedo}
              onClick={richEditor.redo}
            />
          </div>
          <Button
            round
            faded
            size="smaller"
            className={buildClassName('rich-editor-button', !canToggleRichInput() && 'rich-editor-button-hidden')}
            color="translucent"
            ariaLabel={lang(isRichInputExpansionActive() ? 'AriaComposerCloseRichInput' : 'AriaComposerOpenRichInput')}
            iconName={isRichInputExpansionActive() ? 'collapse' : 'expand'}
            tabIndex={canToggleRichInput() ? 0 : -1}
            disabled={isRichInputExpansionActive() && hasRichMediaBlocking()}
            onClick={isRichInputExpansionActive() ? collapseRichInput : handleOpenRichInput}
          />
          <Button
            round
            faded
            size="smaller"
            className={buildClassName(
              'ai-composer-button',
              (!shouldShowAiButton() || isRichInputExpansionActive()) && 'ai-composer-button-hidden',
            )}
            color="translucent"
            ariaLabel={lang('AiMessageEditor')}
            iconName="ai"
            tabIndex={shouldShowAiButton() && !isRichInputExpansionActive() ? 0 : -1}
            onClick={handleOpenAiEditor}
          />
          <MessageInput
            ref={(el) => {
              inputRef = el;
            }}
            id={props.inputId}
            editableInputId={props.editableInputId}
            richEditor={richEditor}
            tooltips={richEditorTooltips()}
            isStoryInput={isInStoryViewer()}
            chatId={props.chatId}
            canSendPlainText={!isComposerBlocked()}
            isRichInputExpanded={isRichInputExpansionActive()}
            threadId={props.threadId}
            isActive={!hasAttachments()}
            placeholder={placeholder()}
            forcedPlaceholder={inlineBotHelp()}
            canAutoFocus={Boolean(
              props.isReady && props.isForCurrentMessageList && !hasAttachments() && isInMessageList(),
            )}
            noFocusInterception={hasAttachments()}
            shouldSuppressFocus={props.isMobile && isSymbolMenuOpen()}
            onRichInputCollapse={collapseRichInput}
            onRichInputExpand={handleOpenRichInput}
            onOpenAiEditor={shouldShowAiButton() ? handleOpenAiEditor : undefined}
            onSend={onSend()}
            onSuppressedFocus={closeSymbolMenu}
            onMediaEdit={handleRichMediaEdit}
            onMediaFiles={handleRichMediaFiles}
            onFocus={markInputHasFocus}
            onBlur={unmarkInputHasFocus}
            isNeedPremium={isNeedPremium()}
            messageListType={props.messageListType}
            isRichOnlyContent={hasRichOnlyContent()}
            maxLength={
              props.isCurrentUserPremium || hasRichOnlyContent() ? props.richMessageLengthLimit : props.maxMessageLength
            }
          />
          <Show when={isInMessageList() && !isRichInputExpansionActive()}>
            <Show when={props.isInlineBotLoading}>
              <Spinner color="gray" />
            </Show>
            {/* Deviation: the slides render by key (tt passed the JSX of the current render and teact kept the
            children of the outgoing slide): key 0 (no input content) holds the action buttons, key 1 is empty; the
            silent-posting button renders its icon and label from its own slide key. */}
            <Transition
              className="composer-action-buttons-container"
              slideClassName="composer-action-buttons"
              activeKey={Number(hasInputContent())}
              direction="inverse"
              name="slideFadeAndroid"
            >
              {(slide) => (
                <Show when={!slide.key}>
                  <Show when={props.isChannel}>
                    <Transition
                      className="composer-action-button"
                      name="reveal"
                      activeKey={Number(props.isSilentPosting)}
                    >
                      {(silentSlide) => (
                        <Button
                          round
                          faded
                          className="composer-action-button"
                          color="translucent"
                          onClick={handleToggleSilentPosting}
                          ariaLabel={lang(
                            silentSlide.key ? 'AriaComposerSilentPostingDisable' : 'AriaComposerSilentPostingEnable',
                          )}
                          iconName={silentSlide.key ? 'mute' : 'unmute'}
                        />
                      )}
                    </Transition>
                  </Show>
                  <Show when={props.withScheduledButton}>
                    <Button
                      round
                      faded
                      className="composer-action-button scheduled-button"
                      color="translucent"
                      onClick={handleAllScheduledClick}
                      ariaLabel={lang('AriaComposerOpenScheduled')}
                      iconName="schedule"
                    />
                  </Show>
                  <Show when={Boolean(props.autoDeletePeriod)}>
                    <Button
                      round
                      faded
                      className="composer-action-button"
                      color="translucent"
                      onClick={handleAutoDeleteClick}
                      ariaLabel={lang('AutoDeleteSetInfo', { time: formatCountdown(lang, props.autoDeletePeriod!) })}
                    >
                      <AutoDeleteOutlinedIcon period={props.autoDeletePeriod!} />
                    </Button>
                  </Show>
                  <Show when={shouldShowGiftButton()}>
                    <Button
                      round
                      faded
                      className="composer-action-button"
                      color="translucent"
                      onClick={handleGiftClick}
                      iconName="gift"
                    />
                  </Show>
                  <Show when={shouldShowSuggestedPostButton()}>
                    <Button
                      round
                      faded
                      className="composer-action-button"
                      color="translucent"
                      onClick={handleSuggestPostClick}
                      iconName="cash-circle"
                    />
                  </Show>
                  <Show when={Boolean(props.botKeyboardMessageId) && !activeRecording() && !props.editingMessage}>
                    <ResponsiveHoverButton
                      className={buildClassName('composer-action-button', isBotKeyboardOpen() && 'activated')}
                      round
                      color="translucent"
                      noClickActivation
                      onActivate={openBotKeyboard}
                      ariaLabel={lang('AriaComposerBotKeyboard')}
                    >
                      <Icon name="bot-command" />
                    </ResponsiveHoverButton>
                    <Show when={!props.isMobile}>
                      <BotKeyboardMenu
                        messageId={props.botKeyboardMessageId!}
                        threadId={props.threadId}
                        isOpen={isBotKeyboardOpen()}
                        onClose={closeBotKeyboard}
                      />
                    </Show>
                  </Show>
                </Show>
              )}
            </Transition>
          </Show>
          <Show when={shouldRenderVoiceRecordBar() && renderedRecording()}>
            <VoiceRecordBar
              ref={voiceRecordBarRef}
              recording={renderedRecording()!}
              isVideo={Boolean(activeVideoRecording())}
              isPaused={
                activeVideoRecording() ? isVideoRecordingPaused() || isRecordingFinished() : isRecordingPaused()
              }
              canSendOneTimeMedia={props.canSendOneTimeMedia}
              isViewOnceEnabled={isViewOnceEnabled()}
              onPause={activeVideoRecording() ? pauseRecordingVideo : pauseRecordingVoice}
              onResume={activeVideoRecording() ? resumeRecordingVideo : resumeRecordingVoice}
              onCancel={activeVideoRecording() ? discardRecordingVideo : cancelRecordingVoice}
              onToggleViewOnce={toggleViewOnceEnabled}
              subscribeToPeaks={activeVideoRecording() ? subscribeToVideoRecordingPeaks : subscribeToRecordingPeaks}
            />
          </Show>
          <Show when={shouldRenderRoundVideoRecorder()}>
            <RoundVideoRecorder
              ref={roundVideoRecorderRef}
              previewStream={renderedPreviewStream()}
              isReady={isVideoRecordingReady()}
              isPaused={isVideoRecordingPaused()}
              isFrozen={isRecordingFinished()}
              getProgress={getProgress}
              getPlaybackEl={renderedVideoRecording()?.getPlaybackEl}
            />
          </Show>
          <Show
            when={
              (!isComposerBlocked() || canSendGifs() || canSendStickers()) && !isNeedPremium() && !props.isAccountFrozen
            }
          >
            <SymbolMenuButton
              chatId={props.chatId}
              threadId={props.threadId}
              isMobile={props.isMobile}
              isReady={props.isReady}
              isSymbolMenuOpen={isSymbolMenuOpen()}
              openSymbolMenu={openSymbolMenu}
              closeSymbolMenu={closeSymbolMenu}
              canSendStickers={canSendStickers()}
              canSendGifs={canSendGifs()}
              isMessageComposer={isInMessageList()}
              onGifSelect={handleGifSelect}
              onGifAddCaption={hasRichOnlyContent() ? undefined : handleGifAddCaption}
              onStickerSelect={handleStickerSelect}
              onCustomEmojiSelect={handleCustomEmojiSelect}
              onRemoveSymbol={removeSymbol}
              onEmojiSelect={insertTextAndUpdateCursor}
              closeBotCommandMenu={closeBotCommandMenu}
              closeSendAsMenu={closeSendAsMenu}
              isSymbolMenuForced={isSymbolMenuForced()}
              canSendPlainText={!isComposerBlocked()}
              inputCssSelector={props.editableInputCssSelector}
              idPrefix={props.type}
              forceDarkTheme={isInStoryViewer()}
            />
          </Show>
          <Show when={isInStoryViewer() && !activeRecording()}>
            <Button
              round
              className="composer-action-button story-reaction-button"
              color="translucent"
              onClick={handleLikeStory}
              onContextMenu={handleStoryPickerContextMenu}
              onMouseDown={handleBeforeStoryPickerContextMenu}
              ariaLabel={oldLang('AccDescrLike')}
              ref={(el) => {
                storyReactionRef = el as HTMLButtonElement;
              }}
            >
              <Show when={props.sentStoryReaction && getReactionKey(props.sentStoryReaction)} keyed>
                {(_reactionKey) => (
                  <ReactionAnimatedEmoji
                    containerId={getStoryKey(props.chatId, props.storyId!)}
                    reaction={props.sentStoryReaction!}
                    withEffectOnly={isSentStoryReactionHeart()}
                  />
                )}
              </Show>
              <Show when={!props.sentStoryReaction || isSentStoryReactionHeart()}>
                <Icon
                  name={isSentStoryReactionHeart() ? 'heart' : 'heart-outline'}
                  className={buildClassName(isSentStoryReactionHeart() && 'story-reaction-heart')}
                />
              </Show>
            </Button>
          </Show>
          <Show when={props.isMobile && isInMessageList() && Boolean(props.botKeyboardMessageId)}>
            <BotKeyboardMenu
              messageId={props.botKeyboardMessageId!}
              threadId={props.threadId}
              isOpen={isBotKeyboardOpen()}
              onClose={closeBotKeyboard}
            />
          </Show>
          <Show when={isInMessageList() && props.botCommands}>
            <BotCommandMenu
              isOpen={isBotCommandMenuOpen()}
              botCommands={props.botCommands || []}
              onClose={closeBotCommandMenu}
            />
          </Show>
        </div>
      </div>
      <Button
        ref={(el) => {
          mainButtonEl = el as HTMLButtonElement;
          mainButtonRef.current = mainButtonEl;
        }}
        round
        color={isInStoryViewer() ? 'translucent' : 'secondary'}
        className={buildClassName(
          mainButtonState(),
          'main-button',
          !props.isReady && 'not-ready',
          activeRecording() && 'recording',
          isRecordingVideoMode() && 'record-video',
          Boolean(props.paidMessagesStars) && 'has-paid-stars',
          isPaidSend() && 'paid',
        )}
        disabled={areRecordingsNotAllowed() || hasRichMediaBlocking()}
        allowDisabledClick
        noFastClick
        ariaLabel={mainButtonState() === MainButtonState.Stop ? lang('BotDraftStop') : oldLang(sendButtonAriaLabel())}
        onClick={mainButtonHandler}
        onContextMenu={mainButtonContextMenuHandler()}
      >
        <Icon name="new-send" className="main-button-state-icon" />
        <Show when={isInMessageList()}>
          <Icon name="stop-square" className="main-button-state-icon" />
        </Show>
        <Icon
          name={isInStoryViewer() ? 'microphone-outline' : 'microphone'}
          className="main-button-state-icon main-button-microphone"
        />
        <Icon name="round-video" className="main-button-state-icon" />
        <Show when={props.onForward}>
          <Icon name="forward" className="main-button-state-icon" />
        </Show>
        <Show when={isInMessageList()}>
          <Icon name="schedule" className="main-button-state-icon" />
          <Icon name="check" className="main-button-state-icon" />
        </Show>
        <Show when={shouldRenderPaidStars()}>
          <div
            ref={(el) => {
              paidStarsRef(el);
              paidStarsEl = el;
            }}
            class="paidStars"
          >
            <Icon name="star" />
            <AnimatedCounter text={lang.number(starsForAllMessages())} />
          </div>
        </Show>
      </Button>
      <Show when={effectEmoji()}>
        <span class="effect-icon" onClick={handleRemoveEffect}>
          {renderText(effectEmoji() || '')}
        </span>
      </Show>
      <Show when={props.effect && props.canPlayEffect}>
        <MessageEffect shouldPlay={props.shouldPlayEffect} effect={props.effect!} onStop={handleStopEffect} />
      </Show>
      <Show when={canShowCustomSendMenu()}>
        <CustomSendMenu
          isOpen={isCustomSendMenuOpen()}
          canSchedule={canSchedule() && isInMessageList() && !isViewOnceEnabled()}
          canScheduleUntilOnline={canSchedule() && props.canScheduleUntilOnline && !isViewOnceEnabled()}
          onSendSilent={!props.isChatWithSelf ? handleSendSilent : undefined}
          onSendSchedule={!props.isInScheduledList ? handleSendScheduled : undefined}
          onSendWhenOnline={handleSendWhenOnline}
          onRemoveEffect={handleRemoveEffect}
          onClose={handleContextMenuClose}
          onCloseAnimationEnd={handleContextMenuHide}
          isSavedMessages={props.isChatWithSelf}
          chatId={props.chatId}
          withEffects={props.areEffectsSupported}
          hasCurrentEffect={Boolean(props.effect)}
          effectReactions={props.effectReactions}
          allAvailableReactions={props.availableReactions}
          onToggleReaction={handleToggleEffectReaction}
          isCurrentUserPremium={props.isCurrentUserPremium}
          isInSavedMessages={props.isChatWithSelf}
          isInStoryViewer={isInStoryViewer()}
          canPlayAnimatedEmojis={props.canPlayAnimatedEmojis}
        />
      </Show>
      <Show when={canSwitchRecordMode()}>
        <RecordModeMenu
          isOpen={isRecordModeMenuOpen()}
          onSelectMode={handleSelectRecordMode}
          onClose={handleRecordModeMenuClose}
          onCloseAnimationEnd={handleRecordModeMenuHide}
        />
      </Show>
      {calendar}
      <PaymentMessageConfirmDialog
        isOpen={props.paymentMessageConfirmDialogKey === paymentDialogKey() && Boolean(props.paidMessagesStars)}
        onClose={closeConfirmModalPayForMessage}
        userName={props.chat ? getPeerTitle(lang, props.chat) : undefined}
        messagePriceInStars={props.paidMessagesStars || 0}
        messagesCount={messagesCount()}
        shouldAutoApprove={shouldPaidMessageAutoApprove()}
        setAutoApprove={setShouldPaidMessageAutoApprove}
        confirmHandler={paymentMessageConfirmDialogHandler}
      />
      <Show when={isInMessageList()}>
        <RemoveFormattingModal
          isOpen={isRemoveFormattingModalOpen()}
          onClose={handleCloseRemoveFormattingModal}
          onCloseAnimationEnd={handleRemoveFormattingModalCloseAnimationEnd}
          onRemoveFormatting={handleRemoveFormatting}
          onSubscribeToPremium={handleSubscribeToPremium}
        />
      </Show>
    </div>
  );
};

const mapStateToProps = (
  global: GlobalState,
  { chatId, threadId, storyId, messageListType, isMobile, type }: OwnProps,
): StateProps => {
  const chat = selectChat(global, chatId);
  const chatBot = !isSystemBot(chatId) ? selectBot(global, chatId) : undefined;
  const isChatWithBot = Boolean(chatBot);
  const isChatWithSelf = selectIsChatWithSelf(global, chatId);
  const isChatWithUser = isUserId(chatId);
  const userFullInfo = isChatWithUser ? selectUserFullInfo(global, chatId) : undefined;
  const paidMessagesStars = selectPeerPaidMessagesStars(global, chatId);

  const chatFullInfo = !isChatWithUser ? selectChatFullInfo(global, chatId) : undefined;
  const messageWithActualBotKeyboard =
    (isChatWithBot || !isChatWithUser) && selectNewestMessageWithBotKeyboardButtons(global, chatId, threadId);
  const {
    shouldSuggestStickers,
    shouldSuggestCustomEmoji,
    shouldUpdateStickerSetOrder,
    shouldPaidMessageAutoApprove,
    lastRecordMessageMode,
  } = global.settings.byKey;
  const { language, shouldCollectDebugLogs } = selectSharedSettings(global);
  const {
    forwardMessages: { messageIds: forwardMessageIds },
    messageMediaEditorRequest,
  } = selectTabState(global);
  const mediaEditorMessage =
    messageMediaEditorRequest && messageMediaEditorRequest.chatId === chatId
      ? selectChatMessage(global, chatId, messageMediaEditorRequest.messageId)
      : undefined;
  const baseEmojiKeywords = global.emojiKeywords[BASE_EMOJI_KEYWORD_LANG];
  const emojiKeywords = language !== BASE_EMOJI_KEYWORD_LANG ? global.emojiKeywords[language] : undefined;
  const botKeyboardMessageId = messageWithActualBotKeyboard ? messageWithActualBotKeyboard.id : undefined;
  const keyboardMessage = botKeyboardMessageId
    ? selectChatMessageOrEphemeral(global, chatId, botKeyboardMessageId)
    : undefined;
  const { currentUserId } = global;
  const currentUser = selectUser(global, currentUserId!)!;
  const defaultSendAsId = chatFullInfo ? chatFullInfo?.sendAsId || currentUserId : undefined;
  const sendAsId = defaultSendAsId;
  const sendAsPeer = sendAsId ? selectPeer(global, sendAsId) : undefined;
  const requestedDraft = selectRequestedDraft(global, chatId);
  const requestedDraftFiles = selectRequestedDraftFiles(global, chatId);

  const tabState = selectTabState(global);
  const isStoryViewerOpen = Boolean(tabState.storyViewer.storyId);

  const currentMessageList = selectCurrentMessageList(global);
  const isForCurrentMessageList =
    chatId === currentMessageList?.chatId &&
    threadId === currentMessageList?.threadId &&
    messageListType === currentMessageList?.type &&
    !isStoryViewerOpen;
  const user = selectUser(global, chatId);
  const canSendVoiceByPrivacy = (user && !userFullInfo?.noVoiceMessages) ?? true;
  const slowMode = chatFullInfo?.slowMode;
  const isCurrentUserPremium = selectIsCurrentUserPremium(global);

  const editingDraft =
    messageListType === 'scheduled'
      ? selectEditingScheduledDraft(global, chatId)
      : selectEditingDraft(global, chatId, threadId);

  const story = storyId && selectPeerStory(global, chatId, storyId);
  const sentStoryReaction = story && 'sentReaction' in story ? story.sentReaction : undefined;
  const draft = selectDraft(global, chatId, threadId);
  const replyToMessage = draft?.replyInfo ? selectChatMessage(global, chatId, draft.replyInfo.replyToMsgId) : undefined;
  const replyToTopic =
    chat?.isForum && chat.isForumAsMessages && threadId === MAIN_THREAD_ID && replyToMessage
      ? selectTopicFromMessage(global, replyToMessage)
      : undefined;
  const isInScheduledList = messageListType === 'scheduled';

  const canSendQuickReplies = isChatWithUser && !isChatWithBot && !isInScheduledList && !isChatWithSelf;

  const noWebPage = selectNoWebPage(global, chatId, threadId);
  const isSilentPosting =
    chat &&
    getChatNotifySettings(chat, selectNotifyDefaults(global), selectNotifyException(global, chatId))?.isSilentPosting;

  const areEffectsSupported =
    isChatWithUser &&
    !isChatWithBot &&
    !isInScheduledList &&
    !isChatWithSelf &&
    type !== 'story' &&
    chatId !== SERVICE_NOTIFICATIONS_USER_ID;
  const canPlayEffect = selectPerformanceSettingsValue(global, 'stickerEffects');
  const shouldPlayEffect = tabState.shouldPlayEffectInComposer;
  const effectId = areEffectsSupported && draft?.effectId;
  const effect = effectId ? global.availableEffectById[effectId] : undefined;
  const effectReactions = global.reactions.effectReactions;

  const maxMessageLength = selectCurrentLimit(global, 'messageLength');
  const isForwarding = chatId === tabState.forwardMessages.toChatId;
  const isReplying = Boolean(draft?.replyInfo);
  const hasSuggestedPost = Boolean(draft?.suggestedPostInfo);
  const starsBalance = global.stars?.balance.amount || 0;
  const isStarsBalanceModalOpen = Boolean(tabState.starsBalanceModal);
  const isAccountFrozen = selectIsCurrentUserFrozen(global);
  const isAppConfigLoaded = global.isAppConfigLoaded;
  const insertingPeerIdMention = tabState.insertingPeerIdMention;

  const webPagePreview = tabState.webPagePreviewId ? selectWebPage(global, tabState.webPagePreviewId) : undefined;

  const canManageAutoDelete =
    type === 'messageList' &&
    messageListType === 'thread' &&
    threadId === MAIN_THREAD_ID &&
    selectCanManageAutoDelete(global, chatId);
  const autoDeletePeriod = canManageAutoDelete ? selectChatHistoryTtl(global, chatId) : undefined;

  return {
    availableReactions: global.reactions.availableReactions,
    topReactions: type === 'story' ? global.reactions.topReactions : undefined,
    isOnActiveTab: !tabState.isBlurred,
    recordMode: lastRecordMessageMode ?? 'voice',
    editingMessage: selectEditingMessage(global, chatId, threadId, messageListType),
    draft,
    chat,
    user,
    isChatWithBot,
    isChatWithSelf,
    canSendMoney: selectCanSendMoneyToUser(global, chatId),
    isForCurrentMessageList,
    canScheduleUntilOnline: selectCanScheduleUntilOnline(global, chatId),
    isChannel: chat ? isChatChannel(chat) : undefined,
    isRightColumnShown: selectIsRightColumnShown(global, isMobile),
    isSelectModeActive: selectIsInSelectMode(global),
    withScheduledButton: messageListType === 'thread' && (userFullInfo || chatFullInfo)?.hasScheduledMessages,
    autoDeletePeriod: autoDeletePeriod || undefined,
    isInScheduledList,
    botKeyboardMessageId,
    botKeyboardPlaceholder: keyboardMessage?.keyboardPlaceholder,
    isForwarding,
    isReplying,
    hasSuggestedPost,
    forwardedMessagesCount: isForwarding ? forwardMessageIds!.length : undefined,
    todoListModal: tabState.todoListModal,
    aiMessageEditorPendingResult: tabState.aiMessageEditorPendingResult,
    chatFullInfo,
    topInlineBotIds: global.topPeerCategories.botsInline?.peerIds,
    topGuestBotIds: global.topPeerCategories.botsGuestChat?.peerIds,
    currentUserId,
    currentUser,
    contentToBeScheduled: tabState.contentToBeScheduled,
    shouldSuggestStickers,
    shouldSuggestCustomEmoji,
    shouldUpdateStickerSetOrder,
    recentEmojis: global.recentEmojis,
    baseEmojiKeywords: baseEmojiKeywords?.keywords,
    emojiKeywords: emojiKeywords?.keywords,
    inlineBots: tabState.inlineBots.byUsername,
    isInlineBotLoading: tabState.inlineBots.isLoading,
    botCommands: userFullInfo ? userFullInfo.botInfo?.commands || false : undefined,
    botMenuButton: userFullInfo?.botInfo?.menuButton,
    sendAsPeer,
    sendAsId,
    editingDraft,
    requestedDraft,
    requestedDraftFiles,
    requestedRichInputMedia: type === 'messageList' ? tabState.requestedRichInputMedia : undefined,
    attachBots: global.attachMenu.bots,
    attachMenuPeerType: selectChatType(global, chatId),
    theme: selectTheme(global),
    fileSizeLimit: selectCurrentLimit(global, 'uploadMaxFileparts') * MAX_UPLOAD_FILEPART_SIZE,
    captionLimit: selectCurrentLimit(global, 'captionLength'),
    isCurrentUserPremium,
    canSendVoiceByPrivacy,
    attachmentSettings: global.attachmentSettings,
    slowMode,
    currentMessageList,
    isReactionPickerOpen: selectIsReactionPickerOpen(global),
    canBuyPremium: !isCurrentUserPremium && !selectIsPremiumPurchaseBlocked(global),
    canPlayAnimatedEmojis: selectCanPlayAnimatedEmojis(global),
    canSendOneTimeMedia: !isChatWithSelf && isChatWithUser && !isChatWithBot && !isInScheduledList,
    shouldCollectDebugLogs,
    sentStoryReaction,
    stealthMode: global.stories.stealthMode,
    replyToTopic,
    quickReplyMessages: global.quickReplies.messagesById,
    quickReplies: global.quickReplies.byId,
    canSendQuickReplies,
    noWebPage,
    webPagePreview,
    isContactRequirePremium: userFullInfo?.isContactRequirePremium,
    effect,
    effectReactions,
    areEffectsSupported,
    canPlayEffect,
    shouldPlayEffect,
    maxMessageLength,
    richMessageLengthLimit: global.appConfig.richMessageLengthLimit,
    richMessageMaxBlocks: global.appConfig.richMessageMaxBlocks,
    richMessageMaxDepth: global.appConfig.richMessageMaxDepth,
    richMessageMaxMedia: global.appConfig.richMessageMaxMedia,
    richMessageMaxTableColumns: global.appConfig.richMessageMaxTableColumns,
    paidMessagesStars,
    shouldPaidMessageAutoApprove,
    isSilentPosting,
    paymentMessageConfirmDialogKey: tabState.paymentMessageConfirmDialogKey,
    starsBalance,
    isStarsBalanceModalOpen,
    shouldDisplayGiftsButton: userFullInfo?.shouldDisplayGiftsButton,
    disallowedGifts: userFullInfo?.disallowedGifts,
    isAccountFrozen,
    isAppConfigLoaded,
    insertingPeerIdMention,
    isRichInputExpanded: tabState.isRichInputExpanded,
    stoppableTypingDraftId: selectStoppableTypingDraftId(global, chatId, threadId),
    mediaEditorMessage,
  };
};

export default Composer;
