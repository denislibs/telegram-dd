import { createEffect, createMemo, onDestroy } from 'frameact';
import { For } from 'frameact/dom';
import { getActions, useGlobal } from '../../../../global';

import type {
  ApiMessage,
  ApiPeer,
  ApiReaction,
  ApiReactionCount,
  ApiReactionKey,
  ApiSavedReactionTag,
} from '../../../../api/types';
import type { ObserveFn } from '../../../../hooks/useIntersectionObserver';
import type { ThreadId } from '../../../../types';

import { getReactionKey, isReactionChosen } from '../../../../global/helpers';
import { selectPeer } from '../../../../global/selectors';
import buildClassName from '../../../../util/buildClassName';
import { depsOf } from '../../../../util/effectDeps';
import { getMessageKey } from '../../../../util/keys/messageKey';

import useOldLang from '../../../../hooks/useOldLang';

import ReactionButton from './ReactionButton';
import SavedTagButton from './SavedTagButton';

import './Reactions.scss';

type OwnProps = {
  message: ApiMessage;
  threadId?: ThreadId;
  isOutside?: boolean;
  metaChildren?: React.ReactNode;
  tags?: Record<ApiReactionKey, ApiSavedReactionTag>;
  isCurrentUserPremium?: boolean;
  observeIntersection?: ObserveFn;
  noRecentReactors?: boolean;
  isAccountFrozen?: boolean;
};

const NO_RESULTS: ApiReactionCount[] = [];
const MAX_RECENT_AVATARS = 3;
const PAID_SEND_DELAY = 5000;

const Reactions = (p: OwnProps) => {
  const {
    toggleReaction,
    addLocalPaidReaction,
    updateMiddleSearch,
    performMiddleSearch,
    openPremiumModal,
    resetLocalPaidReactions,
    showNotification,
    openFrozenAccountModal,
  } = getActions();
  const lang = useOldLang();
  const global = useGlobal();

  // Deviation: `message.reactions` is read through optional chaining (tt asserted it): a message that loses its
  // reactions can re-run these memos before the parent removes the component.
  const results = () => p.message.reactions?.results ?? NO_RESULTS;
  const areTags = () => p.message.reactions?.areTags;
  const recentReactions = () => p.message.reactions?.recentReactions;
  const withServiceReactions = createMemo(() => Boolean(p.message.areReactionsPossible && p.message.reactions));

  const totalCount = createMemo(() => results().reduce((acc, reaction) => acc + reaction.count, 0));

  const recentReactorsByReactionKey = createMemo(() => {
    return recentReactions()?.reduce(
      (acc, recentReaction) => {
        const { reaction, peerId } = recentReaction;
        const key = getReactionKey(reaction);
        const peer = selectPeer(global, peerId);

        if (!peer) return acc;

        const peers = acc[key] || [];
        peers.push(peer);
        acc[key] = peers;
        return acc;
      },
      {} as Record<ApiReactionKey, ApiPeer[]>,
    );
  });

  const props = createMemo(() => {
    const messageKey = getMessageKey(p.message);
    return results().map((reaction) => {
      const reactionKey = getReactionKey(reaction.reaction);
      const recentReactors = recentReactorsByReactionKey()?.[reactionKey];
      const shouldHideRecentReactors = totalCount() > MAX_RECENT_AVATARS || p.noRecentReactors;
      const tag = areTags() ? p.tags?.[reactionKey] : undefined;

      return {
        reaction,
        reactionKey,
        messageKey,
        recentReactors: !shouldHideRecentReactors ? recentReactors : undefined,
        isChosen: isReactionChosen(reaction),
        tag,
      };
    });
  });

  const handleClick = (reaction: ApiReaction) => {
    if (p.isAccountFrozen) {
      openFrozenAccountModal();
      return;
    }
    if (areTags()) {
      if (!p.isCurrentUserPremium) {
        openPremiumModal({
          initialSection: 'saved_tags',
        });
        return;
      }

      updateMiddleSearch({ chatId: p.message.chatId, threadId: p.threadId, update: { savedTag: reaction } });
      performMiddleSearch({ chatId: p.message.chatId, threadId: p.threadId });
      return;
    }

    toggleReaction({
      chatId: p.message.chatId,
      messageId: p.message.id,
      reaction,
    });
  };

  const paidLocalCount = createMemo(() => results().find((r) => r.reaction.type === 'paid')?.localAmount || 0);

  const handlePaidClick = (count: number) => {
    if (p.isAccountFrozen) {
      openFrozenAccountModal();
      return;
    }

    addLocalPaidReaction({
      chatId: p.message.chatId,
      messageId: p.message.id,
      count,
    });
  };

  createEffect(
    depsOf(() => [lang, p.message, paidLocalCount()] as const),
    ([, message, paidLocalCount2]) => {
      if (!paidLocalCount2) return;

      showNotification({
        localId: getMessageKey(message),
        title: lang('StarsSentTitle'),
        message: lang('StarsSentText', paidLocalCount2),
        actionText: lang('StarsSentUndo'),
        cacheBreaker: paidLocalCount2.toString(),
        action: {
          action: 'resetLocalPaidReactions',
          payload: { chatId: message.chatId, messageId: message.id },
        },
        dismissAction: {
          action: 'sendPaidReaction',
          payload: { chatId: message.chatId, messageId: message.id },
        },
        duration: PAID_SEND_DELAY,
        shouldShowTimer: true,
        disableClickDismiss: true,
        icon: 'star',
      });
    },
  );

  const handleRemoveReaction = (reaction: ApiReaction) => {
    if (p.isAccountFrozen) {
      openFrozenAccountModal();
      return;
    }

    toggleReaction({
      chatId: p.message.chatId,
      messageId: p.message.id,
      reaction,
    });
  };

  // Reset paid reactions on unmount. The ids are the ones of the first render, as in tt's `useEffectOnce` closure.
  const { chatId: initialChatId, id: initialMessageId } = p.message;
  onDestroy(() => {
    resetLocalPaidReactions({
      chatId: initialChatId,
      messageId: initialMessageId,
    });
  });

  return (
    <div
      class={buildClassName('Reactions', p.isOutside && 'is-outside', withServiceReactions() && 'is-service')}
      dir={lang.isRtl ? 'rtl' : 'ltr'}
    >
      <For each={props()} keyed={(item) => item.reactionKey}>
        {(item) =>
          areTags() ? (
            <SavedTagButton
              className="message-reaction"
              chosenClassName="chosen"
              containerId={item().messageKey}
              isOwnMessage={p.message.isOutgoing}
              isChosen={item().isChosen}
              reaction={item().reaction.reaction as ApiReaction}
              tag={item().tag}
              withContextMenu={p.isCurrentUserPremium}
              onClick={handleClick}
              onRemove={handleRemoveReaction}
              observeIntersection={p.observeIntersection}
            />
          ) : (
            <ReactionButton
              chatId={p.message.chatId}
              messageId={p.message.id}
              className="message-reaction"
              chosenClassName="chosen"
              containerId={item().messageKey}
              isOwnMessage={p.message.isOutgoing}
              recentReactors={item().recentReactors}
              isOutside={p.isOutside}
              reaction={item().reaction}
              onClick={handleClick}
              onPaidClick={handlePaidClick}
              observeIntersection={p.observeIntersection}
            />
          )
        }
      </For>
      {p.metaChildren}
    </div>
  );
};

export default Reactions;
