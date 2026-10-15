import { createEffect, createMemo, onMount } from 'frameact';
import { For } from 'frameact/dom';
import { getActions, getGlobal } from '../../../../global';
import { depsOf } from '../../../../util/effectDeps';

import type { ApiMessage, ApiPeer, ApiReaction, ApiReactionKey, ApiSavedReactionTag } from '../../../../api/types';
import type { ThreadId } from '../../../../types';

import { getReactionKey, isReactionChosen } from '../../../../global/helpers';
import { selectPeer } from '../../../../global/selectors';
import buildClassName from '../../../../util/buildClassName';
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

  const source = createMemo(() => p.message.reactions!);
  const results = () => source().results;
  const areTags = () => source().areTags;
  const recentReactions = () => source().recentReactions;
  const withServiceReactions = createMemo(() => Boolean(p.message.areReactionsPossible && p.message.reactions));

  const totalCount = createMemo(() => results().reduce((acc, reaction) => acc + reaction.count, 0));

  const recentReactorsByReactionKey = createMemo(() => {
    // TODO(codemod): getGlobal() in a memo / JSX is a one-time read: use useGlobal() (store contract §12.4)
    const global = getGlobal();

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

  // TODO(codemod): dependency on a container (tags) keeps its identity while its content changes: the memo must read the fields it needs (store contract §12.7)
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

  createEffect(depsOf(() => [lang, p.message, paidLocalCount()] as const), ([, , paidLocalCount2]) => {
    if (!paidLocalCount2) return;

    showNotification({
      localId: getMessageKey(p.message),
      title: lang('StarsSentTitle'),
      message: lang('StarsSentText', paidLocalCount2),
      actionText: lang('StarsSentUndo'),
      cacheBreaker: paidLocalCount2.toString(),
      action: {
        action: 'resetLocalPaidReactions',
        payload: { chatId: p.message.chatId, messageId: p.message.id },
      },
      dismissAction: {
        action: 'sendPaidReaction',
        payload: { chatId: p.message.chatId, messageId: p.message.id },
      },
      duration: PAID_SEND_DELAY,
      shouldShowTimer: true,
      disableClickDismiss: true,
      icon: 'star',
    });
  });

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

  // Reset paid reactions on unmount
  onMount(() => () => {
    resetLocalPaidReactions({
      chatId: p.message.chatId,
      messageId: p.message.id,
    });
  });

  return (
    <div
      class={buildClassName('Reactions', p.isOutside && 'is-outside', withServiceReactions() && 'is-service')}
      dir={lang.isRtl ? 'rtl' : 'ltr'}
    >
      <For each={props()}>{({ reaction, recentReactors, messageKey, reactionKey, isChosen, tag }) =>
        areTags() ? (
          <SavedTagButton
            className="message-reaction"
            chosenClassName="chosen"
            containerId={messageKey}
            isOwnMessage={p.message.isOutgoing}
            isChosen={isChosen}
            reaction={reaction.reaction as ApiReaction}
            tag={tag}
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
            containerId={messageKey}
            isOwnMessage={p.message.isOutgoing}
            recentReactors={recentReactors}
            isOutside={p.isOutside}
            reaction={reaction}
            onClick={handleClick}
            onPaidClick={handlePaidClick}
            observeIntersection={p.observeIntersection}
          />
        )}</For>
      {p.metaChildren}
    </div>
  );
};

export default Reactions;
