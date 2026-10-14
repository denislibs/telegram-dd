import { createMemo } from 'frameact';
import type { JSX } from 'frameact/jsx-runtime';
import { getActions, useGlobal, withGlobal } from '../../../global';

import type { ApiChat, ApiMessage, ApiPeer } from '../../../api/types';
import type { GlobalState } from '../../../global/types';

import {
  GENERAL_TOPIC_ID,
  SERVICE_NOTIFICATIONS_USER_ID,
  STARS_CURRENCY_CODE,
  TME_LINK_PREFIX,
  TON_CURRENCY_CODE,
} from '../../../config';
import {
  getMainUsername,
  getMessageContent,
  getMessageInvoice,
  getMessageTextWithFallback,
  isChatChannel,
} from '../../../global/helpers';
import { getPeerTitle } from '../../../global/helpers/peers';
import { getMessageReplyInfo } from '../../../global/helpers/replies';
import {
  selectChat,
  selectChatMessage,
  selectMonoforumChannel,
  selectPeer,
  selectSender,
  selectTopic,
  selectWalletCurrency,
  selectWalletCurrencyRate,
} from '../../../global/selectors';
import { selectThreadIdFromMessage } from '../../../global/selectors/threads';
import { ensureProtocol } from '../../../util/browser/url';
import {
  formatCountdown,
  formatDateTimeToString,
  formatScheduledDateTime,
  formatShortDuration,
} from '../../../util/dates/oldDateFormat';
import { convertTonFromNanos, formatCurrency, formatTonFromNanos, formatTonInFiat } from '../../../util/formatCurrency';
import { formatCurrencyAmountAsText, formatStarsAsText, formatTonAsText } from '../../../util/localization/format';
import { conjuctionWithNodes } from '../../../util/localization/utils';
import { getServerTime } from '../../../util/serverTime';
import renderText from '../../common/helpers/renderText';
import { renderTextWithEntities } from '../../common/helpers/renderTextWithEntities';
import {
  getCallMessageKey,
  getPinnedMediaValue,
  renderMessageLink,
  renderPeerLink,
  renderTopicLink,
  translateWithYou,
} from './helpers/messageActions';

import useLang from '../../../hooks/useLang';
import useOldLang from '../../../hooks/useOldLang';

import CustomEmoji from '../../common/CustomEmoji';
import TopicDefaultIcon from '../../common/TopicDefaultIcon';
import Link from '../../ui/Link';

import styles from './ActionMessage.module.scss';

type OwnProps = {
  message: ApiMessage;
  isInsideTopic?: boolean;
  asPreview?: boolean;
};

type StateProps = {
  currentUserId?: string;
  sender?: ApiPeer;
  replyMessage?: ApiMessage;
  chat?: ApiChat;
  tonUsdRate?: number;
  walletCurrency?: string;
  walletCurrencyRate?: number;
};

const NBSP = '\u00A0';
const DEFAULT_TOPIC_ICON_ID = '0';

const UNSUPPORTED_LANG_KEY = 'ActionUnsupported';

const ActionMessageText = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { openTelegramLink, openUrl } = getActions();
  const source = createMemo(() => props.message);
  const chatId = () => source().chatId;
  const isOutgoing = () => source().isOutgoing;
  const action = createMemo(() => props.message.content.action!);
  // Tracked view of the global for the selectors by id below (chats/peers/users): a renamed peer re-renders the text
  const global = useGlobal();

  const lang = useLang();
  const oldLang = useOldLang();

  function renderStrong(text: JSX.Element) {
    if (props.asPreview) return text;
    return <span class={styles.strong}>{text}</span>;
  }

  const renderActionText = () => {
    // The one read of the action: `switch (currentAction.type)` narrows the union (a memo call does not)
    const currentAction = action();

    const isServiceNotificationsChat = chatId() === SERVICE_NOTIFICATIONS_USER_ID;
    const isSavedMessages = chatId() === props.currentUserId;

    const isChannel = props.chat && isChatChannel(props.chat);
    const senderTitle = props.sender && getPeerTitle(lang, props.sender);
    const chatTitle = props.chat && getPeerTitle(lang, props.chat);

    const userFallbackText = lang('ActionFallbackUser');
    const chatFallbackText = lang('ActionFallbackChat');
    const channelFallbackText = lang('ActionFallbackChannel');

    const senderLink = renderPeerLink(props.sender?.id, senderTitle || userFallbackText, props.asPreview);
    const chatLink = renderPeerLink(props.chat?.id, chatTitle || chatFallbackText, props.asPreview);

    switch (currentAction.type) {
      case 'pinMessage': {
        if (props.replyMessage) {
          const formattedText = getMessageTextWithFallback(lang, props.replyMessage);
          if (formattedText) {
            const textLink = renderMessageLink(
              props.replyMessage,
              renderTextWithEntities({
                text: formattedText.text,
                entities: formattedText.entities,
                asPreview: true,
              }),
              props.asPreview,
            );

            return translateWithYou(lang, 'ActionPinnedText', isOutgoing(), { text: textLink, from: senderLink });
          }

          const mediaValue = getPinnedMediaValue(lang, props.replyMessage);
          if (mediaValue) {
            const messageLink = renderMessageLink(props.replyMessage, mediaValue, props.asPreview);
            return translateWithYou(lang, 'ActionPinnedMedia', isOutgoing(), { from: senderLink, media: messageLink });
          }
        }

        return translateWithYou(lang, 'ActionPinnedNotFound', isOutgoing(), { from: senderLink });
      }

      case 'gameScore': {
        const { score } = currentAction;

        const gameTitle = props.replyMessage?.content.game?.title;
        const gameLink = gameTitle && renderMessageLink(props.replyMessage, renderText(gameTitle), props.asPreview);

        if (gameLink) {
          return translateWithYou(
            lang,
            'ActionGameScore',
            isOutgoing(),
            { from: senderLink, count: score, game: gameLink },
            { pluralValue: score },
          );
        }

        return translateWithYou(
          lang,
          'ActionGameScoreNoGame',
          isOutgoing(),
          { from: senderLink, count: score },
          { pluralValue: score },
        );
      }

      case 'chatJoinedViaCommunity': {
        const community = selectChat(global, currentAction.communityId);
        const communityLink = renderPeerLink(
          currentAction.communityId,
          community ? getPeerTitle(lang, community)! : chatFallbackText,
          props.asPreview,
        );
        return lang('ActionJoinedViaCommunity', { from: senderLink, community: communityLink }, { withNodes: true });
      }

      case 'chatJoinedByLink':
        return lang('ActionUserJoinedByLink', { from: senderLink }, { withNodes: true });

      case 'chatJoinedByRequest':
        return translateWithYou(lang, 'ActionJoinedByRequest', isOutgoing(), { from: senderLink });

      case 'channelJoined': {
        const { isViaRequest, inviterId } = currentAction;
        const inviter = inviterId ? selectPeer(global, inviterId) : undefined;
        if (inviter && inviterId !== props.currentUserId) {
          const inviterLink = renderPeerLink(
            inviterId,
            getPeerTitle(lang, inviter) || userFallbackText,
            props.asPreview,
          );
          return lang('ActionAddYou', { from: inviterLink }, { withNodes: true });
        }

        return lang(isViaRequest ? 'ActionChannelJoinedByRequestChannelYou' : 'ActionChannelJoinedYou');
      }

      case 'chatEditTitle': {
        const { title } = currentAction;
        if (isChannel) return lang('ActionChangedTitleChannel', { title });
        return translateWithYou(lang, 'ActionChangedTitle', isOutgoing(), { title, from: senderLink });
      }

      case 'chatDeletePhoto':
        return isChannel
          ? lang('ActionRemovedPhotoChannel')
          : translateWithYou(lang, 'ActionRemovedPhoto', isOutgoing(), { from: senderLink });

      case 'chatEditPhoto':
        return isChannel
          ? lang('ActionChangedPhotoChannel')
          : translateWithYou(lang, 'ActionChangedPhoto', isOutgoing(), { from: senderLink });

      case 'chatCreate': {
        const { title } = currentAction;
        return lang('ActionCreatedChat', { title, from: senderLink }, { withNodes: true });
      }

      case 'channelCreate': {
        const { title } = currentAction;
        return isChannel
          ? lang('ActionCreatedChannel')
          : translateWithYou(lang, 'ActionCreatedChat', isOutgoing(), { title, from: senderLink });
      }

      case 'chatMigrateTo': {
        const { channelId } = currentAction;
        const channel = selectChat(global, channelId)!;
        const channelLink = renderPeerLink(channelId, getPeerTitle(lang, channel)!, props.asPreview);
        return lang('ActionMigratedTo', { chat: channelLink }, { withNodes: true });
      }

      case 'channelMigrateFrom': {
        const { chatId: originalChatId, title } = currentAction;
        const originalChatLink = renderPeerLink(originalChatId, title || chatFallbackText, props.asPreview);
        return lang('ActionMigratedFrom', { chat: originalChatLink }, { withNodes: true });
      }

      case 'changeCommunity': {
        const { communityId } = currentAction;
        if (!communityId) {
          return lang('ActionRemovedFromCommunity', { from: senderLink }, { withNodes: true });
        }

        const community = selectChat(global, communityId);
        const communityLink = renderPeerLink(
          communityId,
          community ? getPeerTitle(lang, community)! : chatFallbackText,
          props.asPreview,
        );
        return lang('ActionAddedToCommunity', { from: senderLink, community: communityLink }, { withNodes: true });
      }

      case 'topicCreate': {
        const { title, iconColor, iconEmojiId } = currentAction;

        const topicId = selectThreadIdFromMessage(global, props.message);

        const topicLinkContent = (
          <>
            {iconEmojiId ? (
              <CustomEmoji documentId={iconEmojiId} className={styles.topicIcon} isSelectable />
            ) : (
              <TopicDefaultIcon className={styles.topicIcon} topicId={topicId} title={title} iconColor={iconColor} />
            )}
            {NBSP}
            {renderText(title)}
          </>
        );
        const topicLink = renderTopicLink(chatId(), Number(topicId), topicLinkContent, props.asPreview);
        return lang('ActionTopicCreated', { topic: topicLink }, { withNodes: true });
      }

      case 'topicEdit': {
        const { iconEmojiId, isClosed, isHidden, title } = currentAction;

        const topicId = selectThreadIdFromMessage(global, props.message);
        const currentTopic = selectTopic(global, chatId(), topicId);
        const topicLinkContent = (
          <>
            {iconEmojiId && iconEmojiId !== DEFAULT_TOPIC_ICON_ID ? (
              <CustomEmoji documentId={iconEmojiId} className={styles.topicIcon} isSelectable />
            ) : (
              <TopicDefaultIcon
                className={styles.topicIcon}
                topicId={topicId}
                title={title || currentTopic?.title || lang('ActionTopicPlaceholder')}
                iconColor={currentTopic?.iconColor}
              />
            )}
            {topicId !== GENERAL_TOPIC_ID && NBSP}
            {renderText(title || currentTopic?.title || lang('ActionTopicPlaceholder'))}
          </>
        );
        const topicLink = renderTopicLink(chatId(), Number(topicId), topicLinkContent, props.asPreview);

        const topicPlaceholderLink = renderTopicLink(
          chatId(),
          Number(topicId),
          lang('ActionTopicPlaceholder'),
          props.asPreview,
        );

        if (isClosed !== undefined) {
          if (props.isInsideTopic) {
            return lang(isClosed ? 'ActionTopicClosedInside' : 'ActionTopicReopenedInside');
          }

          return lang(
            isClosed ? 'ActionTopicClosed' : 'ActionTopicReopened',
            { from: senderLink, topic: topicLink },
            { withNodes: true },
          );
        }

        if (isHidden !== undefined) {
          if (props.isInsideTopic) {
            return lang(isHidden ? 'ActionTopicHiddenInside' : 'ActionTopicUnhiddenInside');
          }
          return lang(
            isHidden ? 'ActionTopicHidden' : 'ActionTopicUnhidden',
            { topic: topicLink },
            { withNodes: true },
          );
        }

        if (title && iconEmojiId) {
          return lang(
            'ActionTopicIconAndRenamed',
            {
              from: senderLink,
              link: topicPlaceholderLink,
              topic: topicLink,
            },
            { withNodes: true },
          );
        }

        if (title === undefined) {
          if (!iconEmojiId || iconEmojiId === DEFAULT_TOPIC_ICON_ID) {
            return lang(
              'ActionTopicIconRemoved',
              { from: senderLink, link: topicPlaceholderLink },
              { withNodes: true },
            );
          }
          return lang(
            'ActionTopicIconChanged',
            {
              from: senderLink,
              link: topicPlaceholderLink,
              emoji: <CustomEmoji documentId={iconEmojiId} className={styles.topicIcon} loopLimit={2} />,
            },
            { withNodes: true },
          );
        }

        return lang('ActionTopicRenamed', { from: senderLink, link: topicPlaceholderLink, title }, { withNodes: true });
      }

      case 'boostApply':
        return translateWithYou(
          lang,
          'ActionBoostApply',
          isOutgoing(),
          { from: senderLink, count: currentAction.boosts },
          { pluralValue: currentAction.boosts },
        );

      case 'chatAddUser': {
        const { userIds } = currentAction;

        if (props.sender?.id === userIds[0]) {
          return translateWithYou(lang, 'ActionUserJoined', isOutgoing(), { from: senderLink });
        }

        if (userIds.length === 1) {
          const user = selectPeer(global, userIds[0]);
          const userTitle = (user && getPeerTitle(lang, user)) || userFallbackText;
          const userLink = renderPeerLink(user?.id, userTitle, props.asPreview);
          return translateWithYou(lang, 'ActionAddUser', isOutgoing(), { from: senderLink, user: userLink });
        }

        const users = userIds.map((userId) => selectPeer(global, userId)).filter(Boolean);

        if (!users.length) {
          return translateWithYou(lang, 'ActionAddUser', isOutgoing(), { from: senderLink, user: userFallbackText });
        }

        const userLinks = users.map((user) =>
          renderPeerLink(user.id, getPeerTitle(lang, user) || userFallbackText, props.asPreview),
        );

        return translateWithYou(lang, 'ActionAddUsersMany', isOutgoing(), {
          from: senderLink,
          users: conjuctionWithNodes(lang, userLinks),
        });
      }

      case 'chatDeleteUser': {
        const { userId } = currentAction;
        if (props.sender?.id === userId) {
          return translateWithYou(lang, 'ActionUserLeft', isOutgoing(), { from: senderLink });
        }

        const user = selectPeer(global, userId);
        const userTitle = (user && getPeerTitle(lang, user)) || userFallbackText;
        const userLink = renderPeerLink(user?.id, userTitle, props.asPreview);
        return translateWithYou(lang, 'ActionKickUser', isOutgoing(), { from: senderLink, user: userLink });
      }

      case 'requestedPeer': {
        const { peerIds } = currentAction;
        const peerLinks = peerIds.map((peerId) => {
          const peer = selectPeer(global, peerId);
          return renderPeerLink(peerId, (peer && getPeerTitle(lang, peer)) || userFallbackText, props.asPreview);
        });
        return lang(
          'ActionRequestedPeer',
          {
            peer: conjuctionWithNodes(lang, peerLinks),
            bot: chatLink,
          },
          { withNodes: true },
        );
      }

      case 'botAllowed': {
        const { app, domain, isAttachMenu, isFromRequest } = currentAction;
        if (isAttachMenu) return lang('ActionAttachMenuBotAllowed');
        if (isFromRequest) return lang('ActionWebappBotAllowed');
        if (app) {
          const senderUsername = props.sender && getMainUsername(props.sender);
          const link = senderUsername && `${TME_LINK_PREFIX + senderUsername}/${app.shortName}`;
          const appLink = link ? (
            <Link onClick={() => openTelegramLink({ url: link })}>{app.title}</Link>
          ) : (
            lang('ActionBotAppPlaceholder')
          );
          return lang('ActionBotAllowedFromApp', { app: appLink }, { withNodes: true });
        }

        if (!domain) return lang(UNSUPPORTED_LANG_KEY);

        const url = ensureProtocol(domain);

        const link = <Link onClick={() => openUrl({ url })}>{domain}</Link>;
        return lang('ActionBotAllowedFromDomain', { domain: link }, { withNodes: true });
      }

      case 'giveawayLaunch': {
        const { stars } = currentAction;

        if (stars) {
          return lang(
            isChannel ? 'ActionGiveawayStarsStarted' : 'ActionGiveawayStarsStartedGroup',
            { from: senderLink, amount: renderStrong(formatStarsAsText(lang, stars)) },
            { withNodes: true },
          );
        }

        return lang(
          isChannel ? 'ActionGiveawayStarted' : 'ActionGiveawayStartedGroup',
          { from: senderLink },
          { withNodes: true },
        );
      }

      case 'giveawayResults': {
        const { winnersCount, isStars, unclaimedCount } = currentAction;
        if (!winnersCount) return lang('ActionGiveawayResultsNone');
        if (unclaimedCount) {
          return lang(isStars ? 'ActionGiveawayResultsStarsSome' : 'ActionGiveawayResultsSome');
        }

        return lang(
          isStars ? 'ActionGiveawayResultsStars' : 'ActionGiveawayResults',
          { count: winnersCount },
          { pluralValue: winnersCount },
        );
      }

      case 'walletTonConnectRequest':
        return lang('WalletConnectRequest');

      case 'gramTransfer': {
        const formattedAmount = formatTonFromNanos(currentAction.amount);
        const [whole, fraction] = formattedAmount.split('.');
        const groupedAmount = fraction ? `${lang.number(Number(whole))}.${fraction}` : lang.number(Number(whole));
        const amount = renderStrong(
          lang('GramAmountText', { amount: groupedAmount }, { pluralValue: Number(formattedAmount) }),
        );
        const fiat = formatTonInFiat(
          currentAction.amount,
          props.tonUsdRate,
          props.walletCurrency!,
          props.walletCurrencyRate,
          lang.code,
          {
            isInNanos: true,
          },
        );
        const worth = fiat ? `${NBSP}${lang('ActionGramTransferWorth', { fiat })}` : '';

        // The service chat reports transfers from senders the server does not name, so the text names no sender
        if (isServiceNotificationsChat) {
          return props.asPreview
            ? lang('ActionGramReceivedPreview', { amount }, { withNodes: true })
            : lang('ActionGramReceivedText', { amount, worth }, { withNodes: true });
        }

        // In a private chat the counterparty of an outgoing transfer is the chat itself
        const from = isOutgoing() ? chatLink : senderLink;

        if (props.asPreview) {
          return translateWithYou(lang, 'ActionGramTransferPreview', isOutgoing(), { from, amount });
        }

        return translateWithYou(lang, 'ActionGramTransferText', isOutgoing(), { from, amount, worth });
      }

      case 'giftStars':
      case 'giftPremium':
      case 'giftTon': {
        const { amount, currency, cryptoAmount, cryptoCurrency, type } = currentAction;

        const price = formatCurrency(lang, amount, currency, { asFontIcon: true });
        const cryptoPrice =
          cryptoAmount && type !== 'giftTon' ? formatCurrency(lang, cryptoAmount, cryptoCurrency!) : undefined;

        const cost = cryptoPrice ? lang('ActionGiftCostCrypto', { price, cryptoPrice }, { withNodes: true }) : price;

        if (isServiceNotificationsChat) {
          return lang('ActionGiftTextCostAnonymous', { cost }, { withNodes: true });
        }
        return translateWithYou(lang, 'ActionGiftTextCost', isOutgoing(), {
          from: senderLink,
          cost: renderStrong(cost),
        });
      }

      case 'prizeStars':
      case 'giftCode': {
        return translateWithYou(lang, 'ActionGiftTextUnknown', isOutgoing(), undefined);
      }

      case 'groupCall': {
        const { duration } = currentAction;
        const durationText = duration ? formatShortDuration(lang, duration) : undefined;
        if (durationText) {
          if (isChannel) {
            return lang('ActionGroupCallFinishedChannel', { duration: durationText });
          }
          return lang(
            'ActionGroupCallFinishedGroup',
            { from: senderLink, duration: durationText },
            { withNodes: true },
          );
        }

        if (isChannel) return lang('ActionGroupCallStartedChannel');
        return lang('ActionGroupCallStartedGroup', { from: senderLink }, { withNodes: true });
      }

      case 'groupCallScheduled': {
        const { scheduleDate } = currentAction;
        const formattedDate = formatDateTimeToString(scheduleDate * 1000, lang.code, true);

        if (isChannel) return lang('ActionGroupCallScheduledChannel', { date: formattedDate });
        return lang('ActionGroupCallScheduledGroup', { from: senderLink, date: formattedDate }, { withNodes: true });
      }

      case 'inviteToGroupCall': {
        const { userIds } = currentAction;

        if (userIds.length === 1) {
          const user = selectPeer(global, userIds[0]);
          const userTitle = (user && getPeerTitle(lang, user)) || userFallbackText;
          const userLink = renderPeerLink(user?.id, userTitle, props.asPreview);
          return translateWithYou(lang, 'ActionVideoInvited', isOutgoing(), { from: senderLink, user: userLink });
        }

        const users = userIds.map((userId) => selectPeer(global, userId)).filter(Boolean);

        if (!users.length) {
          return translateWithYou(lang, 'ActionVideoInvited', isOutgoing(), {
            from: senderLink,
            user: userFallbackText,
          });
        }

        const userLinks = users.map((user) =>
          renderPeerLink(user.id, getPeerTitle(lang, user) || userFallbackText, props.asPreview),
        );

        return translateWithYou(lang, 'ActionVideoInvitedMany', isOutgoing(), {
          from: senderLink,
          users: conjuctionWithNodes(lang, userLinks),
        });
      }

      case 'paymentSent': {
        const { currency, totalAmount, isRecurringInit, isRecurringUsed } = currentAction;

        const cost = renderStrong(formatCurrency(lang, totalAmount, currency, { asFontIcon: true }));
        const invoice = props.replyMessage && getMessageInvoice(props.replyMessage);
        const invoiceTitle = invoice?.title;

        if (isRecurringUsed) {
          return lang('ActionPaymentUsedRecurring', { amount: cost }, { withNodes: true });
        }

        if (!invoiceTitle) {
          if (isRecurringInit) {
            return lang('ActionPaymentInitRecurring', { amount: cost, user: chatLink }, { withNodes: true });
          }

          return lang('ActionPaymentDone', { amount: cost, user: chatLink }, { withNodes: true });
        }

        if (isRecurringInit) {
          return lang(
            'ActionPaymentInitRecurringFor',
            {
              amount: cost,
              user: chatLink,
              invoice: renderMessageLink(props.replyMessage, invoiceTitle, props.asPreview),
            },
            { withNodes: true },
          );
        }

        return lang(
          'ActionPaymentDoneFor',
          {
            amount: cost,
            user: chatLink,
            invoice: renderMessageLink(props.replyMessage, invoiceTitle, props.asPreview),
          },
          { withNodes: true },
        );
      }

      case 'paymentRefunded': {
        const { currency, totalAmount, peerId } = currentAction;
        const peer = selectPeer(global, peerId);
        const peerTitle = (peer && getPeerTitle(lang, peer)) || userFallbackText;
        const peerLink = renderPeerLink(peer?.id, peerTitle, props.asPreview);
        const amount = formatCurrency(lang, totalAmount, currency, { asFontIcon: true });

        return lang('ActionPaymentRefunded', { peer: peerLink, amount }, { withNodes: true });
      }

      case 'starGift': {
        const { gift, alreadyPaidUpgradeStars, peerId, savedId, fromId, isPrepaidUpgrade, isAuctionAcquired } =
          currentAction;
        const isToChannel = Boolean(peerId && savedId);

        const fromPeer = fromId ? selectPeer(global, fromId) : props.sender;
        const fromTitle = (fromPeer && getPeerTitle(lang, fromPeer)) || userFallbackText;
        const fromLink = renderPeerLink(fromPeer?.id, fromTitle, props.asPreview);

        const toPeer = peerId ? selectPeer(global, peerId) : undefined;
        const toTitle =
          (toPeer && getPeerTitle(lang, toPeer)) || (isToChannel ? channelFallbackText : userFallbackText);
        const toLink = renderPeerLink(toPeer?.id, toTitle, props.asPreview);

        const starsAmount = gift.stars + (alreadyPaidUpgradeStars || 0);
        const cost = renderStrong(formatStarsAsText(lang, starsAmount));

        if (isAuctionAcquired) {
          return lang('ActionStarGiftAuctionWon', { cost }, { withNodes: true });
        }

        if (isPrepaidUpgrade && gift.upgradeStars) {
          const upgradeCost = renderStrong(formatStarsAsText(lang, gift.upgradeStars));

          return translateWithYou(lang, 'ActionStarGiftPrepaidUpgrade', isOutgoing(), {
            peer: isOutgoing() ? toLink : senderLink,
            cost: upgradeCost,
          });
        }

        if (isToChannel) {
          const channelPeer = selectPeer(global, peerId!);
          const isYou = fromPeer?.id === props.currentUserId;

          const channelTitle = (channelPeer && getPeerTitle(lang, channelPeer)) || channelFallbackText;
          const channelLink = renderPeerLink(peerId, channelTitle, props.asPreview);
          return translateWithYou(lang, 'ActionStarGiftSentChannel', isYou, {
            user: fromLink,
            channel: channelLink,
            cost,
          });
        }

        if (isServiceNotificationsChat) {
          return lang('ActionStarGiftReceivedAnonymous', { cost }, { withNodes: true });
        }

        if (isSavedMessages) {
          return lang('ActionStarGiftSelfBought', { cost }, { withNodes: true });
        }

        if (isOutgoing()) {
          return lang('ActionStarGiftSent', { cost }, { withNodes: true });
        }

        return lang('ActionStarGiftReceived', { user: senderLink, cost }, { withNodes: true });
      }

      case 'starGiftUnique': {
        const {
          isTransferred,
          isUpgrade,
          savedId,
          peerId,
          fromId,
          resaleAmount,
          gift,
          transferStars,
          isPrepaidUpgrade,
          isFromOffer,
        } = currentAction;

        const isToChannel = Boolean(peerId && savedId);

        const fromPeer = fromId ? selectPeer(global, fromId) : props.sender;
        const fromTitle = (fromPeer && getPeerTitle(lang, fromPeer)) || userFallbackText;
        const fromLink = renderPeerLink(fromPeer?.id, fromTitle, props.asPreview);

        const toPeer = peerId ? selectPeer(global, peerId) : undefined;
        const toTitle =
          (toPeer && getPeerTitle(lang, toPeer)) || (isToChannel ? channelFallbackText : userFallbackText);
        const toLink = renderPeerLink(toPeer?.id, toTitle, props.asPreview);

        if (isFromOffer && resaleAmount) {
          const giftName = lang('GiftUnique', { title: gift.title, number: gift.number });
          const amountText = formatCurrencyAmountAsText(lang, resaleAmount);

          const formattedAmountText = props.asPreview ? amountText : renderStrong(amountText);
          const formattedGiftName = props.asPreview ? giftName : renderStrong(giftName);

          if (isOutgoing()) {
            return lang(
              'ActionStarGiftSoldFromOffer',
              { user: chatLink, gift: formattedGiftName, cost: formattedAmountText },
              { withNodes: true },
            );
          }

          return lang(
            'ActionStarGiftBoughtFromOffer',
            { user: senderLink, gift: formattedGiftName, cost: formattedAmountText },
            { withNodes: true },
          );
        }

        if (isPrepaidUpgrade) {
          if (isOutgoing()) {
            return lang('ActionStarGiftPrepaidUpgradedYou');
          }
          return lang('ActionStarGiftPrepaidUpgraded', { user: toLink }, { withNodes: true });
        }

        if (resaleAmount && !transferStars) {
          const amountText = formatCurrencyAmountAsText(lang, resaleAmount);

          return lang(
            isOutgoing()
              ? 'ApiMessageMessageActionResaleStarGiftUniqueOutgoing'
              : 'ApiMessageMessageActionResaleStarGiftUniqueIncoming',
            {
              gift: lang('GiftUnique', { title: gift.title, number: gift.number }),
              stars: renderStrong(amountText),
            },
            { withNodes: true },
          );
        }

        if (isToChannel) {
          const channelPeer = selectPeer(global, peerId!);
          const isYou = fromPeer?.id === props.currentUserId;
          const isAnonymous = fromPeer?.id === SERVICE_NOTIFICATIONS_USER_ID;

          const channelTitle = (channelPeer && getPeerTitle(lang, channelPeer)) || channelFallbackText;
          const channelLink = renderPeerLink(peerId, channelTitle, props.asPreview);

          if (isUpgrade) {
            return translateWithYou(lang, 'ActionStarGiftUpgradedChannel', isYou, {
              user: fromLink,
              channel: channelLink,
            });
          }

          if (isTransferred) {
            if (isAnonymous) {
              return lang('ActionStarGiftTransferredUnknownChannel', { channel: channelLink }, { withNodes: true });
            }

            return translateWithYou(lang, 'ActionStarGiftTransferredChannel', isYou, {
              user: fromLink,
              channel: channelLink,
            });
          }
        }

        if (isSavedMessages) {
          if (isUpgrade) return lang('ActionStarGiftUpgradedSelf');
          if (isTransferred) return lang('ActionStarGiftTransferredSelf');
          if (resaleAmount) {
            const amountText = formatCurrencyAmountAsText(lang, resaleAmount);
            return lang(
              'ApiMessageMessageActionResaleStarGiftUniqueOutgoing',
              {
                gift: lang('GiftUnique', { title: gift.title, number: gift.number }),
                stars: props.asPreview ? amountText : renderStrong(amountText),
              },
              { withNodes: true },
            );
          }
          if (gift.isCrafted) return lang('ActionStarGiftCraftedSelf');
        }

        if (isUpgrade) {
          if (isOutgoing()) {
            return lang('ActionStarGiftUpgradedMine', { user: chatLink }, { withNodes: true });
          }

          if (isSavedMessages) {
            return lang('ActionStarGiftUpgradedSelf');
          }

          return lang('ActionStarGiftUpgradedUser', { user: senderLink }, { withNodes: true });
        }

        if ((isTransferred || transferStars) && !resaleAmount) {
          if (props.sender?.id === SERVICE_NOTIFICATIONS_USER_ID) {
            return lang('ActionStarGiftTransferredUnknown');
          }

          if (isSavedMessages) {
            return lang('ActionStarGiftTransferredSelf');
          }

          if (isOutgoing()) {
            return lang('ActionStarGiftTransferredMine', { user: chatLink }, { withNodes: true });
          }

          return lang('ActionStarGiftTransferred', { user: senderLink }, { withNodes: true });
        }

        if (isOutgoing()) {
          return lang('ActionGiftUniqueSent');
        }

        return lang('ActionGiftUniqueReceived', { user: senderLink }, { withNodes: true });
      }

      case 'suggestProfilePhoto': {
        const actionPeer = (isOutgoing() ? props.chat : props.sender)!;
        const actionPeerLink = renderPeerLink(
          actionPeer.id,
          getPeerTitle(lang, actionPeer) || userFallbackText,
          props.asPreview,
        );

        return translateWithYou(lang, 'ActionSuggestedPhoto', isOutgoing(), { user: actionPeerLink });
      }

      case 'suggestBirthday': {
        const actionPeer = (isOutgoing() ? props.chat : props.sender)!;
        const actionPeerLink = renderPeerLink(
          actionPeer.id,
          getPeerTitle(lang, actionPeer) || userFallbackText,
          props.asPreview,
        );

        return translateWithYou(lang, 'ActionSuggestedBirthday', isOutgoing(), { user: actionPeerLink });
      }

      case 'webViewDataSent':
        return lang('ActionWebviewDataDone', { text: currentAction.text });

      case 'expired': {
        const { isRoundVideo, isVoice } = currentAction;
        if (isVoice) return lang('ActionExpiredVoice');
        if (isRoundVideo) return lang('ActionExpiredVideo');

        return lang(UNSUPPORTED_LANG_KEY);
      }

      case 'historyClear':
        return lang('ActionHistoryCleared');

      case 'setMessagesTtl': {
        const { period, autoSettingFromId } = currentAction;

        if (period === 0) {
          if (isChannel) return lang('ActionTTLChannelDisabled');

          return isOutgoing()
            ? lang('ActionTTLYouDisabled')
            : lang('ActionTTLDisabled', { from: senderLink }, { withNodes: true });
        }

        const time = formatCountdown(lang, period);
        if (autoSettingFromId) {
          if (autoSettingFromId === props.currentUserId) {
            return lang('AutoDeleteGlobalActionFromYou', { time });
          }

          const autoSettingFrom = selectPeer(global, autoSettingFromId);
          const autoSettingFromTitle = autoSettingFrom && getPeerTitle(lang, autoSettingFrom);
          const autoSettingFromLink = renderPeerLink(
            autoSettingFrom?.id,
            autoSettingFromTitle || userFallbackText,
            props.asPreview,
          );

          return lang('AutoDeleteGlobalAction', { from: autoSettingFromLink, time }, { withNodes: true });
        }

        if (isChannel) return lang('ActionTTLChannelChanged', { time });

        return isOutgoing()
          ? lang('ActionTTLYouChanged', { time })
          : lang('ActionTTLChanged', { from: senderLink, time }, { withNodes: true });
      }

      case 'screenshotTaken':
        return translateWithYou(lang, 'ActionScreenshotTaken', isOutgoing(), { from: senderLink });

      case 'contactSignUp':
        return lang('ActionUserRegistered', { from: senderLink }, { withNodes: true });

      case 'customAction':
        return currentAction.message;

      case 'paidMessagesPrice': {
        const { stars, isAllowedInChannel } = currentAction;
        if (stars === 0) {
          if (isChannel) {
            return lang(
              isAllowedInChannel ? 'ActionMessageChannelFree' : 'ActionMessageChannelDisabled',
              { peer: chatLink },
              { withNodes: true },
            );
          }
          return translateWithYou(lang, 'ActionPaidMessagePriceFree', isOutgoing(), { peer: senderLink });
        }
        return translateWithYou(
          lang,
          'ActionPaidMessagePrice',
          isOutgoing(),
          {
            peer: senderLink,
            amount: formatStarsAsText(lang, stars),
          },
          { withMarkdown: true },
        );
      }

      case 'paidMessagesRefunded': {
        const { stars } = currentAction;
        const user = selectPeer(global, chatId());
        const userTitle = (user && getPeerTitle(lang, user)) || userFallbackText;

        const key = isOutgoing()
          ? 'ApiMessageActionPaidMessagesRefundedOutgoing'
          : 'ApiMessageActionPaidMessagesRefundedIncoming';

        return lang(
          key,
          {
            stars: formatStarsAsText(lang, stars),
            user: renderPeerLink(user?.id, userTitle),
          },
          { withNodes: true, withMarkdown: true },
        );
      }

      case 'suggestedPostSuccess': {
        const { amount: price } = currentAction;
        const currency = price?.currency || STARS_CURRENCY_CODE;
        const amount = price?.amount || 0;

        const channel = props.chat?.isMonoforum ? selectMonoforumChannel(global, chatId()) : props.chat;
        const channelTitle = channel && getPeerTitle(lang, channel);
        const channelLink = renderPeerLink(channel?.id, channelTitle || channelFallbackText, props.asPreview);

        const formattedAmount =
          currency === TON_CURRENCY_CODE
            ? formatTonAsText(lang, convertTonFromNanos(amount))
            : formatStarsAsText(lang, amount);

        return lang(
          'ActionSuggestedPostSuccess',
          {
            channel: channelLink,
            amount: formattedAmount,
          },
          { withNodes: true },
        );
      }
      case 'suggestedPostRefund': {
        const { payerInitiated } = currentAction;

        const postSender = props.replyMessage ? selectSender(global, props.replyMessage) : props.sender;
        const postSenderTitle = postSender && getPeerTitle(lang, postSender);
        const postSenderLink = renderPeerLink(postSender?.id, postSenderTitle || userFallbackText, props.asPreview);

        const price = props.replyMessage?.suggestedPostInfo?.price;
        const currency = price?.currency || STARS_CURRENCY_CODE;
        const amount = price?.amount || 0;

        const channel = props.chat?.isMonoforum ? selectMonoforumChannel(global, chatId()) : props.chat;
        const channelTitle = channel && getPeerTitle(lang, channel);
        const channelLink = renderPeerLink(channel?.id, channelTitle || channelFallbackText, props.asPreview);

        const formattedAmount =
          currency === TON_CURRENCY_CODE
            ? formatTonAsText(lang, convertTonFromNanos(amount))
            : formatStarsAsText(lang, amount);

        if (payerInitiated) {
          return lang(
            'SuggestedPostRefundedByUser',
            {
              amount: formattedAmount,
              user: postSenderLink,
              channel: channelLink,
            },
            { withNodes: true, withMarkdown: true },
          );
        }

        return lang(
          'SuggestedPostRefundedByChannel',
          {
            amount: formattedAmount,
            peer: postSenderLink,
            channel: channelLink,
          },
          { withNodes: true, withMarkdown: true },
        );
      }
      case 'suggestedPostApproval': {
        const { isRejected, isBalanceTooLow, rejectComment } = currentAction;

        if (isRejected) {
          return translateWithYou(
            lang,
            rejectComment ? 'SuggestedPostRejectedWithReason' : 'SuggestedPostRejected',
            isOutgoing(),
            { peer: senderLink },
            { withMarkdown: true },
          );
        }

        if (isBalanceTooLow) {
          const replyMessageSender = props.replyMessage ? selectSender(global, props.replyMessage) : props.sender;
          const replyPeerTitle = replyMessageSender && getPeerTitle(lang, replyMessageSender);
          const userLink = renderPeerLink(replyMessageSender?.id, replyPeerTitle || userFallbackText, props.asPreview);

          const currency = props.replyMessage?.suggestedPostInfo?.price?.currency || STARS_CURRENCY_CODE;
          const currencyName = currency === TON_CURRENCY_CODE ? lang('CurrencyGram') : lang('CurrencyStars');

          return lang(
            'SuggestedPostBalanceTooLow',
            {
              peer: userLink,
              currency: currencyName,
            },
            { withNodes: true, withMarkdown: true },
          );
        }

        const channel = props.chat?.isMonoforum ? selectMonoforumChannel(global, chatId()) : props.chat;
        const channelTitle = channel && getPeerTitle(lang, channel);
        const channelLink = renderPeerLink(channel?.id, channelTitle || channelFallbackText, props.asPreview);

        const { scheduleDate } = currentAction;
        if (scheduleDate) {
          const publishDate = formatScheduledDateTime(scheduleDate, lang, oldLang);
          const isPostPublished = scheduleDate <= getServerTime();

          return translateWithYou(
            lang,
            isPostPublished ? 'SuggestedPostPublished' : 'SuggestedPostPublishSchedule',
            isOutgoing(),
            { peer: channelLink, date: publishDate },
            { withMarkdown: true },
          );
        }

        return lang(UNSUPPORTED_LANG_KEY);
      }
      case 'todoCompletions': {
        const { completedIds, incompletedIds } = currentAction;

        let completedItem;
        let incompletedItem;
        const todo = (props.replyMessage ? getMessageContent(props.replyMessage) : undefined)?.todo;
        if (todo) {
          const todoItems = todo.todo.items;
          completedItem = todoItems.find((item) => completedIds.includes(item.id));
          incompletedItem = todoItems.find((item) => incompletedIds.includes(item.id));
        }

        if (incompletedItem) {
          const incompletedTaskTitle = incompletedItem.title;

          const incompletedTaskLink = renderMessageLink(
            props.replyMessage,
            renderTextWithEntities({
              text: incompletedTaskTitle.text,
              entities: incompletedTaskTitle.entities,
              asPreview: true,
            }),
            props.asPreview,
          );

          return translateWithYou(lang, 'MessageActionTodoCompletionsAsNotDone', isOutgoing(), {
            peer: senderLink,
            task: incompletedTaskLink,
          });
        }

        if (completedItem) {
          const completedTaskTitle = completedItem.title;
          const completedTaskLink = renderMessageLink(
            props.replyMessage,
            renderTextWithEntities({
              text: completedTaskTitle.text,
              entities: completedTaskTitle.entities,
              asPreview: true,
            }),
            props.asPreview,
          );

          return translateWithYou(lang, 'MessageActionTodoCompletionsAsDone', isOutgoing(), {
            peer: senderLink,
            task: completedTaskLink,
          });
        }

        if (completedIds) {
          const completedText = lang(
            'MessageActionTodoTaskCount',
            {
              count: completedIds.length,
            },
            { pluralValue: completedIds.length },
          );
          const completedLink = renderMessageLink(
            props.replyMessage,
            renderTextWithEntities({
              text: completedText,
              asPreview: true,
            }),
            props.asPreview,
            { noEllipsis: true },
          );
          return translateWithYou(lang, 'MessageActionTodoCompletionsAsDone', isOutgoing(), {
            peer: senderLink,
            task: completedLink,
          });
        }

        const incompletedText = lang(
          'MessageActionTodoTaskCount',
          {
            count: incompletedIds.length,
          },
          { pluralValue: incompletedIds.length },
        );
        const incompletedLink = renderMessageLink(
          props.replyMessage,
          renderTextWithEntities({
            text: incompletedText,
            asPreview: true,
          }),
          props.asPreview,
          { noEllipsis: true },
        );

        return translateWithYou(lang, 'MessageActionTodoCompletionsAsNotDone', isOutgoing(), {
          peer: senderLink,
          task: incompletedLink,
        });
      }

      case 'todoAppendTasks': {
        const { items } = currentAction;
        const todo = (props.replyMessage ? getMessageContent(props.replyMessage) : undefined)?.todo;

        const listTitle = todo?.todo.title.text || '';
        const listLink = renderMessageLink(
          props.replyMessage,
          renderTextWithEntities({
            text: listTitle,
            asPreview: true,
          }),
          props.asPreview,
        );

        if (items.length === 1) {
          const taskTitle = items[0].title;
          const taskLink = renderMessageLink(
            props.replyMessage,
            renderTextWithEntities({
              text: taskTitle.text,
              entities: taskTitle.entities,
              asPreview: true,
            }),
            props.asPreview,
          );

          return translateWithYou(lang, 'MessageActionAppendTodo', isOutgoing(), {
            peer: senderLink,
            task: taskLink,
            list: listLink,
          });
        }

        const tasksText = lang(
          'MessageActionTodoTaskCount',
          {
            count: items.length,
          },
          { pluralValue: items.length },
        );
        const tasksLink = renderMessageLink(
          props.replyMessage,
          renderTextWithEntities({
            text: tasksText,
            asPreview: true,
          }),
          props.asPreview,
          { noEllipsis: true },
        );

        return translateWithYou(lang, 'MessageActionAppendTodoMultiple', isOutgoing(), {
          peer: senderLink,
          tasks: tasksLink,
          list: listLink,
        });
      }

      case 'pollAppendAnswer':
      case 'pollDeleteAnswer': {
        const optionLink = renderMessageLink(
          props.replyMessage,
          renderTextWithEntities({
            text: currentAction.answer.text.text,
            entities: currentAction.answer.text.entities,
            asPreview: true,
          }),
          props.asPreview,
        );

        return translateWithYou(
          lang,
          currentAction.type === 'pollAppendAnswer' ? 'MessageActionPollAppendAnswer' : 'MessageActionPollDeleteAnswer',
          isOutgoing(),
          {
            peer: senderLink,
            option: optionLink,
          },
        );
      }

      case 'phoneCall': // Rendered as a regular message, but considered an action for the summary
        return lang(getCallMessageKey(currentAction, isOutgoing()));

      case 'noForwardsToggle': {
        const { prevValue, newValue } = currentAction;
        if (newValue && newValue === prevValue) {
          return lang('ActionSharingStillDisabled');
        }
        return translateWithYou(lang, newValue ? 'ActionSharingDisabled' : 'ActionSharingEnabled', isOutgoing(), {
          from: senderLink,
        });
      }

      case 'noForwardsRequest': {
        return isOutgoing()
          ? lang('NoForwardsRequestYouTitle')
          : lang('NoForwardsRequestTitle', { user: senderLink }, { withNodes: true });
      }

      case 'newCreatorPending': {
        const { newCreatorId } = currentAction;
        const newCreator = selectPeer(global, newCreatorId);
        const newCreatorTitle = (newCreator && getPeerTitle(lang, newCreator)) || userFallbackText;
        const newCreatorLink = renderPeerLink(newCreator?.id, newCreatorTitle, props.asPreview);
        return lang('ActionNewCreatorPending', { user: newCreatorLink, from: senderLink }, { withNodes: true });
      }

      case 'changeCreator': {
        const { newCreatorId } = currentAction;
        const newCreator = selectPeer(global, newCreatorId);
        const newCreatorTitle = (newCreator && getPeerTitle(lang, newCreator)) || userFallbackText;
        const newCreatorLink = renderPeerLink(newCreator?.id, newCreatorTitle, props.asPreview);
        return lang('ActionChangeCreator', { user: newCreatorLink, from: senderLink }, { withNodes: true });
      }

      case 'starGiftPurchaseOffer': {
        const { gift, price } = currentAction;

        const peer = isOutgoing() ? props.chat : props.sender;
        const peerTitle = (peer && getPeerTitle(lang, peer)) || userFallbackText;
        const peerLink = renderPeerLink(peer?.id, peerTitle, props.asPreview);

        const giftName = lang('GiftUnique', { title: gift.title, number: gift.number });
        const priceText = formatCurrencyAmountAsText(lang, price);

        const formattedGiftName = props.asPreview ? giftName : renderStrong(giftName);
        const formattedPriceText = props.asPreview ? priceText : renderStrong(priceText);

        return lang(
          isOutgoing() ? 'ActionStarGiftOfferOutgoing' : 'ActionStarGiftOfferIncoming',
          {
            peer: peerLink,
            cost: formattedPriceText,
            gift: formattedGiftName,
          },
          { withNodes: true },
        );
      }

      case 'starGiftPurchaseOfferDeclined': {
        const { gift, price } = currentAction;

        const peer = isOutgoing() ? props.chat : props.sender;
        const peerTitle = (peer && getPeerTitle(lang, peer)) || userFallbackText;
        const peerLink = renderPeerLink(peer?.id, peerTitle, props.asPreview);

        const giftName = lang('GiftUnique', { title: gift.title, number: gift.number });
        const priceText = formatCurrencyAmountAsText(lang, price);

        const formattedGiftName = props.asPreview ? giftName : renderStrong(giftName);
        const formattedPriceText = props.asPreview ? priceText : renderStrong(priceText);

        return lang(
          isOutgoing() ? 'ActionStarGiftOfferDeclinedOutgoing' : 'ActionStarGiftOfferDeclinedIncoming',
          {
            peer: peerLink,
            gift: formattedGiftName,
            cost: formattedPriceText,
          },
          { withNodes: true },
        );
      }

      default:
        return lang(UNSUPPORTED_LANG_KEY);
    }
  };

  return <>{renderActionText()}</>;
};

const mapStateToProps = (global: GlobalState, { message }: OwnProps): Complete<StateProps> => {
  const chat = selectChat(global, message.chatId);
  const sender = selectSender(global, message);

  const isGramTransfer = message.content.action?.type === 'gramTransfer';
  const { replyToMsgId, replyToPeerId } = getMessageReplyInfo(message) || {};
  const replyMessage = replyToMsgId
    ? selectChatMessage(global, replyToPeerId || message.chatId, replyToMsgId)
    : undefined;

  return {
    currentUserId: global.currentUserId,
    replyMessage,
    chat,
    sender,
    tonUsdRate: isGramTransfer ? global.appConfig.tonUsdRate : undefined,
    walletCurrency: isGramTransfer ? selectWalletCurrency(global) : undefined,
    walletCurrencyRate: isGramTransfer ? selectWalletCurrencyRate(global) : undefined,
  };
};

export default ActionMessageText;
