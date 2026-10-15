import { createEffect, createMeasureEffect, createMemo, previous } from 'frameact';
import { getActions } from '../../../../global';
import { depsOf } from '../../../../util/effectDeps';
import { createShowTransition } from '../../../../lib/kit';

import type { ApiPeer, ApiReaction, ApiReactionCount } from '../../../../api/types';
import type { GlobalState } from '../../../../global/types';

import { isReactionChosen } from '../../../../global/helpers';
import buildClassName from '../../../../util/buildClassName';
import { formatIntegerCompact } from '../../../../util/textFormat';
import { REM } from '../../../common/helpers/mediaDimensions';

import useSelector from '../../../../hooks/data/useSelector';
import useContextMenuHandlers from '../../../../hooks/useContextMenuHandlers';
import useLang from '../../../../hooks/useLang';

import AnimatedCounter from '../../../common/AnimatedCounter';
import AvatarList from '../../../common/AvatarList';
import PaidReactionEmoji from '../../../common/reactions/PaidReactionEmoji';
import ReactionAnimatedEmoji from '../../../common/reactions/ReactionAnimatedEmoji';
import Sparkles from '../../../common/Sparkles';
import Button from '../../../ui/Button';

import styles from './ReactionButton.module.scss';

const REACTION_SIZE = 1.25 * REM;
const MAX_SCALE = 3;

type OwnProps = {
  chatId: string;
  messageId: number;
  reaction: ApiReactionCount;
  containerId: string;
  isOwnMessage?: boolean;
  recentReactors?: ApiPeer[];
  className?: string;
  chosenClassName?: string;
  isOutside?: boolean;
  observeIntersection?: ObserveFn;
  onClick?: (reaction: ApiReaction) => void;
  onPaidClick?: (count: number) => void;
};

function selectStarsState(global: GlobalState) {
  return global.stars;
}

const ReactionButton = (props: OwnProps) => {
  const { openStarsBalanceModal, resetLocalPaidReactions, openPaidReactionModal, requestWave } = getActions();
  let ref!: HTMLButtonElement;
  let counterRef!: HTMLSpanElement;
  let animationRef: Animation | undefined;

  const lang = useLang();

  const isPaid = createMemo(() => props.reaction.reaction.type === 'paid');

  const starsState = useSelector(selectStarsState);
  const areStarsLoaded = createMemo(() => Boolean(starsState()));

  const handlePaidClick = (count = 1) => {
    props.onPaidClick?.(count);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    if (props.reaction.reaction.type === 'paid') {
      e.stopPropagation(); // Prevent default message double click behavior
      handlePaidClick();

      return;
    }

    props.onClick?.(props.reaction.reaction);
  };

  const contextMenuHandlersResult = createMemo(() => useContextMenuHandlers(() => ref, () => props.reaction.reaction.type !== 'paid', undefined, undefined, undefined, true));
  const isContextMenuOpen = () => contextMenuHandlersResult().isContextMenuOpen;
  const handleBeforeContextMenu = () => contextMenuHandlersResult().handleBeforeContextMenu;
  const handleContextMenu = () => contextMenuHandlersResult().handleContextMenu;
  const handleContextMenuClose = () => contextMenuHandlersResult().handleContextMenuClose;
  const handleContextMenuHide = () => contextMenuHandlersResult().handleContextMenuHide;

  createEffect(depsOf(() => [handleContextMenuClose(), handleContextMenuHide(), isContextMenuOpen(), props.chatId, props.messageId] as const), ([handleContextMenuClose2, handleContextMenuHide2, isContextMenuOpen2, chatId2, messageId2]) => {
    if (isContextMenuOpen2) {
      openPaidReactionModal({
        chatId: chatId2,
        messageId: messageId2,
      });

      handleContextMenuClose2();
      handleContextMenuHide2();
    }
  });

  createMeasureEffect(
    depsOf(() => [props.reaction, starsState()?.balance, areStarsLoaded(), props.chatId, props.messageId]), (_deps, prev) => {
      const [prevReaction] = prev ?? [];
      const amount = props.reaction.localAmount;
      const button = ref;
      if (!amount || !button || amount === prevReaction?.localAmount) return;

      if (areStarsLoaded() && amount > starsState().balance.amount) {
        openStarsBalanceModal({
          originReaction: {
            chatId: props.chatId,
            messageId: props.messageId,
            amount,
          },
        });
        resetLocalPaidReactions({
          chatId: props.chatId,
          messageId: props.messageId,
        });
        return;
      }

      if (props.reaction.localAmount) {
        const { left, top } = button.getBoundingClientRect();
        const startX = left + button.offsetWidth / 2;
        const startY = top + button.offsetHeight / 2;
        requestWave({ startX, startY });
      }

      const currentScale = Number(getComputedStyle(button).scale) || 1;
      animationRef?.cancel();
      // Animate scaling by 20%, and then returning to 1
      animationRef = button.animate(
        [{ scale: currentScale }, { scale: Math.min(currentScale * 1.2, MAX_SCALE), offset: 0.2 }, { scale: 1 }],
        {
          duration: 500 * currentScale,
          easing: 'ease-out',
        },
      );
    },
  );

  const prevAmount = previous(() => props.reaction.localAmount);

  const { shouldRender: shouldRenderPaidCounter } = createShowTransition({
    isOpen: () => Boolean(props.reaction.localAmount),
    // TODO(codemod): ref option: hand the result `ref` to the element (ref={t.ref}) instead
    ref: () => counterRef,
    className: 'slow',
  });

  return (
    <Button
      className={buildClassName(
        styles.root,
        props.isOwnMessage && styles.own,
        isPaid() && styles.paid,
        props.isOutside && styles.outside,
        isReactionChosen(props.reaction) && styles.chosen,
        isReactionChosen(props.reaction) && props.chosenClassName,
        props.className,
      )}
      size="tiny"
      ref={ref}
      onMouseDown={handleBeforeContextMenu()}
      onContextMenu={handleContextMenu()}
      onClick={handleClick}
    >
      {props.reaction.reaction.type === 'paid' ? (
        <>
          <Sparkles preset="button" />
          <PaidReactionEmoji
            className={styles.animatedEmoji}
            containerId={props.containerId}
            reaction={props.reaction.reaction}
            size={REACTION_SIZE}
            localAmount={props.reaction.localAmount}
            observeIntersection={props.observeIntersection}
          />
          {shouldRenderPaidCounter() && (
            <AnimatedCounter
              ref={counterRef}
              text={`+${formatIntegerCompact(lang, props.reaction.localAmount || prevAmount()!)}`}
              className={styles.paidCounter}
            />
          )}
        </>
      ) : (
        <ReactionAnimatedEmoji
          className={styles.animatedEmoji}
          containerId={props.containerId}
          reaction={props.reaction.reaction}
          size={REACTION_SIZE}
          observeIntersection={props.observeIntersection}
        />
      )}
      {props.recentReactors?.length ? (
        <AvatarList size="mini" peers={props.recentReactors} />
      ) : (
        <AnimatedCounter
          text={formatIntegerCompact(lang, props.reaction.count + (props.reaction.localAmount || 0))}
          className={styles.counter}
        />
      )}
    </Button>
  );
};

export default ReactionButton;
