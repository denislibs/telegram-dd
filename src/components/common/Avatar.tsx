import type { MouseEvent as ReactMouseEvent } from 'react';
import { createMemo } from 'frameact';
import { mergeProps } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';
import { getActions } from '../../global';
import { createMediaTransition } from '../../lib/kit';

import type { ApiPeer, ApiPhoto, ApiWebDocument } from '../../api/types';
import type { CustomPeer, StoryViewerOrigin } from '../../types';
import { ApiMediaFormat } from '../../api/types';

import { IS_TEST } from '../../config';
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
  const realPeer = createMemo(() => (props.peer && !isCustomPeer() ? props.peer : undefined));
  const user = createMemo(() => (realPeer() && isApiPeerUser(realPeer()) ? realPeer() : undefined));
  const chat = createMemo(() => (realPeer() && isApiPeerChat(realPeer()) ? realPeer() : undefined));
  const isDeleted = createMemo(() => user() && isDeletedUser(user()));
  const isReplies = createMemo(() => realPeer() && isChatWithRepliesBot(realPeer().id));
  const isAnonymousForwards = createMemo(() => realPeer() && isAnonymousForwardsChat(realPeer().id));
  const isForum = createMemo(() => chat()?.isForum);
  const isCommunity = createMemo(() => Boolean(chat() && isChatCommunity(chat())));

  const peerColorKey = createMemo(() => getPeerColorKey(props.peer, true));
  const peerColorClass = createMemo(() =>
    peerColorKey() !== undefined ? getPeerColorClass(peerColorKey()) : undefined,
  );

  const isStoryClickable = createMemo(
    () => props.withStory && props.storyViewerMode !== 'disabled' && realPeer()?.hasStories,
  );

  let imageHash: string | undefined;
  let videoHash: string | undefined;

  const pxSize = createMemo(() => (typeof props.size === 'number' ? props.size : AVATAR_SIZES[props.size]));

  const shouldLoadVideo = createMemo(() => props.withVideo && props.photo?.isVideo);

  const isBig = createMemo(() => pxSize() >= AVATAR_SIZES.jumbo);
  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (!props.isSavedMessages && !isDeleted()) {
    if ((user() && !props.noPersonalPhoto) || chat()) {
      imageHash = getChatAvatarHash(props.peer as ApiPeer, isBig() ? 'big' : undefined);
    } else if (props.photo) {
      imageHash = `photo${props.photo.id}?size=m`;
      if (props.photo.isVideo && props.withVideo) {
        videoHash = getVideoProfilePhotoMediaHash(props.photo);
      }
    } else if (props.webPhoto) {
      imageHash = getWebDocumentHash(props.webPhoto);
    }
  }

  const specialIcon = createMemo(() => {
    if (isCustomPeer()) {
      return props.peer.avatarIcon;
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
  const imgUrl = createMemo(() => imgBlobUrl || props.previewUrl);
  const hasBlobUrl = createMemo(() => Boolean(imgUrl() || videoBlobUrl));
  // `videoBlobUrl` can be taken from memory cache, so we need to check `shouldLoadVideo` again
  const shouldPlayVideo = createMemo(() => Boolean(videoBlobUrl && shouldLoadVideo()));

  const { ref: mediaRef } = createMediaTransition({ hasMediaData: () => hasBlobUrl() });

  const handleVideoEnded = (e) => {
    const video = e.currentTarget;
    if (!videoBlobUrl) return;

    if (props.loopIndefinitely) return;

    videoLoopCountRef += 1;
    if (videoLoopCountRef >= LOOP_COUNT) {
      video.style.display = 'none';
    }
  };

  const lang = useOldLang();

  let content: JSX.Element | undefined;
  const author = createMemo(() =>
    user() ? getUserFullName(user()) : chat() ? getChatTitle(lang, chat()) : props.text,
  );

  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (specialIcon()) {
    content = <Icon name={specialIcon()} className={cn.icon} role="img" ariaLabel={author()} />;
  } else if (hasBlobUrl()) {
    content = (
      <>
        <img
          ref={mediaRef}
          src={imgUrl()}
          class={buildClassName(cn.media, 'avatar-media', videoBlobUrl && 'poster')}
          alt={author()}
          decoding="async"
          draggable={false}
          onLoad={props.onLoad}
        />
        {shouldPlayVideo() && (
          <OptimizedVideo
            canPlay
            src={videoBlobUrl}
            className={buildClassName(cn.media, 'avatar-media', 'poster')}
            muted
            loop={props.loopIndefinitely}
            autoPlay
            disablePictureInPicture
            playsInline
            draggable={false}
            onEnded={handleVideoEnded}
          />
        )}
      </>
    );
  } else if (user()) {
    const userFullName = getUserFullName(user());
    content = userFullName ? getFirstLetters(userFullName, 2) : undefined;
  } else if (chat()) {
    const title = getChatTitle(lang, chat());
    content = title && getFirstLetters(title, isUserId(chat().id) ? 2 : 1);
  } else if (isCustomPeer()) {
    const title = props.peer.title || lang(props.peer.titleKey!);
    content = title && getFirstLetters(title, 1);
  } else if (props.text) {
    content = getFirstLetters(props.text, 2);
  }

  const isRoundedRect = createMemo(
    () =>
      (isCustomPeer() && props.peer.isAvatarSquare) ||
      isCommunity() ||
      (isForum() && !((props.withStory || props.withStorySolid) && realPeer()?.hasStories)),
  );
  const isPremiumGradient = createMemo(() => isCustomPeer() && props.peer.withPremiumGradient);
  const customColor = createMemo(() => isCustomPeer() && props.peer.customPeerAvatarColor);

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

  const fastClickResult = createMemo(() =>
    useFastClick((e: ReactMouseEvent<HTMLDivElement, MouseEvent>) => {
      if (isStoryClickable()) {
        e.stopPropagation();

        openStoryViewer({
          peerId: realPeer().id,
          isSinglePeer: props.storyViewerMode === 'single-peer',
          origin: props.storyViewerOrigin,
        });
        return;
      }

      if (props.onClick) {
        props.onClick(e, hasMedia());
      }
    }),
  );
  const handleClick = () => fastClickResult().handleClick;
  const handleMouseDown = () => fastClickResult().handleMouseDown;

  return (
    <div
      ref={props.containerRef}
      class={fullClassName()}
      id={realPeer()?.id && props.withStory ? getPeerStoryHtmlId(realPeer().id) : undefined}
      data-peer-id={realPeer()?.id}
      data-test-sender-id={IS_TEST ? realPeer()?.id : undefined}
      aria-label={typeof content === 'string' ? author() : undefined}
      style={fullStyle()}
      onClick={handleClick()}
      onContextMenu={props.onContextMenu}
      onMouseDown={handleMouseDown()}
      onMouseMove={props.onMouseMove}
    >
      <div class="inner">
        {typeof content === 'string' ? (
          <span class="letters">{renderText(content, [isBig() ? 'hq_emoji' : 'emoji'])}</span>
        ) : (
          content
        )}
      </div>
      {props.withStory && realPeer()?.hasStories && (
        <AvatarStoryCircle
          peerId={realPeer().id}
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
