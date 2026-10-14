import { createMemo, untrack } from 'frameact';
import { getActions } from '../../global';

import type { ApiEmojiStatusType, ApiPeer } from '../../api/types';
import type { ObserveFn } from '../../hooks/useIntersectionObserver';
import type { CustomPeer } from '../../types';

import { EMOJI_STATUS_LOOP_LIMIT } from '../../config';
import {
  getChatTitle,
  getUserFullName,
  isAnonymousForwardsChat,
  isChatWithRepliesBot,
  isChatWithVerificationCodesBot,
} from '../../global/helpers';
import { isApiPeerUser } from '../../global/helpers/peers';
import buildClassName from '../../util/buildClassName';
import buildStyle from '../../util/buildStyle';
import { copyTextToClipboard } from '../../util/clipboard';
import stopEvent from '../../util/stopEvent';
import renderText from './helpers/renderText';

import useLang from '../../hooks/useLang';
import useOldLang from '../../hooks/useOldLang';

import Marquee from '../ui/Marquee';
import Transition from '../ui/Transition';
import CustomEmoji from './CustomEmoji';
import FakeIcon from './FakeIcon';
import GiftEffectWrapper from './gift/GiftEffectWrapper';
import StarIcon from './icons/StarIcon';
import VerifiedIcon from './VerifiedIcon';

import styles from './FullNameTitle.module.scss';

type OwnProps = {
  peer: ApiPeer | CustomPeer;
  className?: string;
  style?: string;
  isScrolling?: boolean;
  isScrollingPaused?: boolean;
  noVerified?: boolean;
  noFake?: boolean;
  withEmojiStatus?: boolean;
  emojiStatusSize?: number;
  isSavedMessages?: boolean;
  isSavedDialog?: boolean;
  isMonoforum?: boolean;
  monoforumBadgeClassName?: string;
  noLoopLimit?: boolean;
  canCopyTitle?: boolean;
  iconElement?: React.ReactNode;
  withStatusTextColor?: boolean;
  onEmojiStatusClick?: NoneToVoidFunction;
  observeIntersection?: ObserveFn;
};

const FullNameTitle = (props: OwnProps) => {
  const { showNotification } = getActions();

  const oldLang = useOldLang();
  const lang = useLang();

  const realPeer = createMemo(() => ('id' in props.peer ? props.peer : undefined));
  const customPeer = createMemo(() => ('isCustomPeer' in props.peer ? props.peer : undefined));
  const isUser = createMemo(() => {
    const peer = realPeer();
    return Boolean(peer && isApiPeerUser(peer));
  });
  const title = createMemo(() => {
    const peer = realPeer();
    return peer && (isApiPeerUser(peer) ? getUserFullName(peer) : getChatTitle(oldLang, peer));
  });
  const isPremium = createMemo(() => {
    const peer = realPeer();
    return Boolean((peer && isApiPeerUser(peer) && peer.isPremium) || customPeer()?.isPremium);
  });
  const canShowEmojiStatus = createMemo(() => props.withEmojiStatus && !props.isSavedMessages);
  const emojiStatus = createMemo((): ApiEmojiStatusType | undefined => {
    const customEmojiStatusId = customPeer()?.emojiStatusId;
    return realPeer()?.emojiStatus || (customEmojiStatusId ? { type: 'regular', documentId: customEmojiStatusId } : undefined);
  });

  const handleTitleClick = (e: MouseEvent) => {
    const currentTitle = title();
    if (!currentTitle || !props.canCopyTitle) {
      return;
    }

    stopEvent(e);
    copyTextToClipboard(currentTitle);
    showNotification({ message: `${isUser() ? 'User' : 'Chat'} name was copied` });
  };

  const specialTitle = createMemo(() => {
    const currentCustomPeer = customPeer();
    if (currentCustomPeer) {
      return renderText(currentCustomPeer.title || oldLang(currentCustomPeer.titleKey!));
    }

    if (props.isSavedMessages) {
      return oldLang(props.isSavedDialog ? 'MyNotes' : 'SavedMessages');
    }

    if (isAnonymousForwardsChat(realPeer()!.id)) {
      return oldLang('AnonymousForward');
    }

    if (isChatWithRepliesBot(realPeer()!.id)) {
      return oldLang('RepliesTitle');
    }

    if (isChatWithVerificationCodesBot(realPeer()!.id)) {
      return oldLang('VerifyCodesNotifications');
    }

    return undefined;
  });
  const botVerificationIconId = createMemo(() =>
    !props.isSavedMessages && !props.isSavedDialog ? realPeer()?.botVerificationIconId : undefined,
  );
  const renderedTitle = createMemo(() => specialTitle() || renderText(title() || ''));

  return (
    <div
      class={buildClassName('title', styles.root, props.className)}
      style={buildStyle(props.emojiStatusSize ? `--_status-size: ${props.emojiStatusSize}px` : undefined, props.style)}
    >
      {botVerificationIconId() && (
        <CustomEmoji
          documentId={botVerificationIconId()}
          size={props.emojiStatusSize}
          loopLimit={!props.noLoopLimit ? EMOJI_STATUS_LOOP_LIMIT : undefined}
          observeIntersectionForLoading={props.observeIntersection}
        />
      )}
      <h3
        dir="auto"
        role="button"
        class={buildClassName('fullName', styles.fullName, props.canCopyTitle && styles.canCopy)}
        onClick={handleTitleClick}
      >
        {props.isScrolling ? <Marquee paused={props.isScrollingPaused}>{renderedTitle()}</Marquee> : renderedTitle()}
      </h3>
      {!props.iconElement && props.peer && (
        <>
          {!props.noVerified && props.peer?.isVerified && <VerifiedIcon />}
          {!props.noFake && props.peer?.fakeType && <FakeIcon fakeType={props.peer.fakeType} />}
          {canShowEmojiStatus() && emojiStatus() && (
            <Transition
              className={styles.statusTransition}
              slideClassName={styles.statusTransitionSlide}
              activeKey={Number(emojiStatus()!.documentId)}
              name="slideFade"
              direction={-1}
              shouldCleanup
            >
              {(slide) => {
                // Deviation: the key is the (lossy) Number of the document id, so the slide keeps the status it was
                // created for and follows the current one only while it is the active slide.
                let lastStatus = untrack(emojiStatus)!;
                const status = createMemo(() => {
                  if (slide.isActive()) lastStatus = emojiStatus() ?? lastStatus;
                  return lastStatus;
                });
                const sparklesColor = createMemo(() => {
                  const current = status();
                  return current.type === 'collectible' && !props.withStatusTextColor ? current.textColor : undefined;
                });

                return (
                  <GiftEffectWrapper
                    withSparkles={status().type === 'collectible'}
                    sparklesClassName="statusSparkles"
                    sparklesColor={sparklesColor()}
                  >
                    <CustomEmoji
                      className={buildClassName(
                        'no-selection',
                        !props.withStatusTextColor && styles.statusPrimaryColor,
                      )}
                      documentId={status().documentId}
                      size={props.emojiStatusSize}
                      loopLimit={!props.noLoopLimit ? EMOJI_STATUS_LOOP_LIMIT : undefined}
                      observeIntersectionForLoading={props.observeIntersection}
                      onClick={props.onEmojiStatusClick}
                    />
                  </GiftEffectWrapper>
                );
              }}
            </Transition>
          )}
          {canShowEmojiStatus() && !emojiStatus() && isPremium() && <StarIcon />}
          {props.isMonoforum && (
            <div class={buildClassName(styles.monoforumBadge, props.monoforumBadgeClassName)}>
              {lang('MonoforumBadge')}
            </div>
          )}
        </>
      )}
      {props.iconElement}
    </div>
  );
};

export default FullNameTitle;
