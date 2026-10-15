import { createEffect, createMemo, createSignal, onDestroy, previous } from 'frameact';
import { getActions, withGlobal } from '../../../global';
import { depsOf } from '../../../util/effectDeps';
import { createShowTransition } from '../../../lib/kit';
import type { GlobalState } from '../../../global/types';

import type {
  ApiAvailableEffect,
  ApiAvailableReaction,
  ApiChat,
  ApiChatMember,
  ApiKeyboardButton,
  ApiMessage,
  ApiMessageOutgoingStatus,
  ApiMessagePoll,
  ApiPeer,
  ApiReaction,
  ApiReactionKey,
  ApiSavedReactionTag,
  ApiThreadInfo,
  ApiTopic,
  ApiTypeStory,
  ApiUser,
  ApiWebPage,
} from '../../../api/types';
import type {
  ActiveEmojiInteraction,
  ChatTranslatedMessages,
  FocusDirection,
  IAlbum,
  IDocumentGroup,
  MessageListType,
  ScrollTargetPosition,
  TextSummary,
  ThemeKey,
  ThreadId,
  TranslationTone,
} from '../../../types';
import type { Signal } from '../../../util/signals';
import { MAIN_THREAD_ID } from '../../../api/types';

import { EMOJI_STATUS_LOOP_LIMIT, MESSAGE_APPEARANCE_DELAY } from '../../../config';
import {
  areReactionsEmpty,
  extractMessageText,
  getAllowedAttachmentOptions,
  getCanReplyToEphemeralMessage,
  getIsDownloading,
  getMainUsername,
  getMessageContent,
  getMessageCustomShape,
  getMessageHtmlId,
  getMessageSingleCustomEmoji,
  getMessageSingleRegularEmoji,
  getMessageWebPage,
  hasMessageText,
  hasMessageTtl,
  isAnonymousForwardsChat,
  isAnonymousOwnMessage,
  isChatChannel,
  isChatGroup,
  isChatPublic,
  isGeoLiveExpired,
  isMessageLocal,
  isMessageLocalOnly,
  isMessageTranslatable,
  isOwnMessage,
  isReplyToMessage,
  isSystemBot,
} from '../../../global/helpers';
import { getPeerFullTitle, getPeerTitle } from '../../../global/helpers/peers';
import { getEphemeralReplyInfo, getMessageReplyInfo, getStoryReplyInfo } from '../../../global/helpers/replies';
import {
  selectActiveDownloads,
  selectAnimatedEmoji,
  selectCanAutoLoadMedia,
  selectCanAutoPlayMedia,
  selectCanForwardMessage,
  selectCanReplyToMessage,
  selectChat,
  selectChatFullInfo,
  selectChatMessage,
  selectChatTranslations,
  selectCurrentMiddleSearch,
  selectDefaultReaction,
  selectEphemeralOutgoingStatus,
  selectForwardedSender,
  selectFullWebPageFromMessage,
  selectIsChatRestricted,
  selectIsChatWithBot,
  selectIsChatWithSelf,
  selectIsCurrentUserFrozen,
  selectIsCurrentUserPremium,
  selectIsDocumentGroupSelected,
  selectIsInSelectMode,
  selectIsMessageFocused,
  selectIsMessageProtected,
  selectIsMessageSelected,
  selectMessageSummary,
  selectOutgoingStatus,
  selectPeer,
  selectPeerStory,
  selectPerformanceSettingsValue,
  selectPollFromMessage,
  selectReplyMessage,
  selectRequestedChatTranslationLanguage,
  selectRequestedChatTranslationTone,
  selectRequestedMessageTranslationLanguage,
  selectSender,
  selectSenderFromHeader,
  selectShouldDetectChatLanguage,
  selectShouldLoopStickers,
  selectTabState,
  selectTheme,
  selectTopicFromMessage,
  selectUploadProgress,
  selectUser,
} from '../../../global/selectors';
import {
  selectIsMediaNsfw,
  selectMessageDownloadableMedia,
  selectMessageLastPlaybackTimestamp,
  selectMessageTimestampableDuration,
} from '../../../global/selectors/media';
import { selectSharedSettings } from '../../../global/selectors/sharedState';
import { selectThreadInfo, selectThreadReadState } from '../../../global/selectors/threads';
import { IS_TAURI } from '../../../util/browser/globalEnvironment';
import { IS_ANDROID, IS_TRANSLATION_SUPPORTED } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import buildStyle from '../../../util/buildStyle';
import { isUserId } from '../../../util/entities/ids';
import { getMessageKey } from '../../../util/keys/messageKey';
import { parseTranslationCacheKey } from '../../../util/keys/translationKey';
import { getServerTime } from '../../../util/serverTime';
import stopEvent from '../../../util/stopEvent';
import { isElementInViewport } from '../../../util/visibility/isElementInViewport';
import { getStickerDimensions, REM } from '../../common/helpers/mediaDimensions';
import renderText from '../../common/helpers/renderText';
import { getCustomEmojiSize } from '../composer/helpers/customEmoji';
import { buildContentClassName } from './helpers/buildContentClassName';
import getSingularPaidMedia from './helpers/getSingularPaidMedia';

import useAppLayout from '../../../hooks/useAppLayout';
import useContextMenuHandlers from '../../../hooks/useContextMenuHandlers';
import useEnsureMessage from '../../../hooks/useEnsureMessage';
import useEnsureStory from '../../../hooks/useEnsureStory';
import useFlag from '../../../hooks/useFlag';
import { useOnIntersect } from '../../../hooks/useIntersectionObserver';
import useLang from '../../../hooks/useLang';
import useOldLang from '../../../hooks/useOldLang';
import usePeerColor from '../../../hooks/usePeerColor';
import useTextLanguage from '../../../hooks/useTextLanguage';
import useDetectChatLanguage from './hooks/useDetectChatLanguage';
import useFocusMessageListElement from './hooks/useFocusMessageListElement';
import useInnerHandlers from './hooks/useInnerHandlers';
import useMessageReadMetrics from './hooks/useMessageReadMetrics';
import useMessageTranslation from './hooks/useMessageTranslation';
import useOuterHandlers from './hooks/useOuterHandlers';

import Audio from '../../common/Audio';
import Avatar from '../../common/Avatar';
import BadgeButton from '../../common/BadgeButton';
import CustomEmoji from '../../common/CustomEmoji';
import Document from '../../common/Document';
import DotAnimation from '../../common/DotAnimation';
import EmbeddedMessage from '../../common/embedded/EmbeddedMessage';
import EmbeddedStory from '../../common/embedded/EmbeddedStory';
import FakeIcon from '../../common/FakeIcon';
import Icon from '../../common/icons/Icon';
import StarIcon from '../../common/icons/StarIcon';
import MessageRichText from '../../common/MessageRichText';
import MessageText from '../../common/MessageText';
import PeerColorWrapper from '../../common/PeerColorWrapper';
import RankBadge from '../../common/RankBadge';
import ReactionStaticEmoji from '../../common/reactions/ReactionStaticEmoji';
import Sparkles from '../../common/Sparkles';
import { animateSnap } from '../../main/visualEffects/SnapEffectContainer';
import Button from '../../ui/Button';
import ConfirmDialog from '../../ui/ConfirmDialog';
import InputText from '../../ui/InputText';
import Album from './Album';
import AnimatedCustomEmoji from './AnimatedCustomEmoji';
import AnimatedEmoji from './AnimatedEmoji';
import CommentButton from './CommentButton';
import Contact from './Contact';
import ContextMenuContainer from './ContextMenuContainer.async';
import DiceWrapper from './dice/DiceWrapper';
import FactCheck from './FactCheck';
import Game from './Game';
import Giveaway from './Giveaway';
import InlineButtons from './InlineButtons';
import Invoice from './Invoice';
import InvoiceMediaPreview from './InvoiceMediaPreview';
import Location from './Location';
import MessageAppendix from './MessageAppendix';
import MessageEffect from './MessageEffect';
import MessageMeta from './MessageMeta';
import MessagePhoneCall from './MessagePhoneCall';
import PaidMediaOverlay from './PaidMediaOverlay';
import Photo from './Photo';
import Poll from './poll/Poll';
import Reactions from './reactions/Reactions';
import RoundVideo from './RoundVideo';
import Sticker from './Sticker';
import Story from './Story';
import StoryMention from './StoryMention';
import TodoList from './TodoList';
import Video from './Video';
import WebPage from './WebPage';

import './Message.scss';

type MessagePositionProperties = {
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  isFirstInDocumentGroup: boolean;
  isLastInDocumentGroup: boolean;
  isLastInList: boolean;
};

type OwnProps = {
  message: ApiMessage;
  album?: IAlbum;
  documentGroup?: IDocumentGroup;
  noAvatars?: boolean;
  withAvatar?: boolean;
  withSenderName?: boolean;
  threadId: ThreadId;
  messageListType: MessageListType;
  noComments: boolean;
  noReplies: boolean;
  appearanceOrder: number;
  isJustAdded: boolean;
  isThreadTop?: boolean;
  shouldIgnoreSendFocus?: boolean;
  isQuickPreview?: boolean;
  memoFirstUnreadIdRef?: { current: number | undefined };
  getIsMessageListReady?: Signal<boolean>;
  containerRef?: (el: HTMLDivElement) => void;
  isMessageListActive?: boolean;
  observeIntersectionForBottom?: ObserveFn;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  onMessageUnmount?: (messageId: number) => void;
} & MessagePositionProperties;

type StateProps = {
  theme: ThemeKey;
  forceSenderName?: boolean;
  sender?: ApiPeer;
  canShowSender: boolean;
  originSender?: ApiPeer;
  botSender?: ApiUser;
  ephemeralBot?: ApiUser;
  shouldHideReply?: boolean;
  replyMessage?: ApiMessage;
  replyMessageSender?: ApiPeer;
  replyMessageForwardSender?: ApiPeer;
  replyMessageChat?: ApiChat;
  isReplyPrivate?: boolean;
  replyStory?: ApiTypeStory;
  storySender?: ApiPeer;
  outgoingStatus?: ApiMessageOutgoingStatus;
  uploadProgress?: number;
  isInDocumentGroup: boolean;
  isProtected?: boolean;
  canForward?: boolean;
  isFocused?: boolean;
  focusDirection?: FocusDirection;
  focusedQuote?: string;
  focusedQuoteOffset?: number;
  noFocusHighlight?: boolean;
  scrollTargetPosition?: ScrollTargetPosition;
  isResizingContainer?: boolean;
  isForwarding?: boolean;
  isChatWithSelf?: boolean;
  isBotForum?: boolean;
  isRepliesChat?: boolean;
  isAnonymousForwards?: boolean;
  isChannel?: boolean;
  isGroup?: boolean;
  canReply?: boolean;
  highlight?: string;
  animatedEmoji?: string;
  animatedCustomEmoji?: string;
  hasActiveReactions?: boolean;
  isInSelectMode?: boolean;
  isSelected?: boolean;
  isGroupSelected?: boolean;
  isDownloading?: boolean;
  threadId?: ThreadId;
  isPinnedList?: boolean;
  isPinned?: boolean;
  isMessagePrimaryEditedDateEnabled: boolean;
  canAutoLoadMedia?: boolean;
  canAutoPlayMedia?: boolean;
  hasLinkedChat?: boolean;
  shouldLoopStickers?: boolean;
  autoLoadFileMaxSizeMb: number;
  repliesThreadInfo?: ApiThreadInfo;
  reactionMessage?: ApiMessage;
  availableReactions?: ApiAvailableReaction[];
  defaultReaction?: ApiReaction;
  activeEmojiInteractions?: ActiveEmojiInteraction[];
  hasUnreadReaction?: boolean;
  hasUnreadPollVote?: boolean;
  isTranscribing?: boolean;
  transcribedText?: string;
  isPremium: boolean;
  senderChatMember?: ApiChatMember;
  messageTopic?: ApiTopic;
  chatTranslations?: ChatTranslatedMessages;
  areTranslationsEnabled?: boolean;
  shouldDetectChatLanguage?: boolean;
  requestedTranslationLanguage?: string;
  requestedChatTranslationLanguage?: string;
  requestedTranslationTone?: TranslationTone;
  withAnimatedEffects?: boolean;
  canAnimateTextStreaming?: boolean;
  webPageStory?: ApiTypeStory;
  isConnected: boolean;
  isLoadingComments?: boolean;
  shouldWarnAboutFiles?: boolean;
  senderBoosts?: number;
  tags?: Record<ApiReactionKey, ApiSavedReactionTag>;
  canTranscribeVoice?: boolean;
  viaBusinessBot?: ApiUser;
  guestFromSender?: ApiPeer;
  effect?: ApiAvailableEffect;
  poll?: ApiMessagePoll;
  webPage?: ApiWebPage;
  maxTimestamp?: number;
  lastPlaybackTimestamp?: number;
  paidMessageStars?: number;
  isChatWithUser?: boolean;
  isAccountFrozen?: boolean;
  minFutureTime?: number;
  isMediaNsfw?: boolean;
  isReplyMediaNsfw?: boolean;
  summary?: TextSummary;
  canSendStickers?: boolean;
};

type MetaPosition = 'in-text' | 'standalone' | 'none';
type ReactionsPosition = 'inside' | 'outside' | 'none';
type QuickReactionPosition = 'in-content' | 'in-meta';

const NBSP = '\u00A0';
const QUICK_REACTION_SIZE = 1.75 * REM;
const MAX_REASON_LENGTH = 200;
const MIN_MESSAGE_LENGTH_FOR_WIDE_MEDIA = 40;

const Message = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const {
    toggleMessageSelection,
    clickBotInlineButton,
    clickSuggestedMessageButton,
    rejectSuggestedPost,
    openSuggestedPostApprovalModal,
    disableContextMenuHint,
    animateUnreadReaction,
    focusMessage,
    markTypingDraftDone,
    markMessageListRead,
    markMentionsRead,
    markPollVotesRead,
    openThread,
    summarizeMessage,
  } = getActions();

  let ref!: HTMLDivElement;
  let bottomMarkerRef!: HTMLDivElement;
  let quickReactionRef!: HTMLDivElement;

  const oldLang = useOldLang();
  const lang = useLang();
  const source = createMemo(() => props.message);
  const messageId = () => source().id;
  const chatId = () => source().chatId;
  const forwardInfo = () => source().forwardInfo;
  const viaBotId = () => source().viaBotId;
  const guestChatViaId = () => source().guestChatViaId;
  const isTranscriptionError = () => source().isTranscriptionError;
  const factCheck = () => source().factCheck;
  const isTypingDraft = () => source().isTypingDraft;
  const previousLocalId = () => source().previousLocalId;
  const fromRank = () => source().fromRank;

  const isLocalOnly = createMemo(() => isMessageLocalOnly(props.message));

  const [isTranscriptionHidden, setIsTranscriptionHidden] = createSignal(false);
  const [isPlayingSnapAnimation, setIsPlayingSnapAnimation] = createSignal(false);
  const [isPlayingDeleteAnimation, setIsPlayingDeleteAnimation] = createSignal(false);
  const [shouldPlayEffect, requestEffect, hideEffect] = useFlag();
  const [shouldPlayDiceEffect, requestDiceEffect, hideDiceEffect] = useFlag();
  const [isDeclineDialogOpen, openDeclineDialog, closeDeclineDialog] = useFlag();
  const [isShowingSummary, showSummary, hideSummary] = useFlag();
  const [declineReason, setDeclineReason] = createSignal('');
  const { isMobile, isTouchScreen } = useAppLayout();

  useOnIntersect(() => bottomMarkerRef, () => isTypingDraft() || isLocalOnly() ? undefined : props.observeIntersectionForBottom);

  const contextMenuHandlersResult = createMemo(() => useContextMenuHandlers(
    () => ref,
    () => (isTouchScreen && props.isInSelectMode) || props.isAccountFrozen,
    !IS_TAURI,
    IS_ANDROID,
    () => props.getIsMessageListReady,
  ));
  const isContextMenuOpen = () => contextMenuHandlersResult().isContextMenuOpen;
  const contextMenuAnchor = () => contextMenuHandlersResult().contextMenuAnchor;
  const contextMenuTarget = () => contextMenuHandlersResult().contextMenuTarget;
  const isContextMenuAltKeyPressed = () => contextMenuHandlersResult().isContextMenuAltKeyPressed;
  const handleBeforeContextMenu = () => contextMenuHandlersResult().handleBeforeContextMenu;
  const onContextMenu = () => contextMenuHandlersResult().handleContextMenu;
  const handleContextMenuClose = () => contextMenuHandlersResult().handleContextMenuClose;
  const handleContextMenuHide = () => contextMenuHandlersResult().handleContextMenuHide;

  createEffect(depsOf(() => [isContextMenuOpen(), disableContextMenuHint] as const), ([isContextMenuOpen2]) => {
    if (isContextMenuOpen2) {
      disableContextMenuHint();
    }
  });

  const noAppearanceAnimation = createMemo(() => props.appearanceOrder <= 0 || props.message.shouldSkipTypingAnimation);
  const [isShown, markShown] = useFlag(noAppearanceAnimation());
  createEffect(depsOf(() => [props.appearanceOrder, noAppearanceAnimation()] as const), ([appearanceOrder2, noAppearanceAnimation2]) => {
    if (noAppearanceAnimation2) {
      return;
    }

    // Message appearance animation works only if this timeout is not cleared. Migrate to `sibling-index()` when baseline widely available.
    setTimeout(markShown, appearanceOrder2 * MESSAGE_APPEARANCE_DELAY);
  });

  createShowTransition({
    // TODO(codemod): ref option: hand the result `ref` to the element (ref={t.ref}) instead
    ref: () => ref,
    isOpen: () => isShown() || props.isJustAdded,
    noMountTransition: props.message.shouldSkipTypingAnimation || (noAppearanceAnimation() && !props.isJustAdded),
    className: false,
  });

  onDestroy(() => {
    props.onMessageUnmount?.(messageId());
  });

  const hasSummary = createMemo(() => Boolean(props.message.summaryLanguageCode));

  const isLocal = createMemo(() => isMessageLocal(props.message));
  const isOwn = createMemo(() => isOwnMessage(props.message));
  const isScheduled = createMemo(() => props.messageListType === 'scheduled' || props.message.isScheduled);
  const messageReplyInfo = createMemo(() => getMessageReplyInfo(props.message) || getEphemeralReplyInfo(props.message));
  const isEphemeralReply = createMemo(() => messageReplyInfo()?.type === 'ephemeral');
  const storyReplyInfo = createMemo(() => getStoryReplyInfo(props.message));
  const readMetricsMessage = createMemo(() => props.album?.mainMessage || props.message);
  const canReportReadMetrics =
    createMemo(() => props.messageListType === 'thread' &&
    props.threadId === MAIN_THREAD_ID &&
    !props.isQuickPreview &&
    !isLocal() &&
    !isLocalOnly() &&
    readMetricsMessage().viewsCount !== undefined);
  const hasMessageReply = createMemo(() => isReplyToMessage(props.message) && !props.shouldHideReply && (!isEphemeralReply() || Boolean(props.replyMessage)));

  useMessageReadMetrics({
    messageRef: () => ref,
    containerRef: props.containerRef,
    chatId: () => chatId(),
    messageId: () => readMetricsMessage().id,
    isEnabled: () => canReportReadMetrics(),
    isMessageListActive: () => props.isMessageListActive,
  });

  const getMessageContentResult = createMemo(() => getMessageContent(props.message));
  const paidMedia = () => getMessageContentResult().paidMedia;
  const getSingularPaidMediaResult = createMemo(() => getSingularPaidMedia(paidMedia()));
  const paidMediaPhoto = () => getSingularPaidMediaResult().photo;
  const paidMediaVideo = () => getSingularPaidMediaResult().video;

  const getMessageContentResult2 = createMemo(() => getMessageContent(props.message));
  const photo = () => (getMessageContentResult2().photo === undefined ? paidMediaPhoto : getMessageContentResult2().photo);
  const video = () => (getMessageContentResult2().video === undefined ? paidMediaVideo : getMessageContentResult2().video);
  const audio = () => getMessageContentResult2().audio;
  const voice = () => getMessageContentResult2().voice;
  const document = () => getMessageContentResult2().document;
  const sticker = () => getMessageContentResult2().sticker;
  const contact = () => getMessageContentResult2().contact;
  const invoice = () => getMessageContentResult2().invoice;
  const location = () => getMessageContentResult2().location;
  const action = () => getMessageContentResult2().action;
  const game = () => getMessageContentResult2().game;
  const storyData = () => getMessageContentResult2().storyData;
  const giveaway = () => getMessageContentResult2().giveaway;
  const giveawayResults = () => getMessageContentResult2().giveawayResults;
  const todo = () => getMessageContentResult2().todo;
  const dice = () => getMessageContentResult2().dice;

  const withVoiceTranscription = createMemo(() => Boolean(!isTranscriptionHidden() && (isTranscriptionError() || props.transcribedText)));

  const hasStoryReply = createMemo(() => Boolean(storyReplyInfo()));
  const hasThread = createMemo(() => Boolean(props.repliesThreadInfo) && props.messageListType === 'thread');
  const isCustomShape = createMemo(() => !withVoiceTranscription() && getMessageCustomShape(props.message));
  const hasAnimatedEmoji = createMemo(() => isCustomShape() && (props.animatedEmoji || props.animatedCustomEmoji));
  const hasReactions = createMemo(() => props.reactionMessage?.reactions && !areReactionsEmpty(props.reactionMessage.reactions));
  const hasViaSender = createMemo(() => Boolean(viaBotId() || guestChatViaId()));

  const asForwarded =
    createMemo(() => (forwardInfo() &&
      (!props.isChatWithSelf || isScheduled()) &&
      !props.isRepliesChat &&
      !forwardInfo().isLinkedChannelPost &&
      !props.isAnonymousForwards &&
      !hasViaSender()) ||
    Boolean(storyData() && !storyData().isMention));
  const canShowSenderBoosts = createMemo(() => Boolean(props.senderBoosts) && !asForwarded() && props.isFirstInGroup);
  const isStoryMention = createMemo(() => storyData()?.isMention);
  const isRoundVideo = createMemo(() => video()?.mediaType === 'video' && video().isRound);
  const isAlbum =
    createMemo(() => Boolean(props.album) &&
    ((props.album.isPaidMedia && paidMedia()!.extendedMedia.length > 1) || props.album.messages.length > 1) &&
    !props.album.messages.some((msg) => Object.keys(msg.content).length === 0));
  const isInDocumentGroupNotFirst = createMemo(() => props.isInDocumentGroup && !props.isFirstInDocumentGroup);
  const isInDocumentGroupNotLast = createMemo(() => props.isInDocumentGroup && !props.isLastInDocumentGroup);
  const isContextMenuShown = createMemo(() => contextMenuAnchor() !== undefined);
  const canShowActionButton =
    createMemo(() => !(isContextMenuShown() || props.isInSelectMode || props.isForwarding) && !isInDocumentGroupNotLast() && !isStoryMention());
  const canFocus = createMemo(() => Boolean(
    props.isPinnedList ||
    (forwardInfo() &&
      (forwardInfo().isChannelPost || props.isChatWithSelf || props.isRepliesChat || props.isAnonymousForwards) &&
      forwardInfo().fromMessageId),
  ));

  const hasFactCheck = createMemo(() => Boolean(factCheck()?.text));

  const hasForwardedCustomShape = createMemo(() => asForwarded() && isCustomShape());
  const hasSubheader =
    createMemo(() => props.message.isEphemeral ||
    hasMessageReply() ||
    hasStoryReply() ||
    hasForwardedCustomShape() ||
    Boolean(isShowingSummary() && props.summary?.text));

  const selectMessage = (e?: React.MouseEvent<HTMLDivElement, MouseEvent>, groupedId?: string) => {
    if (props.isAccountFrozen || props.message.isEphemeral) return;
    toggleMessageSelection({
      messageId: messageId(),
      groupedId,
      ...(e?.shiftKey && { withShift: true }),
      ...(isAlbum() && { childMessageIds: props.album.messages.map(({ id }) => id) }),
    });
  };

  const messageSender = createMemo(() => props.canShowSender ? props.sender : undefined);

  const shouldPreferOriginSender =
    createMemo(() => forwardInfo() && (props.isChatWithSelf || props.isRepliesChat || props.isAnonymousForwards || !messageSender()));
  const avatarPeer = createMemo(() => shouldPreferOriginSender() ? props.originSender : messageSender());

  const messageColorPeer = createMemo(() => asForwarded() ? props.originSender : props.sender);
  const noUserColors = createMemo(() => isOwn() && !isCustomShape());

  const senderPeer = createMemo(() => forwardInfo() || storyData() ? props.originSender : messageSender());
  const hasTtl = createMemo(() => hasMessageTtl(props.message));

  const outerHandlersResult = createMemo(() => useOuterHandlers(
    selectMessage,
    () => ref,
    () => messageId(),
    () => Boolean(props.isInSelectMode),
    () => Boolean(props.canReply),
    () => Boolean(props.isProtected),
    () => onContextMenu(),
    () => handleBeforeContextMenu(),
    () => chatId(),
    () => isContextMenuShown(),
    () => quickReactionRef,
    () => isInDocumentGroupNotLast(),
    () => props.getIsMessageListReady,
    () => props.message.isEphemeral,
  ));
  const handleMouseDown = () => outerHandlersResult().handleMouseDown;
  const handleClick = () => outerHandlersResult().handleClick;
  const handleContextMenu = () => outerHandlersResult().handleContextMenu;
  const handleDoubleClick = () => outerHandlersResult().handleDoubleClick;
  const handleContentDoubleClick = () => outerHandlersResult().handleContentDoubleClick;
  const handleMouseMove = () => outerHandlersResult().handleMouseMove;
  const handleSendQuickReaction = () => outerHandlersResult().handleSendQuickReaction;
  const handleMouseLeave = () => outerHandlersResult().handleMouseLeave;
  const isSwiped = () => outerHandlersResult().isSwiped;
  const isQuickReactionVisible = () => outerHandlersResult().isQuickReactionVisible;
  const handleDocumentGroupMouseEnter = () => outerHandlersResult().handleDocumentGroupMouseEnter;

  const innerHandlersResult = createMemo(() => useInnerHandlers({
    lang: oldLang,
    selectMessage,
    message: () => props.message,
    webPage: () => props.webPage,
    chatId: () => chatId(),
    threadId: () => props.threadId,
    isInDocumentGroup: () => props.isInDocumentGroup,
    asForwarded: () => asForwarded(),
    isScheduled: () => isScheduled(),
    album: () => props.album,
    avatarPeer: () => avatarPeer(),
    senderPeer: () => senderPeer(),
    botSender: () => props.botSender,
    guestFromSender: () => props.guestFromSender,
    isTranslatingChat: () => Boolean(props.requestedChatTranslationLanguage),
    story: () => props.replyStory && 'content' in props.replyStory ? props.replyStory : undefined,
    isReplyPrivate: () => props.isReplyPrivate,
    isRepliesChat: () => props.isRepliesChat,
    isSavedMessages: () => props.isChatWithSelf,
    lastPlaybackTimestamp: () => props.lastPlaybackTimestamp,
  }));
  const handleSenderClick = () => innerHandlersResult().handleSenderClick;
  const handleViaBotClick = () => innerHandlersResult().handleViaBotClick;
  const handleGuestForClick = () => innerHandlersResult().handleGuestForClick;
  const handleReplyClick = () => innerHandlersResult().handleReplyClick;
  const handleMediaClick = () => innerHandlersResult().handleMediaClick;
  const handleDocumentClick = () => innerHandlersResult().handleDocumentClick;
  const handleAudioPlay = () => innerHandlersResult().handleAudioPlay;
  const handleAlbumMediaClick = () => innerHandlersResult().handleAlbumMediaClick;
  const handlePhotoMediaClick = () => innerHandlersResult().handlePhotoMediaClick;
  const handleVideoMediaClick = () => innerHandlersResult().handleVideoMediaClick;
  const handleMetaClick = () => innerHandlersResult().handleMetaClick;
  const handleTranslationClick = () => innerHandlersResult().handleTranslationClick;
  const handleOpenThread = () => innerHandlersResult().handleOpenThread;
  const handleReadMedia = () => innerHandlersResult().handleReadMedia;
  const handleCancelUpload = () => innerHandlersResult().handleCancelUpload;
  const handleGroupForward = () => innerHandlersResult().handleGroupForward;
  const handleForward = () => innerHandlersResult().handleForward;
  const handleFocus = () => innerHandlersResult().handleFocus;
  const handleFocusForwarded = () => innerHandlersResult().handleFocusForwarded;
  const handleDocumentGroupSelectAll = () => innerHandlersResult().handleDocumentGroupSelectAll;
  const handleStoryClick = () => innerHandlersResult().handleStoryClick;

  createEffect(depsOf(() => [hasSummary(), chatId(), messageId(), props.requestedTranslationLanguage, isShowingSummary(), props.summary, hideSummary] as const), ([hasSummary2, chatId2, messageId2, requestedTranslationLanguage2, isShowingSummary2, summary2]) => {
    if (hasSummary2 && isShowingSummary2 && !summary2) {
      summarizeMessage({
        chatId: chatId2,
        id: messageId2,
        toLanguageCode: requestedTranslationLanguage2,
        onError: hideSummary,
      });
    }
  });

  const handleEffectClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();

    requestEffect();
  };

  const handleFocusSelf = () => {
    focusMessage({
      chatId: chatId(),
      threadId: props.threadId,
      messageId: messageId(),
      scrollTargetPosition: 'start',
      noHighlight: true,
    });
  };

  createEffect(depsOf(() => [props.isLastInList, props.transcribedText, withVoiceTranscription()] as const), ([isLastInList2, transcribedText2, withVoiceTranscription2]) => {
    if (!isLastInList2) {
      return;
    }

    if (withVoiceTranscription2 && transcribedText2) {
      handleFocusSelf();
    }
  });

  createEffect(() => props.message.isDeleting, () => {
    const element = ref;
    const isPartialAlbumDelete = props.message.isInAlbum && props.album?.messages.some((msg) => !msg.isDeleting);
    if (!element || isPartialAlbumDelete) return;

    if (!props.message.isDeleting) {
      setIsPlayingSnapAnimation(false);
      setIsPlayingDeleteAnimation(false);
      return;
    }

    if (animateSnap(element)) {
      setIsPlayingSnapAnimation(true);
    } else {
      setIsPlayingDeleteAnimation(true);
    }
    // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps -- Synchronize animation on `isDeleting` changes
  });

  const textMessage = createMemo(() => props.album?.hasMultipleCaptions ? undefined : props.album?.captionMessage || props.message);
  const hasTextContent = createMemo(() => textMessage() && hasMessageText(textMessage()));
  const hasText = createMemo(() => hasTextContent() || hasFactCheck());

  const containerClassName = createMemo(() => buildClassName(
    'Message message-list-item',
    props.isFirstInGroup && 'first-in-group',
    props.isProtected && 'hide-on-print',
    props.isProtected ? 'is-protected' : 'allow-selection',
    props.isLastInGroup && 'last-in-group',
    props.isFirstInDocumentGroup && 'first-in-document-group',
    props.isLastInDocumentGroup && 'last-in-document-group',
    props.isLastInList && 'last-in-list',
    isOwn() && 'own',
    Boolean(props.message.viewsCount) && 'has-views',
    props.message.isEdited && 'was-edited',
    hasMessageReply() && 'has-reply',
    isContextMenuOpen() && 'has-menu-open',
    props.isFocused && !props.noFocusHighlight && 'focused',
    props.isForwarding && 'is-forwarding',
    isPlayingDeleteAnimation() && 'is-deleting',
    isPlayingSnapAnimation() && 'is-dissolving',
    props.isInDocumentGroup && 'is-in-document-group',
    isAlbum() && 'is-album',
    props.message.hasUnreadMention && 'has-unread-mention',
    props.isSelected && 'is-selected',
    props.isInSelectMode && 'is-in-selection-mode',
    props.isThreadTop && !props.withAvatar && 'is-thread-top',
    Boolean(props.message.inlineButtons) && 'has-inline-buttons',
    isSwiped() && 'is-swiped',
    props.isJustAdded && 'is-just-added',
    (props.hasActiveReactions || shouldPlayEffect()) && 'has-active-effect',
    isStoryMention() && 'is-story-mention',
    guestChatViaId() && 'has-guest-avatar',
  ));

  const text = createMemo(() => textMessage() && getMessageContent(textMessage()).text);
  const isInvertedMedia = createMemo(() => Boolean(props.message.isInvertedMedia));

  const replyToMsgId = createMemo(() => messageReplyInfo()?.replyToMsgId);
  const replyToPeerId = createMemo(() => messageReplyInfo()?.type === 'message' ? messageReplyInfo().replyToPeerId : undefined);
  const source2 = createMemo(() => storyReplyInfo() || {});
  const storyReplyPeerId = () => source2().peerId;
  const storyReplyId = () => source2().storyId;

  // TODO(codemod): dependency on a container (memoFirstUnreadIdRef) keeps its identity while its content changes: track the fields the effect reads instead (store contract §12.7)
  createEffect(depsOf(() => [props.effect, isLocal(), props.memoFirstUnreadIdRef, messageId(), sticker()?.hasEffect] as const), ([effect2, isLocal2, memoFirstUnreadIdRef2, messageId2]) => {
    if (
      (sticker()?.hasEffect || effect2) &&
      ((memoFirstUnreadIdRef2?.current && messageId2 >= memoFirstUnreadIdRef2.current) || isLocal2)
    ) {
      requestEffect();
    }
  });

  // TODO(codemod): dependency on a container (memoFirstUnreadIdRef) keeps its identity while its content changes: track the fields the effect reads instead (store contract §12.7)
  createEffect(depsOf(() => [dice(), props.memoFirstUnreadIdRef, messageId(), isLocal()] as const), ([dice2, memoFirstUnreadIdRef2, messageId2, isLocal2]) => {
    if (dice2 && ((memoFirstUnreadIdRef2?.current && messageId2 >= memoFirstUnreadIdRef2.current) || isLocal2)) {
      requestDiceEffect();
    }
  });

  const textForLanguageDetection = createMemo(() => textMessage() && extractMessageText(textMessage())?.text);
  const detectedLanguage = useTextLanguage(
    () => textForLanguageDetection(),
    () => !(props.areTranslationsEnabled && props.shouldDetectChatLanguage) || isTypingDraft(),
    () => props.getIsMessageListReady,
  );
  useDetectChatLanguage(() => props.message, detectedLanguage, () => !props.shouldDetectChatLanguage, () => props.getIsMessageListReady);

  const shouldTranslate = createMemo(() => isMessageTranslatable(props.message, !props.requestedChatTranslationLanguage));

  const isManualMessageTranslation = createMemo(() => !props.requestedChatTranslationLanguage && props.requestedTranslationLanguage);
  const parsedManualTranslation = createMemo(() => isManualMessageTranslation()
    ? parseTranslationCacheKey(props.requestedTranslationLanguage)
    : undefined);
  const translationLanguageForHook = createMemo(() => parsedManualTranslation()?.languageCode || props.requestedChatTranslationLanguage);
  const translationToneForHook = createMemo(() => parsedManualTranslation()?.tone || props.requestedTranslationTone);

  const messageTranslationResult = createMemo(() => useMessageTranslation(
    () => props.chatTranslations,
    () => chatId(),
    () => shouldTranslate() ? messageId() : undefined,
    () => translationLanguageForHook(),
    () => translationToneForHook(),
  ));
  const isTranslationPending = () => messageTranslationResult().isPending;
  const translatedText = () => messageTranslationResult().translatedText;
  const translatedRichMessage = () => messageTranslationResult().translatedRichMessage;
  const isSummaryPending = createMemo(() => Boolean(props.summary?.isPending));
  const isNewTextPending = createMemo(() => isTranslationPending() || isSummaryPending());
  const previousTranslatedText = previous(() => translatedText(), { skipUndefined: Boolean(shouldTranslate()) });
  const previousTranslatedRichMessage = previous(() => translatedRichMessage(), { skipUndefined: Boolean(shouldTranslate()) });

  createEffect(
    depsOf(() => [isShowingSummary(), props.summary?.text]), (_deps, prev) => {
      const [prevIsShowingSummary] = prev ?? [];
      if (props.summary?.text || (prevIsShowingSummary && !isShowingSummary())) {
        handleFocusSelf();
      }
    },
  );

  const currentTranslatedText = createMemo(() => shouldTranslate() ? translatedText() || previousTranslatedText() : undefined);
  const currentTranslatedRichMessage = createMemo(() => shouldTranslate()
    ? translatedRichMessage() || (isTranslationPending() !== false ? previousTranslatedRichMessage() : undefined)
    : undefined);

  const phoneCall = createMemo(() => action()?.type === 'phoneCall' ? action() : undefined);

  const commentsThreadInfo = createMemo(() => props.repliesThreadInfo?.isCommentsInfo ? props.repliesThreadInfo : undefined);
  const isLocalWithCommentButton = createMemo(() => props.hasLinkedChat && props.isChannel && isLocal());

  const isMediaWithCommentButton =
    createMemo(() => (commentsThreadInfo() || isLocalWithCommentButton()) &&
    !isInDocumentGroupNotLast() &&
    props.messageListType === 'thread' &&
    !props.noComments);
  const withCommentButton =
    createMemo(() => (commentsThreadInfo() || isLocalWithCommentButton()) &&
    !isInDocumentGroupNotLast() &&
    props.messageListType === 'thread' &&
    !props.noComments);
  const withQuickReactionButton =
    createMemo(() => !props.message.isEphemeral &&
    !isTouchScreen &&
    !phoneCall() &&
    !props.isInSelectMode &&
    props.defaultReaction &&
    !isInDocumentGroupNotLast() &&
    !isStoryMention() &&
    !hasTtl() &&
    !props.isAccountFrozen);

  const hasOutsideReactions =
    createMemo(() => !withVoiceTranscription() &&
    hasReactions() &&
    (isCustomShape() ||
      ((photo() || video() || storyData() || location()?.mediaType === 'geo') && (!hasText() || isInvertedMedia()))));

  const peerColorResult = createMemo(() => usePeerColor({
    peer: () => messageColorPeer(),
    noUserColors: () => noUserColors(),
    shouldReset: true,
    theme: () => props.theme,
  }));
  const peerColorClass = () => peerColorResult().className;
  const peerColorStyle = () => peerColorResult().style;

  const hasWideMedia = createMemo(() => Boolean(
    (photo() || video() || isAlbum() || invoice()?.extendedMedia || invoice()?.photo) &&
    ((text()?.text.length || 0) > MIN_MESSAGE_LENGTH_FOR_WIDE_MEDIA || isMediaWithCommentButton()),
  ));
  const contentClassName = createMemo(() => buildClassName(
    buildContentClassName(props.message, props.album, {
      poll: props.poll,
      webPage: props.webPage,
      hasSubheader: hasSubheader(),
      isCustomShape: isCustomShape(),
      isLastInGroup: props.isLastInGroup,
      asForwarded: asForwarded(),
      hasThread: hasThread() && !props.noComments,
      forceSenderName: props.forceSenderName,
      hasCommentCounter:
        hasThread() && props.repliesThreadInfo.messagesCount !== undefined && props.repliesThreadInfo.messagesCount > 0,
      hasBottomCommentButton: withCommentButton() && !isCustomShape(),
      hasActionButton: props.canForward || canFocus() || (withCommentButton() && isCustomShape()),
      hasReactions: hasReactions(),
      isGeoLiveActive: location()?.mediaType === 'geoLive' && !isGeoLiveExpired(props.message),
      withVoiceTranscription: withVoiceTranscription(),
      peerColorClass: peerColorClass(),
      hasOutsideReactions: hasOutsideReactions(),
    }),
    hasWideMedia() && 'with-wide-media',
  ));

  const withAppendix = createMemo(() => contentClassName().includes('has-appendix'));
  const emojiSize = createMemo(() => getCustomEmojiSize(text()?.emojiOnlyCount));

  const paidMessageStarsInMeta = createMemo(() => !props.isChatWithUser
    ? isAlbum() && props.paidMessageStars
      ? props.album.messages.length * props.paidMessageStars
      : props.paidMessageStars
    : undefined);

  let metaPosition!: MetaPosition;
  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (phoneCall()) {
    metaPosition = 'none';
  } else if (isInDocumentGroupNotLast()) {
    metaPosition = 'none';
  } else if (hasText() && !props.webPage && !emojiSize() && !isInvertedMedia()) {
    metaPosition = 'in-text';
  } else if (isInvertedMedia() && !emojiSize() && (hasFactCheck() || props.webPage)) {
    metaPosition = 'in-text';
  } else {
    metaPosition = 'standalone';
  }

  let reactionsPosition!: ReactionsPosition;
  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (hasReactions()) {
    if (hasOutsideReactions()) {
      reactionsPosition = 'outside';
    } else if (asForwarded()) {
      metaPosition = 'standalone';
      reactionsPosition = 'inside';
    } else {
      reactionsPosition = 'inside';
    }
  } else {
    reactionsPosition = 'none';
  }

  const quickReactionPosition = createMemo<QuickReactionPosition>(() => isCustomShape() ? 'in-meta' : 'in-content');

  useEnsureMessage(
    () => replyToPeerId() || chatId(),
    () => replyToMsgId(),
    () => props.replyMessage,
    () => props.message.id,
    () => props.shouldHideReply || props.isReplyPrivate || isEphemeralReply(),
  );

  useEnsureStory(() => storyReplyPeerId() || chatId(), () => storyReplyId(), () => props.replyStory);

  useFocusMessageListElement({
    elementRef: () => ref,
    isFocused: () => props.isFocused,
    focusDirection: () => props.focusDirection,
    noFocusHighlight: () => props.noFocusHighlight,
    isResizingContainer: () => props.isResizingContainer,
    isJustAdded: () => props.isJustAdded,
    isQuote: () => Boolean(props.focusedQuote),
    scrollTargetPosition: () => props.scrollTargetPosition,
  });

  const viaBusinessBotTitle = createMemo(() => props.viaBusinessBot ? getPeerFullTitle(oldLang, props.viaBusinessBot) : undefined);

  const canShowPostAuthor = createMemo(() => !props.message.senderId);
  const signature =
    createMemo(() => viaBusinessBotTitle() ||
    (canShowPostAuthor() && props.message.postAuthorTitle) ||
    ((asForwarded() || props.isChatWithSelf) && forwardInfo()?.postAuthorTitle) ||
    undefined);

  // TODO(codemod): dependency on a container (memoFirstUnreadIdRef) keeps its identity while its content changes: track the fields the effect reads instead (store contract §12.7)
  createEffect(depsOf(() => [
    props.hasUnreadReaction,
    props.hasUnreadPollVote,
    props.album,
    chatId(),
    props.isQuickPreview,
    isOwn(),
    isTypingDraft(),
    isLocalOnly(),
    markMessageListRead,
    messageId(),
    props.memoFirstUnreadIdRef,
    animateUnreadReaction,
    markPollVotesRead,
    props.message.hasUnreadMention,
    props.message.wasTypingDraft,
  ] as const), ([hasUnreadReaction2, hasUnreadPollVote2, album2, chatId2, isQuickPreview2, isOwn2, isTypingDraft2, isLocalOnly2, , messageId2, memoFirstUnreadIdRef2]) => {
    if (isTypingDraft2 || isLocalOnly2) {
      return;
    }

    const bottomMarker = bottomMarkerRef;
    if (!bottomMarker || !isElementInViewport(bottomMarker)) return;

    if (
      props.message.wasTypingDraft &&
      !isQuickPreview2 &&
      !isOwn2 &&
      memoFirstUnreadIdRef2?.current &&
      messageId2 >= memoFirstUnreadIdRef2.current
    ) {
      markMessageListRead({ maxId: messageId2 });
    }

    if (hasUnreadReaction2) {
      animateUnreadReaction({ chatId: chatId2, messageIds: [messageId2] });
    }

    if (hasUnreadPollVote2) {
      markPollVotesRead({ chatId: chatId2, messageIds: [messageId2] });
    }

    let unreadMentionIds: number[] = [];
    if (props.message.hasUnreadMention) {
      unreadMentionIds = [messageId2];
    }

    if (album2) {
      unreadMentionIds = album2.messages.filter((msg) => msg.hasUnreadMention).map((msg) => msg.id);
    }

    if (unreadMentionIds.length) {
      markMentionsRead({ chatId: chatId2, messageIds: unreadMentionIds });
    }
  });

  const extraPadding = createMemo(() => asForwarded() && !isCustomShape() ? 28 : 0);

  const sizeCalculations = createMemo(() => {
    let style = '';

    if (sticker() && !hasSubheader()) {
      const { width } = getStickerDimensions(sticker(), isMobile);
      style = `width: ${width + extraPadding()}px`;
    }

    return style;
  });

  const contentStyle = createMemo(() => buildStyle(peerColorStyle(), sizeCalculations()));

  const handleTypingAnimationEnd = () => {
    if (!isTypingDraft() || !previousLocalId()) {
      return;
    }

    markTypingDraftDone({ chatId: chatId(), messageId: messageId() });
  };

  function renderMessageText(isForAnimation?: boolean) {
    if (!textMessage()) return undefined;

    if (textMessage().content.richMessage) {
      return (
        <MessageRichText
          message={textMessage()}
          forcedRichMessage={props.requestedTranslationLanguage ? currentTranslatedRichMessage() : undefined}
          isOwn={isOwn()}
          noAvatars={props.noAvatars}
          canAutoLoadMedia={props.canAutoLoadMedia}
          isProtected={props.isProtected}
          noPlaylist={isScheduled()}
          theme={props.theme}
          observeIntersectionForLoading={props.observeIntersectionForLoading}
          observeIntersectionForPlaying={props.observeIntersectionForPlaying}
          threadId={props.threadId}
        />
      );
    }

    const forcedText =
      (isShowingSummary() && props.summary?.text) || (props.requestedTranslationLanguage ? currentTranslatedText() : undefined);
    return (
      <MessageText
        messageOrStory={textMessage()}
        forcedText={forcedText}
        isForAnimation={isForAnimation}
        focusedQuote={props.focusedQuote}
        focusedQuoteOffset={props.focusedQuoteOffset}
        emojiSize={emojiSize()}
        highlight={props.highlight}
        isProtected={props.isProtected}
        observeIntersectionForLoading={props.observeIntersectionForLoading}
        observeIntersectionForPlaying={props.observeIntersectionForPlaying}
        withTranslucentThumbs={isCustomShape()}
        isInSelectMode={props.isInSelectMode}
        canBeEmpty={hasFactCheck() || isTypingDraft()}
        maxTimestamp={props.maxTimestamp}
        threadId={props.threadId}
        shouldAnimateTyping={isTypingDraft()}
        noInitialTypingAnimation={props.message.shouldSkipTypingAnimation}
        canAnimateTextStreaming={props.canAnimateTextStreaming}
        onTypingAnimationEnd={handleTypingAnimationEnd}
      />
    );
  }

  function renderMessageTextAnimation() {
    if (textMessage()?.content.richMessage) {
      return undefined;
    }

    return (
      <div class="translation-animation">
        <div class="text-loading">{renderMessageText(true)}</div>
      </div>
    );
  }

  const renderQuickReactionButton = () => {
    if (!props.defaultReaction) return undefined;

    return (
      <div
        class={buildClassName(
          'quick-reaction',
          'no-selection',
          isQuickReactionVisible() && !props.hasActiveReactions && 'visible',
        )}
        onClick={handleSendQuickReaction()}
        ref={quickReactionRef}
      >
        <ReactionStaticEmoji
          reaction={props.defaultReaction}
          size={QUICK_REACTION_SIZE}
          availableReactions={props.availableReactions}
          observeIntersection={props.observeIntersectionForPlaying}
        />
      </div>
    );
  };

  function renderReactionsAndMeta() {
    const meta = (
      <MessageMeta
        message={props.message}
        isPinned={props.isPinned}
        withFullDate={props.isChatWithSelf && !isOwn()}
        isMessagePrimaryEditedDateEnabled={props.isMessagePrimaryEditedDateEnabled}
        noReplies={props.noReplies}
        repliesThreadInfo={props.repliesThreadInfo}
        outgoingStatus={props.outgoingStatus}
        signature={signature()}
        withReactionOffset={reactionsPosition === 'inside'}
        renderQuickReactionButton={
          withQuickReactionButton() && quickReactionPosition() === 'in-meta' ? renderQuickReactionButton : undefined
        }
        availableReactions={props.availableReactions}
        isTranslated={Boolean(props.requestedTranslationLanguage && (currentTranslatedText() || currentTranslatedRichMessage()))}
        effectEmoji={props.effect?.emoticon}
        onClick={handleMetaClick()}
        onEffectClick={handleEffectClick}
        onTranslationClick={handleTranslationClick()}
        onOpenThread={handleOpenThread()}
        paidMessageStars={paidMessageStarsInMeta()}
      />
    );

    if (reactionsPosition !== 'inside') {
      return meta;
    }

    return (
      <Reactions
        message={props.reactionMessage!}
        threadId={props.threadId}
        metaChildren={meta}
        observeIntersection={props.observeIntersectionForPlaying}
        noRecentReactors={props.isChannel}
        tags={props.tags}
        isCurrentUserPremium={props.isPremium}
        isAccountFrozen={props.isAccountFrozen}
      />
    );
  }

  function renderContent() {
    const className = buildClassName(
      'content-inner',
      asForwarded() && 'forwarded-message',
      hasForwardedCustomShape() && 'forwarded-custom-shape',
      hasSubheader() && 'with-subheader',
    );
    const hasCustomAppendix =
      props.isLastInGroup &&
      (!hasText() || (isInvertedMedia() && !hasFactCheck() && reactionsPosition !== 'inside')) &&
      !withCommentButton();
    const textContentClass = buildClassName(
      'text-content',
      'clearfix',
      metaPosition === 'in-text' && 'with-meta',
      props.outgoingStatus && 'with-outgoing-icon',
    );
    const shouldReadMedia = !hasTtl() || !isOwn() || props.isChatWithSelf;
    let ephemeralBotName: string | undefined;
    if (isLocalOnly() && props.message.isOutgoing) {
      if (!props.ephemeralBot) {
        ephemeralBotName = lang('Bot');
      } else if (props.ephemeralBot.hasUsername) {
        ephemeralBotName = `@${getMainUsername(props.ephemeralBot)}`;
      } else {
        ephemeralBotName = getPeerFullTitle(oldLang, props.ephemeralBot);
      }
    }

    return (
      <div class={className} onDoubleClick={handleContentDoubleClick()} dir="auto">
        {!asForwarded() && shouldRenderSenderName() && renderSenderName()}
        {hasSubheader() && (
          <div class="message-subheader">
            {props.message.isEphemeral && (
              <BadgeButton className="ephemeral-header">
                <Icon name="eye-outline" />
                <span dir="auto">
                  {props.message.isOutgoing && isLocalOnly()
                    ? lang('EphemeralOnlyVisibleToBot', { bot: ephemeralBotName! })
                    : lang('EphemeralOnlyVisible')}
                </span>
              </BadgeButton>
            )}
            {hasForwardedCustomShape() && (
              <div class="forward-custom-shape-subheader">
                <div class="message-title">{renderForwardTitle()}</div>
                {renderSenderName(true, true)}
              </div>
            )}
            {hasMessageReply() && (
              <EmbeddedMessage
                message={props.replyMessage}
                replyInfo={messageReplyInfo()}
                noUserColors={noUserColors()}
                isProtected={props.isProtected}
                sender={props.replyMessageSender}
                senderChat={props.replyMessageChat}
                forwardSender={props.replyMessageForwardSender}
                chatTranslations={props.chatTranslations}
                isMediaNsfw={props.isReplyMediaNsfw}
                requestedChatTranslationLanguage={props.requestedChatTranslationLanguage}
                requestedChatTranslationTone={props.requestedTranslationTone}
                observeIntersectionForLoading={props.observeIntersectionForLoading}
                observeIntersectionForPlaying={props.observeIntersectionForPlaying}
                onClick={props.message.isEphemeral ? undefined : handleReplyClick()}
              />
            )}
            {hasStoryReply() && (
              <EmbeddedStory
                story={props.replyStory}
                sender={props.storySender}
                noUserColors={noUserColors()}
                isProtected={props.isProtected}
                observeIntersectionForLoading={props.observeIntersectionForLoading}
                observeIntersectionForPlaying={props.observeIntersectionForPlaying}
                onClick={handleStoryClick()}
              />
            )}
            {hasSummary() && isShowingSummary() && !props.summary?.isPending && (
              <PeerColorWrapper className="message-summary" onClick={hideSummary}>
                <Sparkles preset="button" className="message-summary-sparkles" />
                <span class="message-summary-title">{lang('MessageSummaryTitle')}</span>
                <span class="message-summary-description">{lang('MessageSummaryDescription')}</span>
              </PeerColorWrapper>
            )}
          </div>
        )}
        {sticker() && props.observeIntersectionForLoading && props.observeIntersectionForPlaying && (
          <Sticker
            message={props.message}
            observeIntersection={props.observeIntersectionForLoading}
            observeIntersectionForPlaying={props.observeIntersectionForPlaying}
            shouldLoop={props.shouldLoopStickers}
            shouldPlayEffect={shouldPlayEffect()}
            withEffect={props.withAnimatedEffects}
            isMediaNsfw={props.isMediaNsfw}
            onStopEffect={hideEffect}
          />
        )}
        {hasAnimatedEmoji() && props.animatedCustomEmoji && (
          <AnimatedCustomEmoji
            customEmojiId={props.animatedCustomEmoji}
            withEffects={props.withAnimatedEffects && props.isChatWithUser && !props.effect}
            isOwn={isOwn()}
            observeIntersection={props.observeIntersectionForLoading}
            forceLoadPreview={isLocal()}
            messageId={messageId()}
            chatId={chatId()}
            activeEmojiInteractions={props.activeEmojiInteractions}
          />
        )}
        {hasAnimatedEmoji() && props.animatedEmoji && (
          <AnimatedEmoji
            emoji={props.animatedEmoji}
            withEffects={props.withAnimatedEffects && props.isChatWithUser && !props.effect}
            isOwn={isOwn()}
            observeIntersection={props.observeIntersectionForLoading}
            forceLoadPreview={isLocal()}
            messageId={messageId()}
            chatId={chatId()}
            activeEmojiInteractions={props.activeEmojiInteractions}
          />
        )}
        {props.withAnimatedEffects && props.effect && !isLocal() && (
          <MessageEffect
            shouldPlay={shouldPlayEffect()}
            messageId={props.message.id}
            isMirrored={!props.message.isOutgoing}
            effect={props.effect}
            observeIntersectionForLoading={props.observeIntersectionForLoading}
            observeIntersectionForPlaying={props.observeIntersectionForPlaying}
            onStop={hideEffect}
          />
        )}
        {phoneCall() && <MessagePhoneCall message={props.message} phoneCall={phoneCall()} chatId={chatId()} />}
        {!isAlbum() && isRoundVideo() && !withVoiceTranscription() && (
          <RoundVideo
            message={props.message}
            observeIntersection={props.observeIntersectionForLoading}
            canAutoLoad={props.canAutoLoadMedia}
            isDownloading={props.isDownloading}
            onReadMedia={shouldReadMedia ? handleReadMedia() : undefined}
            onHideTranscription={setIsTranscriptionHidden}
            isTranscriptionError={isTranscriptionError()}
            isTranscribed={Boolean(props.transcribedText)}
            canTranscribe={props.canTranscribeVoice && !hasTtl()}
            isTranscriptionHidden={isTranscriptionHidden()}
            isTranscribing={props.isTranscribing}
          />
        )}
        {(audio() || voice() || withVoiceTranscription()) && (
          <Audio
            theme={props.theme}
            message={props.message}
            variant="inline"
            threadId={props.threadId}
            noPlaylist={isScheduled()}
            uploadProgress={props.uploadProgress}
            isSelectable={props.isInDocumentGroup}
            isSelected={props.isSelected}
            noAvatars={props.noAvatars}
            onPlay={handleAudioPlay()}
            onReadMedia={voice() && shouldReadMedia ? handleReadMedia() : undefined}
            onCancelUpload={handleCancelUpload()}
            isDownloading={props.isDownloading}
            isTranscribing={props.isTranscribing}
            isTranscriptionHidden={isTranscriptionHidden()}
            isTranscribed={Boolean(props.transcribedText)}
            isTranscriptionError={isTranscriptionError()}
            canDownload={!props.isProtected}
            onHideTranscription={setIsTranscriptionHidden}
            canTranscribe={props.canTranscribeVoice && !hasTtl()}
          />
        )}
        {document() && (
          <Document
            document={document()}
            message={props.message}
            observeIntersection={props.observeIntersectionForLoading}
            canAutoLoad={props.canAutoLoadMedia}
            autoLoadFileMaxSizeMb={props.autoLoadFileMaxSizeMb}
            uploadProgress={props.uploadProgress}
            isSelectable={props.isInDocumentGroup}
            isSelected={props.isSelected}
            onMediaClick={handleDocumentClick()}
            onCancelUpload={handleCancelUpload()}
            isDownloading={props.isDownloading}
            shouldWarnAboutFiles={props.shouldWarnAboutFiles}
          />
        )}
        {storyData() && !isStoryMention() && <Story message={props.message} isProtected={props.isProtected} />}
        {isStoryMention() && <StoryMention message={props.message} />}
        {contact() && <Contact contact={contact()} noUserColors={isOwn()} />}
        {props.poll && (
          // TODO(codemod): key= on a single element remounted it: wrap in <Show when={key} keyed>{() => …}</Show>
          <Poll
            key={props.poll.summary.id}
            chatId={chatId()}
            messageId={messageId()}
            poll={props.poll}
            messageText={text()}
            theme={props.theme}
            isInScheduled={isScheduled()}
            observeIntersectionForLoading={props.observeIntersectionForLoading}
            observeIntersectionForPlaying={props.observeIntersectionForPlaying}
          />
        )}
        {todo() && <TodoList message={props.message} todoList={todo()} />}
        {(giveaway() || giveawayResults()) && <Giveaway message={props.message} />}
        {game() && <Game message={props.message} threadId={props.threadId} canAutoLoadMedia={props.canAutoLoadMedia} />}
        {dice() && (
          <DiceWrapper
            canSendDice={props.canSendStickers}
            isLocal={isLocal()}
            dice={dice()}
            isOutgoing={isOwn()}
            canPlayWinEffect={shouldPlayDiceEffect()}
            onEffectPlayed={hideDiceEffect}
          />
        )}
        {invoice()?.extendedMedia && <InvoiceMediaPreview message={props.message} isConnected={props.isConnected} />}

        {withVoiceTranscription() && (
          <p
            class={buildClassName(
              'transcription',
              !isTranscriptionHidden() && isTranscriptionError() && 'transcription-error',
            )}
            dir="auto"
          >
            {isTranscriptionError() ? (
              oldLang('NoWordsRecognized')
            ) : props.isTranscribing && props.transcribedText ? (
              <DotAnimation content={props.transcribedText} />
            ) : (
              props.transcribedText
            )}
          </p>
        )}

        {isInvertedMedia() && renderInvertedMediaContent(hasCustomAppendix)}

        {!isInvertedMedia() && (
          <>
            {renderInvertibleMediaContent(hasCustomAppendix)}
            {hasText() && !hasAnimatedEmoji() && (
              <div class={textContentClass} dir="auto">
                {renderMessageText()}
                {isNewTextPending() && renderMessageTextAnimation()}
                {hasFactCheck() && <FactCheck factCheck={factCheck()} isToggleDisabled={props.isInSelectMode} />}
                {metaPosition === 'in-text' && renderReactionsAndMeta()}
              </div>
            )}
            {renderWebPage()}
          </>
        )}

        {invoice() && !invoice().extendedMedia && (
          <Invoice
            message={props.message}
            shouldAffectAppendix={hasCustomAppendix && !hasReactions()}
            isInSelectMode={props.isInSelectMode}
            isSelected={props.isSelected}
            theme={props.theme}
          />
        )}
        {location() && (
          <Location
            message={props.message}
            isInSelectMode={props.isInSelectMode}
            isSelected={props.isSelected}
            theme={props.theme}
            peer={props.sender}
          />
        )}
      </div>
    );
  }

  function renderInvertedMediaContent(hasCustomAppendix: boolean) {
    const textContentClass = buildClassName('text-content', 'clearfix');
    const footerClass = buildClassName(
      'text-content',
      'clearfix',
      metaPosition === 'in-text' && 'with-meta',
      props.outgoingStatus && 'with-outgoing-icon',
    );

    const hasMediaAfterText = isAlbum() || (!isAlbum() && photo()) || (!isAlbum() && video() && !isRoundVideo());
    const hasContentAfterText = hasMediaAfterText || (!hasAnimatedEmoji() && hasFactCheck());
    const isMetaInText = metaPosition === 'in-text';

    return (
      <>
        {renderWebPage()}
        {hasText() && !hasAnimatedEmoji() && (
          <div class={textContentClass} dir="auto">
            {renderMessageText()}
            {isNewTextPending() && renderMessageTextAnimation()}
            {!hasContentAfterText && isMetaInText && renderReactionsAndMeta()}
          </div>
        )}

        {hasContentAfterText && (
          <>
            {renderInvertibleMediaContent(hasCustomAppendix)}
            {!hasAnimatedEmoji() && (
              <div class={footerClass} dir="auto">
                {hasFactCheck() && <FactCheck factCheck={factCheck()} isToggleDisabled={props.isInSelectMode} />}
                {isMetaInText && renderReactionsAndMeta()}
              </div>
            )}
          </>
        )}
      </>
    );
  }

  function renderWebPage() {
    const messageWebPage = getMessageWebPage(props.message);
    if (!messageWebPage || !props.webPage) return undefined;
    return (
      <WebPage
        messageWebPage={messageWebPage}
        webPage={props.webPage}
        message={props.message}
        observeIntersectionForLoading={props.observeIntersectionForLoading}
        observeIntersectionForPlaying={props.observeIntersectionForPlaying}
        noAvatars={props.noAvatars}
        canAutoLoad={props.canAutoLoadMedia}
        canAutoPlay={props.canAutoPlayMedia}
        isDownloading={props.isDownloading}
        isProtected={props.isProtected}
        theme={props.theme}
        story={props.webPageStory}
        isConnected={props.isConnected}
        lastPlaybackTimestamp={props.lastPlaybackTimestamp}
        backgroundEmojiId={messageColorPeer()?.color?.backgroundEmojiId}
        shouldWarnAboutFiles={props.shouldWarnAboutFiles}
        autoLoadFileMaxSizeMb={props.autoLoadFileMaxSizeMb}
        onAudioPlay={handleAudioPlay()}
        onMediaClick={handleMediaClick()}
        onDocumentClick={handleDocumentClick()}
        onCancelMediaTransfer={handleCancelUpload()}
      />
    );
  }

  function renderInvertibleMediaContent(hasCustomAppendix: boolean) {
    const content = (
      <>
        {isAlbum() && props.observeIntersectionForLoading && (
          <Album
            album={props.album}
            observeIntersection={props.observeIntersectionForLoading}
            isOwn={isOwn()}
            isProtected={props.isProtected}
            hasCustomAppendix={hasCustomAppendix}
            onMediaClick={handleAlbumMediaClick()}
          />
        )}
        {!isAlbum() && photo() && (
          <Photo
            photo={photo()}
            isOwn={isOwn()}
            observeIntersection={props.observeIntersectionForLoading}
            canAutoLoad={props.canAutoLoadMedia}
            uploadProgress={props.uploadProgress}
            shouldAffectAppendix={hasCustomAppendix}
            isDownloading={props.isDownloading}
            isProtected={props.isProtected}
            theme={props.theme}
            isMediaNsfw={props.isMediaNsfw}
            onClick={handlePhotoMediaClick()}
            onCancelUpload={handleCancelUpload()}
          />
        )}
        {!isAlbum() && video() && !isRoundVideo() && (
          <Video
            video={video()}
            observeIntersectionForLoading={props.observeIntersectionForLoading}
            observeIntersectionForPlaying={props.observeIntersectionForPlaying}
            canAutoLoad={props.canAutoLoadMedia}
            canAutoPlay={props.canAutoPlayMedia}
            uploadProgress={props.uploadProgress}
            isDownloading={props.isDownloading}
            isProtected={props.isProtected}
            isMediaNsfw={props.isMediaNsfw}
            lastPlaybackTimestamp={props.lastPlaybackTimestamp}
            onClick={handleVideoMediaClick()}
            onCancelUpload={handleCancelUpload()}
          />
        )}
      </>
    );

    if (paidMedia()) {
      return (
        <PaidMediaOverlay chatId={chatId()} messageId={messageId()} paidMedia={paidMedia()} isOutgoing={isOwn()}>
          {content}
        </PaidMediaOverlay>
      );
    }

    return content;
  }

  function shouldRenderSenderName() {
    const media = photo() || video() || location() || paidMedia();
    return (
      !(isCustomShape() && !hasViaSender()) &&
      ((props.withSenderName && !media) ||
        asForwarded() ||
        viaBotId() ||
        (guestChatViaId() && props.isFirstInGroup) ||
        props.forceSenderName) &&
      !isInDocumentGroupNotFirst() &&
      !(hasMessageReply() && isCustomShape())
    );
  }

  function renderForwardTitle() {
    return (
      <span class="forward-title-container">
        {asForwarded() && <Icon name={forwardInfo()?.hiddenUserName ? 'forward' : 'share-filled'} />}
        {asForwarded() && <span class="forward-title">{oldLang('ForwardedFrom')}</span>}
      </span>
    );
  }

  const handleInlineButtonClick = (button: ApiKeyboardButton) => {
    clickBotInlineButton({
      chatId: chatId(),
      messageId: props.message.id,
      threadId: props.threadId,
      button,
    });
  };

  const handleLocalInlineButtonClick = (button: ApiKeyboardButton) => {
    if (button.action.type === 'openThread') {
      openThread({
        chatId: chatId(),
        threadId: props.messageTopic!.id,
      });
      return;
    }

    if (button.action.type === 'suggestedMessage') {
      if (button.action.buttonType === 'approve') {
        openSuggestedPostApprovalModal({
          chatId: chatId(),
          messageId: props.message.id,
        });
        return;
      }

      if (button.action.buttonType === 'decline') {
        openDeclineDialog();
        return;
      }

      clickSuggestedMessageButton({
        chatId: chatId(),
        messageId: props.message.id,
        button: { ...button, action: button.action },
      });
      return;
    }
  };

  const handleDeclineReasonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDeclineReason(e.target.value);
  };

  const handleDeclineConfirm = () => {
    rejectSuggestedPost({
      chatId: chatId(),
      messageId: props.message.id,
      rejectComment: declineReason().trim() || undefined,
    });
    closeDeclineDialog();
    setDeclineReason('');
  };

  function renderSenderName(
    shouldSkipRenderForwardTitle: boolean = false,
    shouldSkipRenderAdminTitle: boolean = false,
  ) {
    let senderTitle;
    if (senderPeer() && !(isCustomShape() && hasViaSender())) {
      senderTitle = getPeerFullTitle(oldLang, senderPeer());
    } else if (forwardInfo()?.hiddenUserName) {
      senderTitle = forwardInfo().hiddenUserName;
    } else if (storyData() && props.originSender) {
      senderTitle = getPeerFullTitle(oldLang, props.originSender);
    }
    const senderEmojiStatus = senderPeer() && 'emojiStatus' in senderPeer() && senderPeer().emojiStatus;
    const senderIsPremium = senderPeer() && 'isPremium' in senderPeer() && senderPeer().isPremium;
    const guestFromSenderTitle = props.guestFromSender ? getPeerTitle(oldLang, props.guestFromSender) : undefined;

    const shouldRenderForwardAvatar = asForwarded() && senderPeer();
    const adminTitle =
      !shouldSkipRenderAdminTitle && !signature() ? (
        forwardInfo()?.isLinkedChannelPost ? (
          <span class="admin-title" dir="auto">
            {oldLang('DiscussChannel')}
          </span>
        ) : props.message.postAuthorTitle && props.isGroup && !asForwarded() ? (
          <span class="admin-title" dir="auto">
            {props.message.postAuthorTitle}
          </span>
        ) : (props.senderChatMember || fromRank()) && !asForwarded() ? (
          <RankBadge
            chatId={chatId()}
            userId={(props.senderChatMember?.userId || props.sender?.id)!}
            isAdmin={props.senderChatMember?.isAdmin}
            isOwner={props.senderChatMember?.isOwner}
            rank={props.senderChatMember?.rank || fromRank()}
            className="admin-title-badge"
            isClickable
          />
        ) : undefined
      ) : undefined;

    return (
      <div class="message-title" dir="ltr">
        {senderTitle || asForwarded() ? (
          <span
            class={buildClassName(
              'message-title-name-container',
              forwardInfo()?.hiddenUserName ? 'sender-hidden' : 'interactive',
            )}
            dir="ltr"
          >
            {!shouldSkipRenderForwardTitle && renderForwardTitle()}
            <span class="message-title-name">
              {storyData() && <Icon name="play-story" />}
              {shouldRenderForwardAvatar && <Avatar className="forward-avatar" peer={senderPeer()} size="micro" />}
              <span class="sender-title" onClick={handleSenderClick()}>
                {senderTitle ? renderText(senderTitle) : asForwarded() ? NBSP : undefined}
              </span>
              {!asForwarded() && senderEmojiStatus && (
                <CustomEmoji
                  documentId={senderEmojiStatus.documentId}
                  className="no-selection"
                  loopLimit={EMOJI_STATUS_LOOP_LIMIT}
                  observeIntersectionForLoading={props.observeIntersectionForLoading}
                  observeIntersectionForPlaying={props.observeIntersectionForPlaying}
                />
              )}
              {!asForwarded() && !senderEmojiStatus && senderIsPremium && <StarIcon />}
              {senderPeer()?.fakeType && <FakeIcon fakeType={senderPeer().fakeType} />}
            </span>
          </span>
        ) : !props.botSender && !props.guestFromSender ? (
          NBSP
        ) : undefined}
        {props.botSender?.hasUsername && (
          <span class="interactive via-sender">
            <span class="via">{lang('ViaBot')}</span>
            <span class="sender-title" onClick={handleViaBotClick()}>
              {renderText(`@${getMainUsername(props.botSender)}`)}
            </span>
          </span>
        )}
        {guestFromSenderTitle && (
          <span class="interactive via-sender">
            <span class="via">{lang('ForBot')}</span>
            <span class="sender-title" onClick={handleGuestForClick()}>
              {renderText(guestFromSenderTitle)}
            </span>
          </span>
        )}
        <div class="title-spacer" />
        {(adminTitle || canShowSenderBoosts()) && (
          <span class="message-title-meta">
            {adminTitle}
            {canShowSenderBoosts() && (
              <span class="sender-boosts" aria-hidden>
                <Icon name={props.senderBoosts > 1 ? 'boosts' : 'boost'} />
                {props.senderBoosts > 1 ? props.senderBoosts : undefined}
              </span>
            )}
          </span>
        )}
      </div>
    );
  }

  const forwardAuthor = createMemo(() => props.isGroup && asForwarded() ? props.message.postAuthorTitle : undefined);
  const shouldRenderSuggestedPostButtons =
    createMemo(() => props.message.suggestedPostInfo &&
    !props.message.isOutgoing &&
    !props.message.suggestedPostInfo.isAccepted &&
    !props.message.suggestedPostInfo.isRejected);

  const isSuggestedPostExpired = createMemo(() => (() => {
    if (!props.message.suggestedPostInfo?.scheduleDate || !props.minFutureTime) return false;
    const now = getServerTime();
    return props.message.suggestedPostInfo.scheduleDate <= now + props.minFutureTime;
  })());

  const suggestedPostButtons: ApiKeyboardButton[][] | undefined = createMemo(() => {
    if (!shouldRenderSuggestedPostButtons()) return undefined;
    return [
      [
        {
          action: { type: 'suggestedMessage', buttonType: 'decline' },
          text: lang('SuggestedPostDecline'),
        },
        {
          action: { type: 'suggestedMessage', buttonType: 'approve', disabled: isSuggestedPostExpired() },
          text: lang('SuggestedPostApprove'),
        },
      ],
      [
        {
          action: { type: 'suggestedMessage', buttonType: 'suggestChanges' },
          text: lang('SuggestedPostSuggestChanges'),
        },
      ],
    ];
  });

  const openThreadButtons: ApiKeyboardButton[][] | undefined = createMemo(() => {
    if (!props.isBotForum || props.message.inlineButtons || !props.messageTopic || !props.isLastInList || props.threadId !== MAIN_THREAD_ID)
      return undefined;

    return [
      [
        {
          action: { type: 'openThread' },
          text: lang('BotForumContinueThreadButton'),
        },
      ],
    ];
  });

  const additionalInlineButtons = createMemo(() => suggestedPostButtons() || openThreadButtons());

  return (
    <div
      ref={ref}
      id={getMessageHtmlId(props.message.id)}
      class={containerClassName()}
      data-message-id={messageId()}
      onCopy={props.isProtected ? stopEvent : undefined}
      onMouseDown={handleMouseDown()}
      onClick={handleClick()}
      onContextMenu={handleContextMenu()}
      onDoubleClick={handleDoubleClick()}
      onMouseEnter={isInDocumentGroupNotLast() ? handleDocumentGroupMouseEnter() : undefined}
      onMouseMove={withQuickReactionButton() ? handleMouseMove() : undefined}
      onMouseLeave={withQuickReactionButton() || isInDocumentGroupNotLast() ? handleMouseLeave() : undefined}
    >
      <div
        ref={bottomMarkerRef}
        class="bottom-marker"
        data-message-id={messageId()}
        data-last-message-id={props.album ? props.album.messages[props.album.messages.length - 1].id : undefined}
        data-album-main-id={props.album ? props.album.mainMessage.id : undefined}
        data-has-unread-mention={props.message.hasUnreadMention || undefined}
        data-has-unread-poll-vote={props.hasUnreadPollVote || undefined}
        data-has-unread-reaction={props.hasUnreadReaction || undefined}
        data-is-pinned={props.isPinned || undefined}
        data-should-update-views={props.message.viewsCount !== undefined}
      />
      {!props.isInDocumentGroup && (
        <div class="message-select-control no-selection">
          {props.isSelected && <Icon name="check" className="message-select-control-icon" />}
        </div>
      )}
      {props.isLastInDocumentGroup && (
        <div
          class={buildClassName(
            'message-select-control group-select no-selection',
            props.isGroupSelected && 'is-selected',
          )}
          onClick={handleDocumentGroupSelectAll()}
        >
          {props.isGroupSelected && <Icon name="check" className="message-select-control-icon" />}
        </div>
      )}
      <div
        class={buildClassName(
          'message-content-wrapper',
          contentClassName().includes('text') && 'can-select-text',
          contentClassName().includes('giveaway') && 'giveaway-result-content',
        )}
      >
        <div class={contentClassName()} style={contentStyle()} dir="auto">
          {asForwarded() && !isInDocumentGroupNotFirst() && (
            <>
              {shouldRenderSenderName() && renderSenderName()}
              {forwardAuthor() && (
                <span class="admin-title" dir="auto">
                  {forwardAuthor()}
                </span>
              )}
            </>
          )}
          {renderContent()}
          {!isInDocumentGroupNotLast() && metaPosition === 'standalone' && !isStoryMention() && renderReactionsAndMeta()}
          {canShowActionButton() && (
            <div class="message-action-buttons-container">
              <div class="message-action-buttons-sticky-zone">
                <div class="message-action-buttons message-action-button-sticky">
                  {hasSummary() && (
                    <Button
                      className="message-action-button action-summary"
                      color="translucent-white"
                      round
                      withSparkleEffect
                      ariaLabel={isShowingSummary() ? lang('AriaHideSummary') : lang('AriaShowSummary')}
                      onClick={isShowingSummary() ? hideSummary : showSummary}
                      iconName={isShowingSummary() ? 'expand' : 'collapse'}
                    />
                  )}
                </div>
              </div>
              <div
                class={buildClassName(
                  'message-action-buttons',
                  props.isLoadingComments && 'message-action-buttons-shown',
                )}
              >
                {withCommentButton() && isCustomShape() && (
                  <CommentButton
                    threadInfo={commentsThreadInfo()}
                    disabled={props.noComments || !commentsThreadInfo()}
                    isLoading={props.isLoadingComments}
                    isCustomShape
                  />
                )}
                {props.canForward && (
                  <Button
                    className="message-action-button"
                    color="translucent-white"
                    round
                    ariaLabel={oldLang('lng_context_forward_msg')}
                    onClick={props.isLastInDocumentGroup ? handleGroupForward() : handleForward()}
                    iconName="share-filled"
                  />
                )}
                {canFocus() && (
                  <Button
                    className="message-action-button"
                    color="translucent-white"
                    round
                    ariaLabel={lang('FocusMessage')}
                    onClick={props.isPinnedList ? handleFocus() : handleFocusForwarded()}
                    iconName="arrow-right"
                  />
                )}
              </div>
            </div>
          )}
          {withCommentButton() && !isCustomShape() && (
            <CommentButton
              threadInfo={commentsThreadInfo()}
              disabled={props.noComments || !commentsThreadInfo()}
              isLoading={props.isLoadingComments}
            />
          )}
          {withAppendix() && <MessageAppendix isOwn={isOwn()} />}
          {withQuickReactionButton() && quickReactionPosition() === 'in-content' && renderQuickReactionButton()}
        </div>
        {props.message.inlineButtons && (
          <InlineButtons
            inlineButtons={props.message.inlineButtons}
            isReceipt={Boolean(invoice()?.receiptMessageId)}
            isEphemeral={props.message.isEphemeral}
            onClick={handleInlineButtonClick}
          />
        )}
        {additionalInlineButtons() && (
          <InlineButtons
            inlineButtons={additionalInlineButtons()}
            isEphemeral={props.message.isEphemeral}
            onClick={handleLocalInlineButtonClick}
          />
        )}
        {reactionsPosition === 'outside' && !isStoryMention() && (
          <Reactions
            message={props.reactionMessage!}
            threadId={props.threadId}
            isOutside
            isCurrentUserPremium={props.isPremium}
            observeIntersection={props.observeIntersectionForPlaying}
            noRecentReactors={props.isChannel}
            tags={props.tags}
            isAccountFrozen={props.isAccountFrozen}
          />
        )}
      </div>
      {contextMenuAnchor() && (
        <ContextMenuContainer
          isOpen={isContextMenuOpen()}
          anchor={contextMenuAnchor()}
          targetHref={contextMenuTarget()?.matches('a[href]') ? (contextMenuTarget() as HTMLAnchorElement).href : undefined}
          isAltKeyPressed={isContextMenuAltKeyPressed()}
          message={props.message}
          album={props.album}
          messageListType={props.messageListType}
          threadId={props.threadId}
          onClose={handleContextMenuClose()}
          onCloseAnimationEnd={handleContextMenuHide()}
          repliesThreadInfo={props.repliesThreadInfo}
          noReplies={props.noReplies}
          detectedLanguage={detectedLanguage}
        />
      )}
      {isDeclineDialogOpen() && (
        <ConfirmDialog
          isOpen={isDeclineDialogOpen()}
          onClose={closeDeclineDialog}
          title={lang('SuggestedPostDecline')}
          confirmLabel={lang('SuggestedPostDecline')}
          confirmHandler={handleDeclineConfirm}
          confirmIsDestructive
        >
          <div class="decline-dialog-question">
            {renderText(
              lang(
                'DeclinePostDialogQuestion',
                {
                  sender: props.sender ? getPeerFullTitle(oldLang, props.sender) : '',
                },
                { withNodes: true, withMarkdown: true },
              ),
            )}
          </div>
          <InputText
            placeholder={lang('DeclineReasonPlaceholder')}
            value={declineReason()}
            onChange={handleDeclineReasonChange}
            maxLength={MAX_REASON_LENGTH}
          />
        </ConfirmDialog>
      )}
    </div>
  );
};

const mapStateToProps = (global: GlobalState, ownProps: OwnProps): Complete<StateProps> => {
    const { focusedMessage, forwardMessages, activeReactions, activeEmojiInteractions, loadingThread } =
      selectTabState(global);
    const {
      message,
      album,
      documentGroup,
      withSenderName,
      withAvatar,
      threadId,
      messageListType,
      isLastInDocumentGroup,
      shouldIgnoreSendFocus,
    } = ownProps;
    const {
      id,
      chatId,
      viaBotId,
      guestChatViaId,
      isOutgoing,
      forwardInfo,
      transcriptionId,
      isPinned,
      viaBusinessBotId,
      effectId,
      paidMessageStars,
    } = message;

    const webPage = selectFullWebPageFromMessage(global, message);

    const { shouldWarnAboutFiles } = selectSharedSettings(global);
    const isChatWithUser = isUserId(chatId);

    const chat = selectChat(global, chatId);
    const isChatWithSelf = selectIsChatWithSelf(global, chatId);
    const isChatWithBot = selectIsChatWithBot(global, chatId);
    const isSystemBotChat = isSystemBot(chatId);
    const isAnonymousForwards = isAnonymousForwardsChat(chatId);
    const isChannel = chat && isChatChannel(chat);
    const isGroup = chat && isChatGroup(chat);
    const chatFullInfo = !isChatWithUser ? selectChatFullInfo(global, chatId) : undefined;
    const { adminMembersById, members, boostsApplied } = chatFullInfo || {};
    const webPageStoryData = webPage?.story;
    const webPageStory = webPageStoryData
      ? selectPeerStory(global, webPageStoryData.peerId, webPageStoryData.id)
      : undefined;

    const isForwarding = forwardMessages.messageIds && forwardMessages.messageIds.includes(id);
    const forceSenderName = !isChatWithSelf && isAnonymousOwnMessage(message);
    const canShowSender = withSenderName || withAvatar || forceSenderName;
    const sender = selectSender(global, message);
    const originSender = selectForwardedSender(global, message);
    const botSender = viaBotId ? selectUser(global, viaBotId) : undefined;
    const ephemeralBot = message.ephemeralBotId ? selectUser(global, message.ephemeralBotId) : undefined;
    const guestFromSender = guestChatViaId ? selectPeer(global, guestChatViaId) : undefined;
    const senderChatMember = sender?.id
      ? adminMembersById?.[sender?.id] || members?.find((member) => member.userId === sender?.id)
      : undefined;

    const replyInfo = getMessageReplyInfo(message) || getEphemeralReplyInfo(message);
    const replyToMsgId = replyInfo?.replyToMsgId;
    const replyToPeerId = replyInfo?.type === 'message' ? replyInfo.replyToPeerId : undefined;
    const replyFrom = replyInfo?.type === 'message' ? replyInfo.replyFrom : undefined;
    const { peerId: storyReplyPeerId, storyId: storyReplyId } = getStoryReplyInfo(message) || {};

    const shouldHideReply = replyToMsgId && replyToMsgId === threadId;
    const replyMessage = selectReplyMessage(global, message);
    const forwardHeader = forwardInfo || replyFrom;
    const replyMessageSender = replyMessage
      ? selectSender(global, replyMessage)
      : forwardHeader && !isSystemBotChat && !isAnonymousForwards
        ? selectSenderFromHeader(global, forwardHeader)
        : undefined;
    const replyMessageForwardSender = replyMessage && selectForwardedSender(global, replyMessage);
    const replyMessageChat = replyToPeerId ? selectChat(global, replyToPeerId) : undefined;
    const isReplyPrivate =
      !isSystemBotChat &&
      !isAnonymousForwards &&
      replyMessageChat &&
      !isChatPublic(replyMessageChat) &&
      (replyMessageChat.isNotJoined || selectIsChatRestricted(global, replyMessageChat.id));
    const isReplyToTopicStart = replyMessage?.content.action?.type === 'topicCreate';
    const replyStory =
      storyReplyId && storyReplyPeerId ? selectPeerStory(global, storyReplyPeerId, storyReplyId) : undefined;
    const storySender = storyReplyPeerId ? selectPeer(global, storyReplyPeerId) : undefined;

    const uploadProgress = selectUploadProgress(global, message);
    const isFocusTarget =
      messageListType === 'thread' &&
      (album
        ? album.messages.some((m) => selectIsMessageFocused(global, m, threadId))
        : selectIsMessageFocused(global, message, threadId));
    const shouldIgnoreFocus = Boolean(
      isFocusTarget && shouldIgnoreSendFocus && focusedMessage?.noHighlight && focusedMessage.isResizingContainer,
    );
    const isFocused = isFocusTarget && !shouldIgnoreFocus;

    const {
      direction: focusDirection,
      noHighlight: noFocusHighlight,
      isResizingContainer,
      quote: focusedQuote,
      quoteOffset: focusedQuoteOffset,
      scrollTargetPosition,
    } = (isFocused && focusedMessage) || {};

    const middleSearch = selectCurrentMiddleSearch(global);
    const highlight =
      middleSearch?.results?.query && `${middleSearch.isHashtag ? '#' : ''}${middleSearch.results.query}`;

    const singleEmoji = getMessageSingleRegularEmoji(message);
    const animatedEmoji = singleEmoji && selectAnimatedEmoji(global, singleEmoji) ? singleEmoji : undefined;
    const animatedCustomEmoji = getMessageSingleCustomEmoji(message);

    let isSelected: boolean;
    if (album?.messages) {
      isSelected = album.messages.every(({ id: messageId }) => selectIsMessageSelected(global, messageId));
    } else {
      isSelected = selectIsMessageSelected(global, id);
    }

    const canReply = messageListType === 'thread' && selectCanReplyToMessage(global, message, threadId);
    const activeDownloads = selectActiveDownloads(global);
    const downloadableMedia = selectMessageDownloadableMedia(global, message);
    const isDownloading = downloadableMedia && getIsDownloading(activeDownloads, downloadableMedia);

    const isInDocumentGroup = Boolean(message.groupedId) && !message.isInAlbum;

    const repliesThreadInfo = selectThreadInfo(
      global,
      chatId,
      album?.commentsMessage?.id || documentGroup?.commentsMessage?.id || id,
    );
    const reactionMessage = isInDocumentGroup
      ? isLastInDocumentGroup && documentGroup?.firstMessageId
        ? selectChatMessage(global, chatId, documentGroup.firstMessageId)
        : undefined
      : message;

    const readState = selectThreadReadState(global, chatId, threadId);
    const hasUnreadReaction = readState?.unreadReactions?.includes(message.id);
    const hasUnreadPollVote = readState?.unreadPollVotes?.includes(message.id);

    const messageTopic = selectTopicFromMessage(global, message);

    const chatTranslations = selectChatTranslations(global, chatId);

    const requestedTranslationLanguage = selectRequestedMessageTranslationLanguage(global, chatId, message.id);
    const requestedChatTranslationLanguage = selectRequestedChatTranslationLanguage(global, chatId);
    const requestedTranslationTone = selectRequestedChatTranslationTone(global, chatId);

    const areTranslationsEnabled =
      IS_TRANSLATION_SUPPORTED && global.settings.byKey.canTranslate && !requestedChatTranslationLanguage; // Stop separate language detection if chat translation is requested

    const isConnected = global.connectionState === 'connectionStateReady';

    const hasActiveReactions = Boolean(reactionMessage && activeReactions[getMessageKey(reactionMessage)]?.length);

    const isPremium = selectIsCurrentUserPremium(global);
    const senderBoosts =
      sender && selectIsChatWithSelf(global, sender.id)
        ? (boostsApplied ?? message.senderBoosts)
        : message.senderBoosts;

    const chatLevel = chat?.boostLevel || 0;
    const transcribeMinLevel = global.appConfig.groupTranscribeLevelMin;
    const canTranscribeVoice =
      !message.isEphemeral && (isPremium || Boolean(transcribeMinLevel && chatLevel >= transcribeMinLevel));

    const viaBusinessBot = viaBusinessBotId ? selectUser(global, viaBusinessBotId) : undefined;

    const effect = effectId ? global.availableEffectById[effectId] : undefined;

    const poll = selectPollFromMessage(global, message);

    const maxTimestamp = selectMessageTimestampableDuration(global, message);

    const lastPlaybackTimestamp = selectMessageLastPlaybackTimestamp(global, chatId, message.id);
    const isAccountFrozen = selectIsCurrentUserFrozen(global);

    const minFutureTime = global.appConfig.starsSuggestedPostFutureMin;

    const isMediaNsfw = selectIsMediaNsfw(global, message);
    const isReplyMediaNsfw = replyMessage && selectIsMediaNsfw(global, replyMessage);

    const summary = !message.isEphemeral
      ? selectMessageSummary(global, chatId, message.id, requestedTranslationLanguage)
      : undefined;

    const allowedAttachmentOptions = getAllowedAttachmentOptions(chat, chatFullInfo, isChatWithBot);

    return {
      theme: selectTheme(global),
      forceSenderName,
      sender,
      canShowSender,
      originSender,
      botSender,
      ephemeralBot,
      guestFromSender,
      shouldHideReply: shouldHideReply || isReplyToTopicStart,
      replyMessage,
      replyMessageSender,
      replyMessageForwardSender,
      replyMessageChat,
      replyStory,
      isReplyPrivate,
      storySender,
      isInDocumentGroup,
      isProtected: selectIsMessageProtected(global, message),
      canForward: Boolean(isChannel && messageListType !== 'scheduled' && selectCanForwardMessage(global, message)),
      isFocused,
      isForwarding,
      reactionMessage,
      isChatWithSelf,
      isBotForum: chat?.isBotForum,
      isRepliesChat: isSystemBotChat,
      isAnonymousForwards,
      isChannel,
      isGroup,
      canReply: message.isEphemeral ? getCanReplyToEphemeralMessage(message) : canReply,
      highlight,
      animatedEmoji,
      animatedCustomEmoji,
      isInSelectMode: !message.isEphemeral && selectIsInSelectMode(global),
      isSelected: message.isEphemeral ? false : isSelected,
      isGroupSelected:
        !message.isEphemeral &&
        Boolean(message.groupedId) &&
        !message.isInAlbum &&
        selectIsDocumentGroupSelected(global, chatId, message.groupedId),
      threadId,
      isDownloading,
      isPinnedList: messageListType === 'pinned',
      isPinned,
      isMessagePrimaryEditedDateEnabled: Boolean(global.appConfig.isMessagePrimaryEditedDateEnabled),
      canAutoLoadMedia: selectCanAutoLoadMedia(global, message),
      canAutoPlayMedia: selectCanAutoPlayMedia(global, message),
      autoLoadFileMaxSizeMb: global.settings.byKey.autoLoadFileMaxSizeMb,
      shouldLoopStickers: selectShouldLoopStickers(global),
      repliesThreadInfo,
      availableReactions: global.reactions.availableReactions,
      defaultReaction:
        message.isEphemeral || isMessageLocal(message) || messageListType === 'scheduled'
          ? undefined
          : selectDefaultReaction(global, chatId),
      hasActiveReactions: message.isEphemeral ? false : hasActiveReactions,
      activeEmojiInteractions,
      hasUnreadReaction,
      hasUnreadPollVote,
      isTranscribing: transcriptionId !== undefined && global.transcriptions[transcriptionId]?.isPending,
      transcribedText: transcriptionId !== undefined ? global.transcriptions[transcriptionId]?.text : undefined,
      isPremium,
      senderChatMember,
      messageTopic,
      chatTranslations,
      areTranslationsEnabled,
      shouldDetectChatLanguage: selectShouldDetectChatLanguage(global, chatId),
      requestedTranslationLanguage,
      requestedChatTranslationLanguage,
      requestedTranslationTone,
      hasLinkedChat: Boolean(chatFullInfo?.linkedChatId),
      withAnimatedEffects: selectPerformanceSettingsValue(global, 'stickerEffects'),
      canAnimateTextStreaming: selectPerformanceSettingsValue(global, 'textStreaming'),
      webPageStory,
      isConnected,
      isLoadingComments:
        repliesThreadInfo?.isCommentsInfo &&
        loadingThread?.loadingChatId === repliesThreadInfo?.originChannelId &&
        loadingThread?.loadingMessageId === repliesThreadInfo?.originMessageId,
      shouldWarnAboutFiles,
      outgoingStatus: isOutgoing
        ? message.isEphemeral
          ? selectEphemeralOutgoingStatus(global, chatId, message.id)
          : selectOutgoingStatus(global, chatId, threadId, message.id, messageListType)
        : undefined,
      uploadProgress: typeof uploadProgress === 'number' ? uploadProgress : undefined,
      focusDirection: isFocused ? focusDirection : undefined,
      noFocusHighlight: isFocused ? noFocusHighlight : undefined,
      isResizingContainer: isFocused ? isResizingContainer : undefined,
      focusedQuote: isFocused ? focusedQuote : undefined,
      focusedQuoteOffset: isFocused ? focusedQuoteOffset : undefined,
      scrollTargetPosition: isFocused ? scrollTargetPosition : undefined,
      senderBoosts,
      tags: global.savedReactionTags?.byKey,
      canTranscribeVoice,
      viaBusinessBot,
      minFutureTime,
      effect,
      poll,
      maxTimestamp,
      lastPlaybackTimestamp,
      paidMessageStars,
      isChatWithUser,
      isAccountFrozen,
      isMediaNsfw,
      isReplyMediaNsfw,
      webPage,
      summary,
      canSendStickers: allowedAttachmentOptions.canSendStickers,
    };
  };

export default Message;
