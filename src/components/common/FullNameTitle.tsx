import { createMemo } from 'frameact';
import { getActions } from '../../global';

import type { ApiPeer } from '../../api/types';
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
  const isUser = createMemo(() => realPeer() && isApiPeerUser(realPeer()));
  const title = createMemo(
    () => realPeer() && (isUser() ? getUserFullName(realPeer()) : getChatTitle(oldLang, realPeer())),
  );
  const isPremium = createMemo(() => (isUser() && realPeer().isPremium) || customPeer()?.isPremium);
  const canShowEmojiStatus = createMemo(() => props.withEmojiStatus && !props.isSavedMessages);
  const emojiStatus = createMemo(
    () =>
      realPeer()?.emojiStatus ||
      (customPeer()?.emojiStatusId ? { type: 'regular', documentId: customPeer().emojiStatusId } : undefined),
  );

  const handleTitleClick = (e) => {
    if (!title() || !props.canCopyTitle) {
      return;
    }

    stopEvent(e);
    copyTextToClipboard(title());
    showNotification({ message: `${isUser() ? 'User' : 'Chat'} name was copied` });
  };

  const specialTitle = createMemo(() => {
    if (customPeer()) {
      return renderText(customPeer().title || oldLang(customPeer().titleKey!));
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
            // TODO(codemod): <Transition> children: use the render function and render by slide.key (framework guide §6)
            <Transition
              className={styles.statusTransition}
              slideClassName={styles.statusTransitionSlide}
              activeKey={Number(emojiStatus().documentId)}
              name="slideFade"
              direction={-1}
              shouldCleanup
            >
              <GiftEffectWrapper
                withSparkles={emojiStatus().type === 'collectible'}
                sparklesClassName="statusSparkles"
                sparklesColor={
                  emojiStatus().type === 'collectible' && !props.withStatusTextColor
                    ? emojiStatus().textColor
                    : undefined
                }
              >
                <CustomEmoji
                  className={buildClassName('no-selection', !props.withStatusTextColor && styles.statusPrimaryColor)}
                  documentId={emojiStatus().documentId}
                  size={props.emojiStatusSize}
                  loopLimit={!props.noLoopLimit ? EMOJI_STATUS_LOOP_LIMIT : undefined}
                  observeIntersectionForLoading={props.observeIntersection}
                  onClick={props.onEmojiStatusClick}
                />
              </GiftEffectWrapper>
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
