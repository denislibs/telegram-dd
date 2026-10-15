import { type Accessor, createEffect, createMemo, frameMutation, requestMutation } from 'frameact';
import { getActions } from '../../../../global';

import type {
  ApiChat,
  ApiDraft,
  ApiMessage,
  ApiPeer,
  ApiTopic,
  ApiTypingStatus,
  StatefulMediaContent,
} from '../../../../api/types';
import type { ObserveFn } from '../../../../hooks/useIntersectionObserver';
import type { CommunityMember } from './useCommunityMembers';

import { CHAT_HEIGHT_PX } from '../../../../config';
import {
  getMessageIsSpoiler,
  getMessageRoundVideo,
  getMessageSticker,
  getMessageVideo,
  isChatCommunity,
} from '../../../../global/helpers';
import { getMessageSenderName } from '../../../../global/helpers/peers';
import { waitStartingTransitionsEnd } from '../../../../util/animations/waitTransitionEnd';
import buildClassName from '../../../../util/buildClassName';
import { depsOf } from '../../../../util/effectDeps';
import { isUserId } from '../../../../util/entities/ids';
import renderText from '../../../common/helpers/renderText';
import { renderTextWithEntities } from '../../../common/helpers/renderTextWithEntities';
import { ChatAnimationTypes } from './useChatAnimationType';

import useMessageMediaHash from '../../../../hooks/media/useMessageMediaHash';
import useThumbnail from '../../../../hooks/media/useThumbnail';
import useEnsureStory from '../../../../hooks/useEnsureStory';
import useLang from '../../../../hooks/useLang';
import useMedia from '../../../../hooks/useMedia';

import Avatar from '../../../common/Avatar';
import ChatForumLastMessage from '../../../common/ChatForumLastMessage';
import ChatGroupedLastMessage from '../../../common/ChatGroupedLastMessage';
import Icon from '../../../common/icons/Icon';
import MessageSummary from '../../../common/MessageSummary';
import TypingStatus from '../../../common/TypingStatus';

import styles from '../../../common/ChatGroupedLastMessage.module.scss';

function getLatestTypingStatusTimestamp(typingStatusByPeerId?: Record<string, ApiTypingStatus>) {
  if (!typingStatusByPeerId) {
    return undefined;
  }

  const timestamps = Object.values(typingStatusByPeerId).map(({ timestamp }) => timestamp);

  return timestamps.length ? Math.max(...timestamps) : undefined;
}

type Params = {
  chat?: ApiChat;
  topicIds?: number[];
  lastMessage?: ApiMessage;
  communityMembers?: CommunityMember[];
  statefulMediaContent: StatefulMediaContent | undefined;
  chatId: string;
  typingStatusByPeerId?: Record<string, ApiTypingStatus>;
  draft?: ApiDraft;
  lastMessageTopic?: ApiTopic;
  lastMessageSender?: ApiPeer;
  observeIntersection?: ObserveFn;
  isTopic?: boolean;
  isSavedDialog?: boolean;
  isPreview?: boolean;
  hasTags?: boolean;

  animationType: ChatAnimationTypes;
  orderDiff: number;
  shiftDiff: number;
  withInterfaceAnimations?: boolean;
  shouldForceNonForumView?: boolean;
  onReorderAnimationEnd?: NoneToVoidFunction;
};

// Deviation: a frameact hook runs once, so every parameter is an accessor (`() => props.x`; `isTopic` may be left out)
// and the hook returns the render function of tt (its JSX binds the accessors, so it needs no re-render), a callback
// `ref` for the row element and `element` (the row element, for hooks that take a ref accessor).
export default function useChatListEntry(
  params: { [K in keyof Omit<Params, 'isTopic'>]-?: Accessor<Params[K]> } & { isTopic?: Accessor<boolean | undefined> },
) {
  const { openChat } = getActions();

  const lang = useLang();
  let ref: HTMLDivElement | undefined;

  const p = params;
  const isTopic = () => p.isTopic?.();

  const communityItems = createMemo(() =>
    p.communityMembers()?.map(({ id, title, peer, isUnread }) => ({
      key: id,
      title,
      isUnread,
      icon: <Avatar peer={peer} size="micro" className={styles.avatar} />,
    })),
  );

  // Mirrors a forum opening its unread topic
  const handleCommunityMemberClick = () => {
    const mainCommunityMember = communityItems()?.[0];
    if (!mainCommunityMember?.isUnread) return false;

    openChat({ id: mainCommunityMember.key, shouldReplaceHistory: true }, { forceOnHeavyAnimation: true });

    return true;
  };

  const storyData = () => p.lastMessage()?.content.storyData;
  const shouldTryLoadingStory = () => p.statefulMediaContent() && !p.statefulMediaContent()!.story;

  useEnsureStory(
    () => (shouldTryLoadingStory() ? storyData()?.peerId : undefined),
    () => storyData()?.id,
    () => p.statefulMediaContent()?.story,
  );

  const mediaContent = createMemo(() => p.statefulMediaContent()?.story || p.lastMessage());
  const mediaHasPreview = createMemo(() => Boolean(mediaContent() && !getMessageSticker(mediaContent()!)));

  const thumbDataUri = useThumbnail(mediaContent);

  const mediaThumbnail = () => (mediaHasPreview() ? thumbDataUri() : undefined);
  const mediaHash = useMessageMediaHash(mediaContent, 'micro');
  const mediaBlobUrl = useMedia(() => (mediaHasPreview() ? mediaHash() : undefined));
  const isRoundVideo = createMemo(() => Boolean(p.lastMessage() && getMessageRoundVideo(p.lastMessage()!)));

  // What `renderLastMessageOrTyping` shows; the memo only changes when the kind of the content does
  const lastMessageKind = createMemo(() => {
    const lastMessage = p.lastMessage();
    const typingStatusByPeerId = p.typingStatusByPeerId();
    const latestTypingStatusTimestamp = getLatestTypingStatusTimestamp(typingStatusByPeerId);

    if (
      !p.isSavedDialog() &&
      !p.isPreview() &&
      typingStatusByPeerId &&
      lastMessage &&
      latestTypingStatusTimestamp &&
      latestTypingStatusTimestamp > lastMessage.date
    ) {
      return 'typing';
    }

    const draft = p.draft();
    const isDraftReplyToTopic = draft && draft.replyInfo?.replyToMsgId === p.lastMessageTopic()?.id;
    const isEmptyLocalReply = draft?.replyInfo && !draft.text && draft.isLocal;

    const canDisplayDraft =
      !p.chat()?.isForum &&
      !p.isSavedDialog() &&
      !p.isPreview() &&
      draft &&
      !isEmptyLocalReply &&
      (!isTopic() || !isDraftReplyToTopic);

    if (canDisplayDraft) {
      return 'draft';
    }

    if (!lastMessage) {
      return undefined;
    }

    return 'message';
  });

  const senderName = createMemo(() => {
    const lastMessage = p.lastMessage();
    const lastMessageSender = p.lastMessageSender();
    if (!lastMessage || !lastMessageSender) return undefined;

    // A community previews a message from its member chat
    const chat = p.chat();
    const senderChatId = chat && isChatCommunity(chat) ? lastMessage.chatId : p.chatId();
    return getMessageSenderName(lang, senderChatId, lastMessageSender);
  });

  // Returns bindings, not a snapshot: it is evaluated once per row and the content follows the accessors
  const renderLastMessageOrTyping = () => (
    <>
      {lastMessageKind() === 'typing' && (
        <TypingStatus typingStatusByPeerId={p.typingStatusByPeerId()!} isPrivate={isUserId(p.chatId())} />
      )}
      {lastMessageKind() === 'draft' && (
        <p class="last-message" dir={lang.isRtl ? 'auto' : 'ltr'}>
          <span class="draft">{lang('ChatDraftPrefix')}</span>
          <span class="last-message-summary" dir="auto">
            {renderTextWithEntities({
              text: p.draft()?.text?.text || '',
              entities: p.draft()?.text?.entities,
              asPreview: true,
              withTranslucentThumbs: true,
            })}
          </span>
        </p>
      )}
      {lastMessageKind() === 'message' && (
        <p class="last-message shared-canvas-container" dir={lang.isRtl ? 'auto' : 'ltr'}>
          {senderName() && (
            <>
              <span class="sender-name">{renderText(senderName())}</span>
              <span class="colon">:</span>
            </>
          )}
          {!p.isSavedDialog() && p.lastMessage()?.forwardInfo && (
            <Icon name="share-filled" className="chat-prefix-icon" />
          )}
          {p.lastMessage()?.replyInfo?.type === 'story' && <Icon name="story-reply" className="chat-prefix-icon" />}
          <span class="last-message-summary" dir="auto">
            {renderSummary(
              () => p.lastMessage()!,
              p.observeIntersection,
              () => mediaBlobUrl() || mediaThumbnail(),
              isRoundVideo,
            )}
          </span>
        </p>
      )}
    </>
  );

  const isCommunity = createMemo(() => Boolean(p.chat() && isChatCommunity(p.chat()!)));
  const shouldRenderAsForum = createMemo(() =>
    Boolean(p.chat()?.isForum && !isTopic() && !p.shouldForceNonForumView()),
  );

  function renderSubtitle() {
    return (
      <>
        {isCommunity() ? (
          <ChatGroupedLastMessage
            items={communityItems()}
            hasTags={p.hasTags()}
            renderLastMessage={renderLastMessageOrTyping}
            onMainItemClick={handleCommunityMemberClick}
          />
        ) : shouldRenderAsForum() ? (
          <ChatForumLastMessage
            chat={p.chat()!}
            renderLastMessage={renderLastMessageOrTyping}
            observeIntersection={p.observeIntersection()}
            topicIds={p.topicIds()}
            hasTags={p.hasTags()}
          />
        ) : (
          renderLastMessageOrTyping()
        )}
      </>
    );
  }

  // Sets animation excess values when `orderDiff` changes and then resets excess values to animate
  // Deviation: a frame effect in the mutate phase instead of `createMutationEffect`, which applies before the row's
  // `ref` is assigned; the first apply comes with the first mutate phase after the row is created.
  createEffect(
    depsOf(
      () =>
        [
          p.withInterfaceAnimations(),
          p.orderDiff(),
          p.shiftDiff(),
          p.animationType(),
          p.onReorderAnimationEnd(),
        ] as const,
    ),
    ([withInterfaceAnimations, orderDiff, shiftDiff, animationType, onReorderAnimationEnd]) => {
      const element = ref;

      if (!withInterfaceAnimations || !element) {
        return undefined;
      }

      let isCancelled = false;

      // Clear stale transitions before setting the compensating transform
      element.classList.remove('animate-opacity', 'animate-transform');
      element.style.opacity = '';
      element.style.transform = '';

      const notifyAnimationEnd = () => {
        if (isCancelled) return;
        requestMutation(() => {
          if (isCancelled) return;
          element.classList.remove('animate-opacity', 'animate-transform');
          element.style.opacity = '';
          element.style.transform = '';
        });
        onReorderAnimationEnd?.();
      };

      // TODO Refactor animation: create `useListAnimation` that owns `orderDiff` and `animationType`
      if (animationType === ChatAnimationTypes.Opacity) {
        element.style.opacity = '0';

        requestMutation(() => {
          if (isCancelled) return;
          element.classList.add('animate-opacity');
          element.style.opacity = '1';

          waitStartingTransitionsEnd(element).then(notifyAnimationEnd);
        });
      }

      if (animationType === ChatAnimationTypes.Move) {
        element.style.transform = `translate3d(0, ${-orderDiff * CHAT_HEIGHT_PX - shiftDiff}px, 0)`;

        requestMutation(() => {
          if (isCancelled) return;
          element.classList.add('animate-transform');
          element.style.transform = '';

          waitStartingTransitionsEnd(element).then(notifyAnimationEnd);
        });
      }

      if (animationType === ChatAnimationTypes.Shift) {
        element.style.transform = `translate3d(0, ${-shiftDiff}px, 0)`;

        requestMutation(() => {
          if (isCancelled) return;
          element.classList.add('animate-transform');
          element.style.transform = '';

          waitStartingTransitionsEnd(element).then(notifyAnimationEnd);
        });
      }

      if (animationType === ChatAnimationTypes.None) {
        return undefined;
      }

      return () => {
        isCancelled = true;
      };
    },
    frameMutation,
  );

  return {
    renderSubtitle,
    ref: (element: HTMLDivElement) => {
      ref = element;
    },
    element: () => ref,
  };
}

function renderSummary(
  message: Accessor<ApiMessage>,
  observeIntersection: Accessor<ObserveFn | undefined>,
  blobUrl: Accessor<string | undefined>,
  isRoundVideo: Accessor<boolean>,
) {
  const messageSummary = () => (
    <MessageSummary
      message={message()}
      noEmoji={Boolean(blobUrl())}
      observeIntersectionForLoading={observeIntersection()}
      inChatList
    />
  );
  const hasBlobUrl = createMemo(() => Boolean(blobUrl()));

  return (
    <>
      {hasBlobUrl() ? (
        <span class="media-preview">
          <img
            src={blobUrl()}
            alt=""
            class={buildClassName(
              'media-preview--image',
              isRoundVideo() && 'round',
              getMessageIsSpoiler(message()) && 'media-preview-spoiler',
            )}
            draggable="false"
          />
          {getMessageVideo(message()) && <Icon name="play" />}
          {messageSummary()}
        </span>
      ) : (
        messageSummary()
      )}
    </>
  );
}
