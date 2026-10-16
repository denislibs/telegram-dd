import type { MouseEvent as ReactMouseEvent } from 'react';
import { createMemo } from 'frameact';
import { mergeProps } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';
import { getActions } from '../../global';

import type { ApiPeer, ApiPhoto, ApiWebDocument } from '../../api/types';
import type { ObserveFn } from '../../hooks/useIntersectionObserver';
import type { CustomPeer, StoryViewerOrigin } from '../../types';
import { ApiMediaFormat } from '../../api/types';

import { IS_TEST } from '../../config';
import { createMediaTransition } from '../../lib/kit';
import {
  getChatAvatarHash,
  getChatTitle,
  getPeerColorKey,
  getPeerStoryHtmlId,
  getUserFullName,
  getVideoProfilePhotoMediaHash,
  getWebDocumentHash,
  isAnonymousForwardsChat,
  isChatCommunity,
  isChatWithRepliesBot,
  isDeletedUser,
} from '../../global/helpers';
import { isApiPeerChat, isApiPeerUser } from '../../global/helpers/peers';
import buildClassName, { createClassNameBuilder } from '../../util/buildClassName';
import buildStyle from '../../util/buildStyle';
import { isUserId } from '../../util/entities/ids';
import { getFirstLetters } from '../../util/textFormat';
import { REM } from './helpers/mediaDimensions';
import renderText from './helpers/renderText';

import { useFastClick } from '../../hooks/useFastClick';
import useMedia from '../../hooks/useMedia';
import useOldLang from '../../hooks/useOldLang';
import { getPeerColorClass } from '../../hooks/usePeerColor';

import OptimizedVideo from '../ui/OptimizedVideo';
import AvatarStoryCircle from './AvatarStoryCircle';
import Icon from './icons/Icon';

import './Avatar.scss';

const LOOP_COUNT = 3;

export const AVATAR_SIZES = {
  micro: REM,
  mini: 1.5 * REM,
  tiny: 2 * REM,
  small: 2.125 * REM,
  medium: 2.75 * REM,
  large: 3.375 * REM,
  giant: 5.625 * REM,
  jumbo: 7.5 * REM,
};

export type AvatarSize = 'micro' | 'mini' | 'tiny' | 'small' | 'medium' | 'large' | 'giant' | 'jumbo' | number;

const cn = createClassNameBuilder('Avatar');
cn.media = cn('media');
cn.icon = cn('icon');

type OwnProps = {
  containerRef?: (el: HTMLDivElement) => void;
  className?: string;
  style?: string;
  size?: AvatarSize;
  peer?: ApiPeer | CustomPeer;
  photo?: ApiPhoto;
  webPhoto?: ApiWebDocument;
  previewUrl?: string;
  text?: string;
  isSavedMessages?: boolean;
  isSavedDialog?: boolean;
  withVideo?: boolean;
  withStory?: boolean;
  forPremiumPromo?: boolean;
  withStoryGap?: boolean;
  storyGapPercent?: number;
  withStorySolid?: boolean;
  storyColors?: string[];
  forceFriendStorySolid?: boolean;
  forceUnreadStorySolid?: boolean;
  storyViewerOrigin?: StoryViewerOrigin;
  storyViewerMode?: 'full' | 'single-peer' | 'disabled';
  loopIndefinitely?: boolean;
  noPersonalPhoto?: boolean;
  asMessageBubble?: boolean;
  storyCircleStyle?: string;
  observeIntersection?: ObserveFn;
  onClick?: (e: ReactMouseEvent<HTMLDivElement, MouseEvent>, hasMedia: boolean) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
  onLoad?: NoneToVoidFunction;
};

const Avatar = (rawProps: OwnProps) => {
  const props = mergeProps({ size: 'large', storyViewerMode: 'single-peer' }, rawProps) as OwnProps &
    Required<Pick<OwnProps, 'size' | 'storyViewerMode'>>;
  const { openStoryViewer } = getActions();

  let videoLoopCountRef = 0;
  const isCustomPeer = createMemo(() => props.peer && 'isCustomPeer' in props.peer);
  const customPeer = createMemo(() => (isCustomPeer() ? (props.peer as CustomPeer) : undefined));
  const realPeer = createMemo(() => (props.peer && !isCustomPeer() ? (props.peer as ApiPeer) : undefined));
  const user = createMemo(() => {
    const peer = realPeer();
    return peer && isApiPeerUser(peer) ? peer : undefined;
  });
  const chat = createMemo(() => {
    const peer = realPeer();
    return peer && isApiPeerChat(peer) ? peer : undefined;
  });
  const isDeleted = createMemo(() => {
    const currentUser = user();
    return currentUser && isDeletedUser(currentUser);
  });
  const isReplies = createMemo(() => realPeer() && isChatWithRepliesBot(realPeer()!.id));
  const isAnonymousForwards = createMemo(() => realPeer() && isAnonymousForwardsChat(realPeer()!.id));
  const isForum = createMemo(() => chat()?.isForum);
  const isCommunity = createMemo(() => Boolean(chat() && isChatCommunity(chat()!)));

  const peerColorKey = createMemo(() => getPeerColorKey(props.peer, true));
  const peerColorClass = createMemo(() =>
    peerColorKey() !== undefined ? getPeerColorClass(peerColorKey()!) : undefined,
  );

  const isStoryClickable = createMemo(
    () => props.withStory && props.storyViewerMode !== 'disabled' && realPeer()?.hasStories,
  );

  const pxSize = createMemo(() => (typeof props.size === 'number' ? props.size : AVATAR_SIZES[props.size]));

  const shouldLoadVideo = createMemo(() => props.withVideo && props.photo?.isVideo);

  const isBig = createMemo(() => pxSize() >= AVATAR_SIZES.jumbo);

  // Deviation: `imageHash` / `videoHash` were `let`s assigned by one `if` chain on every render; they are two memos
  // with the same chain (a primitive each, so a media hook re-runs only when its hash changes).
  const imageHash = createMemo(() => {
    if (props.isSavedMessages || isDeleted()) return undefined;

    if ((user() && !props.noPersonalPhoto) || chat()) {
      return getChatAvatarHash(props.peer as ApiPeer, isBig() ? 'big' : undefined);
    } else if (props.photo) {
      return `photo${props.photo.id}?size=m`;
    } else if (props.webPhoto) {
      return getWebDocumentHash(props.webPhoto);
    }

    return undefined;
  });
  const videoHash = createMemo(() => {
    if (props.isSavedMessages || isDeleted()) return undefined;

    if (!((user() && !props.noPersonalPhoto) || chat()) && props.photo?.isVideo && props.withVideo) {
      return getVideoProfilePhotoMediaHash(props.photo);
    }

    return undefined;
  });

  const specialIcon = createMemo(() => {
    if (isCustomPeer()) {
      return customPeer()!.avatarIcon;
    }

    if (props.isSavedMessages) {
      return props.isSavedDialog ? 'my-notes' : 'saved-messages-filled';
    }

    if (isDeleted()) {
      return 'avatar-deleted-account';
    }

    if (isReplies()) {
      return 'reply-filled';
    }

    if (isAnonymousForwards()) {
      return 'author-hidden';
    }

    return undefined;
  });

  const imgBlobUrl = useMedia(imageHash, false, ApiMediaFormat.BlobUrl);
  const videoBlobUrl = useMedia(videoHash, () => !shouldLoadVideo(), ApiMediaFormat.BlobUrl);
  const imgUrl = createMemo(() => imgBlobUrl() || props.previewUrl);
  const hasBlobUrl = createMemo(() => Boolean(imgUrl() || videoBlobUrl()));
  // `videoBlobUrl` can be taken from memory cache, so we need to check `shouldLoadVideo` again
  const shouldPlayVideo = createMemo(() => Boolean(videoBlobUrl() && shouldLoadVideo()));

  const { ref: mediaRef } = createMediaTransition({ hasMediaData: hasBlobUrl });

  const handleVideoEnded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (!videoBlobUrl()) return;

    if (props.loopIndefinitely) return;

    videoLoopCountRef += 1;
    if (videoLoopCountRef >= LOOP_COUNT) {
      video.style.display = 'none';
    }
  };

  const lang = useOldLang();

  const author = createMemo(() =>
    user() ? getUserFullName(user()) : chat() ? getChatTitle(lang, chat()!) : props.text,
  );

  // Deviation: `content` was a `let` filled by an `if` chain on every render; it is a memo with the same chain.
  const content = createMemo((): JSX.Element | string | undefined => {
    if (specialIcon()) {
      return <Icon name={specialIcon()!} className={cn.icon} role="img" ariaLabel={author()} />;
    } else if (hasBlobUrl()) {
      return (
        <>
          <img
            ref={mediaRef}
            src={imgUrl()}
            class={buildClassName(cn.media, 'avatar-media', videoBlobUrl() && 'poster')}
            alt={author()}
            decoding="async"
            draggable="false"
            onLoad={() => props.onLoad?.()}
          />
          {shouldPlayVideo() && (
            <OptimizedVideo
              canPlay
              src={videoBlobUrl()}
              class={buildClassName(cn.media, 'avatar-media', 'poster')}
              muted
              loop={props.loopIndefinitely}
              autoplay
              disablepictureinpicture
              playsinline
              draggable="false"
              onEnded={handleVideoEnded}
            />
          )}
        </>
      );
    } else if (user()) {
      const userFullName = getUserFullName(user());
      return userFullName ? getFirstLetters(userFullName, 2) : undefined;
    } else if (chat()) {
      const title = getChatTitle(lang, chat()!);
      return title && getFirstLetters(title, isUserId(chat()!.id) ? 2 : 1);
    } else if (isCustomPeer()) {
      const title = customPeer()!.title || lang(customPeer()!.titleKey!);
      return title && getFirstLetters(title, 1);
    } else if (props.text) {
      return getFirstLetters(props.text, 2);
    }

    return undefined;
  });

  const isRoundedRect = createMemo(
    () =>
      (isCustomPeer() && customPeer()!.isAvatarSquare) ||
      isCommunity() ||
      (isForum() && !((props.withStory || props.withStorySolid) && realPeer()?.hasStories)),
  );
  const isPremiumGradient = createMemo(() => isCustomPeer() && customPeer()!.withPremiumGradient);
  const customColor = createMemo(() => isCustomPeer() && customPeer()!.customPeerAvatarColor);

  const fullClassName = createMemo(() =>
    buildClassName(
      'Avatar',
      props.className,
      typeof props.size === 'string' && `size-${props.size}`,
      peerColorClass(),
      !props.peer && props.text && 'hidden-user',
      props.isSavedMessages && 'saved-messages',
      isAnonymousForwards() && 'anonymous-forwards',
      isDeleted() && 'deleted-account',
      isReplies() && 'replies-bot-account',
      isPremiumGradient() && 'premium-gradient-bg',
      isRoundedRect() && 'forum',
      isCommunity() && 'community',
      props.asMessageBubble && 'message-bubble',
      (props.photo || props.webPhoto) && 'force-fit',
      ((props.withStory && realPeer()?.hasStories) || props.forPremiumPromo) && 'with-story-circle',
      props.withStorySolid && realPeer()?.hasStories && 'with-story-solid',
      props.withStorySolid && props.forceFriendStorySolid && 'close-friend',
      props.withStorySolid && (realPeer()?.hasUnreadStories || props.forceUnreadStorySolid) && 'has-unread-story',
      (props.onClick || isStoryClickable()) && 'interactive',
      !props.isSavedMessages && !imgUrl() && 'no-photo',
    ),
  );

  const fullStyle = createMemo(() =>
    buildStyle(`--_size: ${pxSize()}px;`, customColor() && `--color-user: ${customColor()}`, props.style),
  );

  const hasMedia = createMemo(() => Boolean(props.isSavedMessages || imgUrl()));

  const { handleClick, handleMouseDown } = useFastClick((e: ReactMouseEvent<HTMLDivElement, MouseEvent>) => {
    if (isStoryClickable()) {
      e.stopPropagation();

      openStoryViewer({
        peerId: realPeer()!.id,
        isSinglePeer: props.storyViewerMode === 'single-peer',
        origin: props.storyViewerOrigin,
      });
      return;
    }

    if (props.onClick) {
      props.onClick(e, hasMedia());
    }
  });

  return (
    <div
      ref={(el) => props.containerRef?.(el)}
      class={fullClassName()}
      id={realPeer()?.id && props.withStory ? getPeerStoryHtmlId(realPeer()!.id) : undefined}
      data-peer-id={realPeer()?.id}
      data-test-sender-id={IS_TEST ? realPeer()?.id : undefined}
      aria-label={typeof content() === 'string' ? author() : undefined}
      style={fullStyle()}
      onClick={handleClick}
      onContextMenu={(e) => props.onContextMenu?.(e)}
      onMouseDown={handleMouseDown}
      onMouseMove={(e) => props.onMouseMove?.(e)}
    >
      <div class="inner">
        {typeof content() === 'string' ? (
          <span class="letters">{renderText(content(), [isBig() ? 'hq_emoji' : 'emoji'])}</span>
        ) : (
          content()
        )}
      </div>
      {props.withStory && realPeer()?.hasStories && (
        <AvatarStoryCircle
          peerId={realPeer()!.id}
          size={pxSize()}
          withExtraGap={props.withStoryGap}
          extraGapPercent={props.storyGapPercent}
          colors={props.storyColors}
          style={props.storyCircleStyle}
        />
      )}
    </div>
  );
};

export default Avatar;
