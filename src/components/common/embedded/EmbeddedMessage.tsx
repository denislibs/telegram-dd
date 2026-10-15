import { createMemo } from 'frameact';

import type {
  ApiChat,
  ApiInputSuggestedPostInfo,
  ApiMessage,
  ApiPeer,
  ApiReplyInfo,
  MediaContainer,
} from '../../../api/types';
import type { ChatTranslatedMessages, TranslationTone } from '../../../types';
import type { IconName } from '../../../types/icons';

import { TON_CURRENCY_CODE } from '../../../config';
import {
  getMessageIsSpoiler,
  getMessageRoundVideo,
  isChatChannel,
  isChatGroup,
  isMessageTranslatable,
} from '../../../global/helpers';
import { getMediaContentTypeDescription } from '../../../global/helpers/messageSummary';
import { getPeerTitle } from '../../../global/helpers/peers';
import { getRichMessagePreviewText } from '../../../global/helpers/richMessage';
import buildClassName from '../../../util/buildClassName';
import { formatScheduledDateTime } from '../../../util/dates/oldDateFormat';
import { isUserId } from '../../../util/entities/ids';
import { formatStarsAsIcon, formatTonAsIcon } from '../../../util/localization/format';
import renderText from '../helpers/renderText';
import { renderTextWithEntities } from '../helpers/renderTextWithEntities';

import useLang from '../../../hooks/useLang';
import useOldLang from '../../../hooks/useOldLang';
import useMessageTranslation from '../../middle/message/hooks/useMessageTranslation';

import RippleEffect from '../../ui/RippleEffect';
import CompactMediaPreview, { canRenderCompactMediaPreview } from '../CompactMediaPreview';
import Icon from '../icons/Icon';
import MessageSummary from '../MessageSummary';
import PeerColorWrapper from '../PeerColorWrapper';

import './EmbeddedMessage.scss';

type OwnProps = {
  className?: string;
  replyInfo?: ApiReplyInfo;
  suggestedPostInfo?: ApiInputSuggestedPostInfo;
  message?: ApiMessage;
  sender?: ApiPeer;
  senderChat?: ApiChat;
  forwardSender?: ApiPeer;
  composerForwardSenders?: ApiPeer[];
  title?: string;
  customText?: string;
  noUserColors?: boolean;
  isProtected?: boolean;
  isInComposer?: boolean;
  chatTranslations?: ChatTranslatedMessages;
  requestedChatTranslationLanguage?: string;
  requestedChatTranslationTone?: TranslationTone;
  isOpen?: boolean;
  isMediaNsfw?: boolean;
  noCaptions?: boolean;
  pictogramActionIcon?: IconName;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  onClick?: (e: React.MouseEvent) => void;
  onPictogramClick?: (e: React.MouseEvent) => void;
};

const NBSP = '\u00A0';
const EMOJI_SIZE = 17;

const EmbeddedMessage = (props: OwnProps) => {
  // TODO(codemod): dependency on a container (replyInfo) keeps its identity while its content changes: the memo must read the fields it needs (store contract §12.7)
  const containedMedia: MediaContainer | undefined = createMemo(() => {
    const media = (props.replyInfo?.type === 'message' && props.replyInfo.replyMedia) || props.message?.content;
    if (!media) {
      return undefined;
    }

    return {
      content: media,
    };
  });
  const hasPictogram = createMemo(() => canRenderCompactMediaPreview(containedMedia()?.content));

  const isRoundVideo = createMemo(() => Boolean(containedMedia() && getMessageRoundVideo(containedMedia())));
  const isSpoiler = createMemo(() => Boolean(containedMedia() && getMessageIsSpoiler(containedMedia())) || props.isMediaNsfw);
  const isQuote = createMemo(() => Boolean(props.replyInfo?.type === 'message' && props.replyInfo.isQuote));
  const replyForwardInfo = createMemo(() => props.replyInfo?.type === 'message' ? props.replyInfo.replyFrom : undefined);

  const shouldTranslate = createMemo(() => props.message && isMessageTranslatable(props.message));
  const messageTranslationResult = createMemo(() => useMessageTranslation(
    () => props.chatTranslations,
    () => props.message?.chatId,
    () => shouldTranslate() ? props.message?.id : undefined,
    () => props.requestedChatTranslationLanguage,
    () => props.requestedChatTranslationTone,
  ));
  const translatedText = () => messageTranslationResult().translatedText;
  const translatedRichMessage = () => messageTranslationResult().translatedRichMessage;
  const translatedPreview = createMemo(
    () => (translatedRichMessage() ? { text: getRichMessagePreviewText(translatedRichMessage()) } : translatedText()),
  );

  const oldLang = useOldLang();
  const lang = useLang();

  const senderTitle = createMemo(() => props.sender
    ? getPeerTitle(oldLang, props.sender)
    : replyForwardInfo()?.hiddenUserName || props.message?.forwardInfo?.hiddenUserName);

  const forwardSendersTitle = createMemo(() => {
    if (!props.composerForwardSenders) return undefined;

    const peerTitles = props.composerForwardSenders.map((peer) => getPeerTitle(lang, peer)).filter(Boolean);
    return lang.conjunction(peerTitles);
  });

  const senderChatTitle = createMemo(() => props.senderChat ? getPeerTitle(oldLang, props.senderChat) : undefined);
  const forwardSenderTitle = createMemo(() => props.forwardSender
    ? getPeerTitle(oldLang, props.forwardSender)
    : props.message?.forwardInfo?.hiddenUserName);
  const areSendersSame = createMemo(() => props.sender && props.sender.id === props.forwardSender?.id);

  function renderTextContent() {
    const isFree = !props.suggestedPostInfo?.price?.amount;
    if (props.suggestedPostInfo) {
      if (isFree && !props.suggestedPostInfo.scheduleDate) {
        return lang('ComposerEmbeddedMessageSuggestedPostDescription');
      }
      const priceText = props.suggestedPostInfo.price
        ? props.suggestedPostInfo.price.currency === TON_CURRENCY_CODE
          ? formatTonAsIcon(lang, props.suggestedPostInfo.price.amount, {
              className: 'suggested-price-ton-icon',
              shouldConvertFromNanos: true,
            })
          : formatStarsAsIcon(lang, props.suggestedPostInfo.price.amount, {
              className: 'suggested-price-star-icon',
            })
        : '';
      const scheduleText = props.suggestedPostInfo.scheduleDate
        ? formatScheduledDateTime(props.suggestedPostInfo.scheduleDate, lang, oldLang)
        : '';
      if (priceText && !scheduleText) {
        return (
          <span class="suggested-post-price-wrapper">
            {lang(
              'TitleSuggestedPostAmountForAnyTime',
              { amount: priceText },
              {
                withNodes: true,
                withMarkdown: true,
              },
            )}
          </span>
        );
      }
      return (
        <span class="suggested-post-price-wrapper">
          {priceText}
          {scheduleText ? ` • ${scheduleText}` : ''}
        </span>
      );
    }

    if (props.replyInfo?.type === 'message' && props.replyInfo.quoteText) {
      return renderTextWithEntities({
        text: props.replyInfo.quoteText.text,
        entities: props.replyInfo.quoteText.entities,
        asPreview: true,
        emojiSize: EMOJI_SIZE,
      });
    }

    if (!props.message) {
      return props.customText || renderMediaContentType(containedMedia()) || NBSP;
    }

    if (props.noCaptions) {
      return lang('EmbeddedMessageNoCaption');
    }

    return (
      <MessageSummary
        message={props.message}
        noEmoji={hasPictogram()}
        forcedText={translatedPreview()}
        observeIntersectionForLoading={props.observeIntersectionForLoading}
        observeIntersectionForPlaying={props.observeIntersectionForPlaying}
        emojiSize={EMOJI_SIZE}
      />
    );
  }

  function renderMediaContentType(media?: MediaContainer) {
    if (!media || media.content.text) return NBSP;
    const description = getMediaContentTypeDescription(lang, media.content, {});
    if (!description) return NBSP;
    return <span>{renderText(description)}</span>;
  }

  function checkShouldRenderSenderTitle() {
    if (!props.senderChat) return true;
    if (isUserId(props.senderChat?.id)) return true;
    if (props.senderChat.id === props.sender?.id) return false;
    return true;
  }
  function renderSender() {
    if (props.title) {
      return renderText(props.title);
    }

    if (props.suggestedPostInfo && props.replyInfo) {
      return lang('TitleSuggestedChanges');
    }

    if (props.suggestedPostInfo) {
      return lang('ComposerEmbeddedMessageSuggestedPostTitle');
    }

    if (!senderTitle() && !forwardSendersTitle()) {
      // Keep the sender subtree structure stable while the peer is still loading — replacing
      // a bare text node with an element subtree later makes WebKit shift `scrollTop`
      return (
        <span class="embedded-sender-wrapper">
          <span class="embedded-sender">{NBSP}</span>
        </span>
      );
    }

    let icon: IconName | undefined;
    if (props.senderChat) {
      if (isChatChannel(props.senderChat)) {
        icon = 'megaphone-filled';
      }

      if (isChatGroup(props.senderChat)) {
        icon = 'group-filled';
      }
    }

    const isReplyToQuote = props.isInComposer && Boolean(props.replyInfo && 'quoteText' in props.replyInfo && props.replyInfo?.quoteText);

    return (
      <span class="embedded-sender-wrapper">
        {checkShouldRenderSenderTitle() && (
          <span class="embedded-sender">
            {!props.composerForwardSenders &&
              senderTitle() &&
              renderText(isReplyToQuote ? oldLang('ReplyToQuote', senderTitle()) : senderTitle())}
            {forwardSendersTitle() &&
              renderText(
                lang(
                  'ComposerTitleForwardFrom',
                  {
                    users: forwardSendersTitle(),
                  },
                  {
                    withNodes: true,
                    withMarkdown: true,
                  },
                ),
              )}
          </span>
        )}
        {icon && <Icon name={icon} className="embedded-chat-icon" />}
        {icon && senderChatTitle() && <span class="embedded-sender-chat">{renderText(senderChatTitle())}</span>}
      </span>
    );
  }

  function renderForwardSender() {
    return (
      forwardSenderTitle() &&
      !areSendersSame() && (
        <span class="embedded-forward-sender-wrapper">
          <Icon name={props.forwardSender ? 'share-filled' : 'forward'} className="embedded-origin-icon" />
          <span class="forward-sender-title">{renderText(forwardSenderTitle())}</span>
        </span>
      )
    );
  }

  return (
    <PeerColorWrapper
      peer={props.sender}
      emojiIconClassName="EmbeddedMessage--background-icons"
      shouldReset
      isReply={Boolean(props.replyInfo)}
      noUserColors={props.noUserColors}
      className={buildClassName(
        'EmbeddedMessage',
        props.className,
        isQuote() && 'is-quote',
        hasPictogram() && 'with-thumb',
        'no-selection',
        props.composerForwardSenders && 'is-input-forward',
        props.suggestedPostInfo && 'is-suggested-post',
      )}
      dir={lang.isRtl ? 'rtl' : undefined}
      onClick={props.onClick}
    >
      <div class="hover-effect" />
      <RippleEffect />
      {hasPictogram() && (
        <CompactMediaPreview
          media={containedMedia()?.content}
          className="embedded-thumb"
          isPictogram
          isRound={isRoundVideo()}
          isProtected={props.isProtected}
          isSpoiler={isSpoiler()}
          actionIcon={props.pictogramActionIcon}
          observeIntersectionForLoading={props.observeIntersectionForLoading}
          observeIntersectionForPlaying={props.observeIntersectionForPlaying}
          onClick={props.onPictogramClick}
        />
      )}
      <div class="message-text">
        <p class={buildClassName('embedded-text-wrapper', isQuote() && 'multiline')}>{renderTextContent()}</p>
        <div class="message-title">
          {renderSender()}
          {renderForwardSender()}
        </div>
      </div>
    </PeerColorWrapper>
  );
};

export default EmbeddedMessage;
