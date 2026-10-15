import { getActions } from '../../../../global';

import type { ApiMessage, ApiPeer, ApiStory, ApiWebPage } from '../../../../api/types';
import type { OldLangFn } from '../../../../hooks/useOldLang';
import type { IAlbum, ThreadId } from '../../../../types';
import { MAIN_THREAD_ID } from '../../../../api/types';
import { MediaViewerOrigin } from '../../../../types';

import { getMainUsername, getMessagePhoto, getWebPagePhoto, getWebPageVideo } from '../../../../global/helpers';
import { getMessageReplyInfo } from '../../../../global/helpers/replies';
import { type MaybeAccessor, read } from '../../../../util/accessors';
import { tryParseDeepLink } from '../../../../util/deepLinkParser';

// Deviation: a hook runs once. Every reactive field of the options is a `MaybeAccessor` and is read when a handler runs
// (tt destructured the message at each render and made new handlers).
export default function useInnerHandlers({
  lang,
  selectMessage,
  message,
  webPage,
  chatId,
  threadId,
  isInDocumentGroup,
  asForwarded,
  isScheduled,
  album,
  senderPeer,
  botSender,
  guestFromSender,
  isTranslatingChat,
  story,
  isReplyPrivate,
  isRepliesChat,
  isSavedMessages,
  lastPlaybackTimestamp,
}: {
  lang: OldLangFn;
  selectMessage: (e?: React.MouseEvent<HTMLDivElement, MouseEvent>, groupedId?: string) => void;
  message: MaybeAccessor<ApiMessage>;
  webPage?: MaybeAccessor<ApiWebPage | undefined>;
  chatId: MaybeAccessor<string>;
  threadId: MaybeAccessor<ThreadId>;
  isInDocumentGroup: MaybeAccessor<boolean>;
  asForwarded?: MaybeAccessor<boolean | undefined>;
  isScheduled?: MaybeAccessor<boolean | undefined>;
  album?: MaybeAccessor<IAlbum | undefined>;
  avatarPeer?: MaybeAccessor<ApiPeer | undefined>;
  senderPeer?: MaybeAccessor<ApiPeer | undefined>;
  botSender?: MaybeAccessor<ApiPeer | undefined>;
  guestFromSender?: MaybeAccessor<ApiPeer | undefined>;
  isTranslatingChat?: MaybeAccessor<boolean | undefined>;
  story?: MaybeAccessor<ApiStory | undefined>;
  isReplyPrivate?: MaybeAccessor<boolean | undefined>;
  isRepliesChat?: MaybeAccessor<boolean | undefined>;
  isSavedMessages?: MaybeAccessor<boolean | undefined>;
  lastPlaybackTimestamp?: MaybeAccessor<number | undefined>;
}) {
  const {
    openChat,
    openChatWithDraft,
    showNotification,
    focusMessage,
    openMediaViewer,
    openAudioPlayer,
    markMessagesRead,
    cancelUploadMedia,
    openForwardMenu,
    openChatLanguageModal,
    openThread,
    openStoryViewer,
    searchChatMediaMessages,
  } = getActions();

  const getMessage = () => read(message);

  const handleSenderClick = () => {
    const senderPeer2 = read(senderPeer);
    if (!senderPeer2) {
      showNotification({ message: lang('HidAccount') });

      return;
    }

    const { forwardInfo } = getMessage();
    if (read(asForwarded) && forwardInfo?.channelPostId) {
      focusMessage({ chatId: senderPeer2.id, messageId: forwardInfo.channelPostId });
    } else {
      openChat({ id: senderPeer2.id });
    }
  };

  const handleViaBotClick = () => {
    const botSender2 = read(botSender);
    const username = botSender2 && getMainUsername(botSender2);
    if (!username) {
      return;
    }

    openChatWithDraft({
      chatId: read(chatId),
      threadId: read(threadId),
      text: {
        text: `@${username} `,
      },
    });
  };

  const handleGuestForClick = () => {
    const guestFromSender2 = read(guestFromSender);
    if (!guestFromSender2) {
      return;
    }

    openChat({ id: guestFromSender2.id });
  };

  const handleReplyClick = (): void => {
    const { replyToMsgId, replyToPeerId, replyToTopId, isQuote, quoteText, quoteOffset } =
      getMessageReplyInfo(getMessage()) || {};

    if (!replyToMsgId || read(isReplyPrivate)) {
      showNotification({
        message: isQuote ? lang('QuotePrivate') : lang('ReplyPrivate'),
      });
      return;
    }

    const isRepliesChat2 = read(isRepliesChat);
    if (isRepliesChat2 && replyToPeerId && replyToTopId) {
      openThread({
        isComments: true,
        originChannelId: replyToPeerId,
        originMessageId: replyToTopId,
        focusMessageId: replyToMsgId,
      });
      return;
    }

    focusMessage({
      chatId: replyToPeerId || read(chatId),
      threadId: isRepliesChat2 ? replyToTopId : read(threadId), // Open comments from Replies bot, otherwise, keep current thread
      messageId: replyToMsgId,
      replyMessageId: replyToPeerId ? undefined : getMessage().id,
      noForumTopicPanel: !replyToPeerId, // Open topic panel for cross-chat replies
      ...(isQuote && { quote: quoteText?.text, quoteOffset }),
    });
  };

  const handleDocumentClick = (): void => {
    const message2 = getMessage();
    openMediaViewer({
      chatId: read(chatId),
      threadId: read(threadId),
      messageId: message2.id,
      origin: message2.isEphemeral
        ? MediaViewerOrigin.Ephemeral
        : read(isScheduled)
          ? MediaViewerOrigin.ScheduledInline
          : MediaViewerOrigin.Inline,
    });
  };

  const openMediaViewerWithPhotoOrVideo = (withDynamicLoading: boolean): void => {
    const message2 = getMessage();
    const {
      id: messageId,
      content: { paidMedia, video },
    } = message2;
    const chatId2 = read(chatId);
    const threadId2 = read(threadId);
    const webPage2 = read(webPage);
    const isScheduled2 = read(isScheduled);

    if (paidMedia && !paidMedia.isBought) return;
    if (withDynamicLoading && !message2.isEphemeral) {
      searchChatMediaMessages({ chatId: chatId2, threadId: threadId2, currentMediaMessageId: messageId });
    }

    const parsedLink = webPage2?.url && tryParseDeepLink(webPage2.url);

    const videoContent = video || getWebPageVideo(webPage2);
    const webpageTimestamp = parsedLink && 'timestamp' in parsedLink ? parsedLink.timestamp : undefined;

    openMediaViewer({
      chatId: chatId2,
      threadId: threadId2,
      messageId,
      origin: message2.isEphemeral
        ? MediaViewerOrigin.Ephemeral
        : isScheduled2
          ? MediaViewerOrigin.ScheduledInline
          : MediaViewerOrigin.Inline,
      timestamp: read(lastPlaybackTimestamp) || videoContent?.timestamp || webpageTimestamp,
      withDynamicLoading: message2.isEphemeral ? false : withDynamicLoading,
    });
  };
  const handlePhotoMediaClick = (): void => {
    const message2 = getMessage();
    const withDynamicLoading = !message2.isEphemeral && !read(isScheduled) && !message2.content.paidMedia;
    openMediaViewerWithPhotoOrVideo(withDynamicLoading);
  };
  const handleVideoMediaClick = () => {
    const message2 = getMessage();
    const isGif = message2.content?.video?.isGif;
    const withDynamicLoading = !message2.isEphemeral && !isGif && !read(isScheduled) && !message2.content.paidMedia;
    openMediaViewerWithPhotoOrVideo(withDynamicLoading);
  };

  const handleMediaClick = (): void => {
    const photo = getMessagePhoto(getMessage()) || getWebPagePhoto(read(webPage));
    if (photo) {
      handlePhotoMediaClick();
    }

    handleVideoMediaClick();
  };

  const handleAudioPlay = (): void => {
    openAudioPlayer({
      item: {
        type: 'message',
        chatId: read(chatId),
        threadId: read(threadId),
        messageId: getMessage().id,
      },
    });
  };

  const handleAlbumMediaClick = (albumMessageId: number, albumIndex?: number): void => {
    const {
      id: messageId,
      content: { paidMedia },
    } = getMessage();
    if (paidMedia && !paidMedia.isBought) return;

    const chatId2 = read(chatId);
    const threadId2 = read(threadId);
    searchChatMediaMessages({ chatId: chatId2, threadId: threadId2, currentMediaMessageId: messageId });
    openMediaViewer({
      chatId: chatId2,
      threadId: threadId2,
      messageId: albumMessageId,
      mediaIndex: albumIndex,
      origin: read(isScheduled) ? MediaViewerOrigin.ScheduledAlbum : MediaViewerOrigin.Album,
      withDynamicLoading: !paidMedia,
    });
  };

  const handleReadMedia = (): void => {
    const message2 = getMessage();
    if (message2.isEphemeral) return;
    markMessagesRead({ chatId: read(chatId), messageIds: [message2.id] });
  };

  const handleCancelUpload = () => {
    cancelUploadMedia({ chatId: read(chatId), messageId: getMessage().id });
  };

  const handleGroupForward = () => {
    openForwardMenu({ fromChatId: read(chatId), groupedId: getMessage().groupedId });
  };

  const handleForward = () => {
    const album2 = read(album);
    if (album2 && album2.messages) {
      const messageIds = album2.messages.map(({ id }) => id);
      openForwardMenu({ fromChatId: read(chatId), messageIds });
    } else {
      openForwardMenu({ fromChatId: read(chatId), messageIds: [getMessage().id] });
    }
  };

  const handleFocus = () => {
    focusMessage({
      chatId: read(chatId),
      threadId: MAIN_THREAD_ID,
      messageId: getMessage().id,
    });
  };

  const handleFocusForwarded = () => {
    const { forwardInfo, groupedId } = getMessage();
    const { replyToPeerId, replyToTopId } = getMessageReplyInfo(getMessage()) || {};
    const chatId2 = read(chatId);
    const isRepliesChat2 = read(isRepliesChat);
    const originalChatId = (read(isSavedMessages) && forwardInfo!.savedFromPeerId) || forwardInfo!.fromChatId!;

    if (read(isInDocumentGroup)) {
      focusMessage({
        chatId: originalChatId,
        groupedId,
        groupedChatId: chatId2,
        messageId: forwardInfo!.fromMessageId!,
      });
      return;
    }

    if (replyToPeerId && replyToTopId) {
      if (isRepliesChat2) {
        openThread({
          isComments: true,
          originChannelId: replyToPeerId,
          originMessageId: replyToTopId,
          focusMessageId: forwardInfo!.fromMessageId!,
        });
      } else {
        focusMessage({
          chatId: replyToPeerId,
          threadId: replyToTopId,
          messageId: forwardInfo!.fromMessageId!,
        });
      }
    } else {
      focusMessage({
        chatId: originalChatId,
        messageId: forwardInfo!.fromMessageId!,
      });
    }
  };

  const selectWithGroupedId = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();

    selectMessage(e, getMessage().groupedId);
  };

  const handleTranslationClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();

    openChatLanguageModal({
      chatId: read(chatId),
      messageId: !read(isTranslatingChat) ? getMessage().id : undefined,
    });
  };

  const handleOpenThread = () => {
    const message2 = getMessage();
    openThread({
      chatId: message2.chatId,
      threadId: message2.id,
    });
  };

  const handleStoryClick = () => {
    const story2 = read(story);
    if (!story2) return;
    openStoryViewer({
      peerId: story2.peerId,
      storyId: story2.id,
      isSingleStory: true,
    });
  };

  return {
    handleSenderClick,
    handleViaBotClick,
    handleGuestForClick,
    handleReplyClick,
    handleDocumentClick,
    handleMediaClick,
    handleAudioPlay,
    handleAlbumMediaClick,
    handlePhotoMediaClick,
    handleVideoMediaClick,
    handleMetaClick: selectWithGroupedId,
    handleTranslationClick,
    handleOpenThread,
    handleReadMedia,
    handleCancelUpload,
    handleGroupForward,
    handleForward,
    handleFocus,
    handleFocusForwarded,
    handleDocumentGroupSelectAll: selectWithGroupedId,
    handleStoryClick,
  };
}
