import { createMemo, frozenWhile } from 'frameact';
import { getActions } from '../../../global';

import type { GlobalState } from '../../../global/types';
import type { Signal } from '../../../util/signals';
import { type ApiChat, type ApiTopic, MAIN_THREAD_ID } from '../../../api/types';

import { selectTopicsInfo } from '../../../global/selectors';
import { selectThreadReadState } from '../../../global/selectors/threads';
import buildClassName from '../../../util/buildClassName';
import { buildCollectionByCallback } from '../../../util/iteratees';
import { getServerTime } from '../../../util/serverTime';
import { isSignal } from '../../../util/signals';
import { formatIntegerCompact } from '../../../util/textFormat';
import { extractCurrentThemeParams } from '../../../util/themeStyle';

import useSelector, { useShallowSelector } from '../../../hooks/data/useSelector';
import useLang from '../../../hooks/useLang';
import useShowTransitionSwap from '../../../hooks/useShowTransitionSwap';

import AnimatedCounter from '../../common/AnimatedCounter';
import Icon from '../../common/icons/Icon';
import Button from '../../ui/Button';
import ShowTransition from '../../ui/ShowTransition';

import styles from './ChatBadge.module.scss';

type OwnProps = {
  chat: ApiChat;
  topic?: ApiTopic;
  wasTopicOpened?: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  isSavedDialog?: boolean;
  shouldShowOnlyMostImportant?: boolean;
  hasMiniApp?: boolean;
  forceHidden?: boolean | Signal<boolean>;
  // Overrides the chat's own read state, e.g. with a community's aggregated count
  forceUnreadCount?: number;
  isSelected?: boolean;
  isOnAvatar?: boolean;
  transitionClassName?: string;
  badgeClassName?: string;
};

const ChatBadge = (props: OwnProps) => {
  const { requestMainWebView } = getActions();

  const lang = useLang();

  const readStateSelector = (global: GlobalState) => {
    return selectThreadReadState(global, props.chat.id, props.topic?.id || MAIN_THREAD_ID);
  };

  const readState = useSelector(readStateSelector);

  const source = createMemo(() => readState() || {});
  const stateUnreadMentionsCount = () =>
    source().unreadMentionsCount === undefined ? 0 : source().unreadMentionsCount;
  const stateUnreadPollVotesCount = () =>
    source().unreadPollVotesCount === undefined ? 0 : source().unreadPollVotesCount;
  const stateUnreadReactionsCount = () =>
    source().unreadReactionsCount === undefined ? 0 : source().unreadReactionsCount;
  const stateUnreadCount = () => (source().unreadCount === undefined ? 0 : source().unreadCount);
  const hasUnreadMark = () => source().hasUnreadMark;

  const topicsInfoSelector = (global: GlobalState) => {
    return selectTopicsInfo(global, props.chat.id);
  };
  const topicsInfo = useShallowSelector(topicsInfoSelector);
  const source2 = createMemo(() => topicsInfo() || {});
  const listedTopicIds = () => source2().listedTopicIds;
  const topicsById = () => source2().topicsById;

  const topicsReadStateSelector = (global: GlobalState) => {
    return buildCollectionByCallback(listedTopicIds() || [], (tId) => [
      tId,
      selectThreadReadState(global, props.chat.id, tId),
    ]);
  };
  const topicsReadStates = useShallowSelector(topicsReadStateSelector);

  const isTopicUnopened = createMemo(() => Boolean(!props.isPinned && props.topic && !props.wasTopicOpened));
  const isForum = createMemo(() => props.chat.isForum && !props.topic);
  const topicsWithUnreadIds = createMemo(() =>
    isForum() && listedTopicIds() ? listedTopicIds().filter((tId) => topicsReadStates()[tId]?.unreadCount) : undefined,
  );
  const topicsWithUnreadMentionsIds = createMemo(() =>
    isForum() && listedTopicIds()
      ? listedTopicIds().filter((tId) => topicsReadStates()[tId]?.unreadMentionsCount)
      : undefined,
  );
  const topicsWithUnreadPollVotesIds = createMemo(() =>
    isForum() && listedTopicIds()
      ? listedTopicIds().filter((tId) => topicsReadStates()[tId]?.unreadPollVotesCount)
      : undefined,
  );
  const topicsWithUnreadReactionsIds = createMemo(() =>
    isForum() && listedTopicIds()
      ? listedTopicIds().filter((tId) => topicsReadStates()[tId]?.unreadReactionsCount)
      : undefined,
  );
  const topicsWithStatefulUnreadIds = createMemo(() => {
    if (!isForum()) {
      return undefined;
    }

    const allTopicIds = [
      ...(topicsWithUnreadIds() || []),
      ...(topicsWithUnreadPollVotesIds() || []),
      ...(topicsWithUnreadReactionsIds() || []),
    ];

    return allTopicIds.length ? [...new Set(allTopicIds)] : [];
  });

  const unreadCount = createMemo(
    () => props.forceUnreadCount ?? (isForum() ? topicsWithUnreadIds()?.length : stateUnreadCount()),
  );
  const unreadMentionsCount = createMemo(() =>
    isForum() ? topicsWithUnreadMentionsIds()?.length : stateUnreadMentionsCount(),
  );
  const unreadPollVotesCount = createMemo(() =>
    isForum() ? topicsWithUnreadPollVotesIds()?.length : stateUnreadPollVotesCount(),
  );
  const unreadReactionsCount = createMemo(() =>
    isForum() ? topicsWithUnreadReactionsIds()?.length : stateUnreadReactionsCount(),
  );

  const shouldBeUnMuted = createMemo(() => {
    if (!isForum()) {
      return !props.isMuted || props.topic?.notifySettings.mutedUntil === 0;
    }

    if (!topicsWithStatefulUnreadIds()?.length) {
      return !props.isMuted;
    }

    if (props.isMuted) {
      return topicsWithStatefulUnreadIds().some((tId) => topicsById()?.[tId]?.notifySettings.mutedUntil === 0);
    }

    const isEveryUnreadMuted = topicsWithStatefulUnreadIds().every((tId) => {
      const mutedUntil = topicsById()?.[tId]?.notifySettings.mutedUntil;
      return mutedUntil && mutedUntil > getServerTime();
    });

    return !isEveryUnreadMuted;
  });

  const isUnread = createMemo(() => Boolean((unreadCount() || hasUnreadMark()) && !props.isSavedDialog));

  const resolvedForceHidden = createMemo(() => (isSignal(props.forceHidden) ? props.forceHidden() : props.forceHidden));
  const isShown = createMemo(
    () =>
      !resolvedForceHidden() &&
      Boolean(
        unreadCount() ||
        unreadMentionsCount() ||
        unreadPollVotesCount() ||
        hasUnreadMark() ||
        props.isPinned ||
        unreadReactionsCount() ||
        isTopicUnopened() ||
        props.hasMiniApp,
      ),
  );

  const contentCategory = createMemo(() =>
    isUnread() || unreadMentionsCount() || unreadReactionsCount() || unreadPollVotesCount() || isTopicUnopened()
      ? 'active'
      : props.hasMiniApp
        ? 'miniapp'
        : props.isPinned
          ? 'pinned'
          : 'none',
  );
  const effectiveIsOpen = useShowTransitionSwap(isShown, contentCategory);

  // The elements are created when one of them appears or disappears; a change of a count updates its text only
  // (`AnimatedCounter` keeps animating the digits).
  const hasUnreadReactions = createMemo(() => Boolean(unreadReactionsCount()));
  const hasUnreadPollVotes = createMemo(() => Boolean(unreadPollVotesCount()));
  const hasUnreadMentions = createMemo(() => Boolean(unreadMentionsCount()));

  const handleOpenApp = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.stopPropagation();

    const theme = extractCurrentThemeParams();
    requestMainWebView({
      botId: props.chat.id,
      peerId: props.chat.id,
      theme,
    });
  };

  function renderContent() {
    const baseClassName = () => buildClassName(styles.badge, props.badgeClassName);
    const statefulClassName = () => buildClassName(baseClassName(), !shouldBeUnMuted() && styles.muted);

    const unreadReactionsElement = hasUnreadReactions() && (
      <div class={buildClassName(statefulClassName(), styles.reaction, styles.round)}>
        <Icon name="heart" />
      </div>
    );

    const unreadPollVotesElement = hasUnreadPollVotes() && (
      <div class={buildClassName(statefulClassName(), styles.poll, styles.round)}>
        <Icon name="poll-badge" />
      </div>
    );

    const unreadMentionsElement = hasUnreadMentions() && (
      <div class={buildClassName(baseClassName(), styles.mention, styles.round)}>
        <Icon name="mention" />
      </div>
    );

    const unopenedTopicElement = isTopicUnopened() && (
      <div class={buildClassName(statefulClassName(), styles.unopened)} />
    );

    const unreadCountElement = isUnread() ? (
      <div class={buildClassName(statefulClassName(), styles.unread)}>
        {!hasUnreadMark() && <AnimatedCounter text={formatIntegerCompact(lang, unreadCount()!)} />}
      </div>
    ) : undefined;

    const pinnedElement = props.isPinned && (
      <div class={buildClassName(baseClassName(), styles.pinned)}>
        <Icon name="pin-filled" />
      </div>
    );

    const miniAppButton = props.hasMiniApp && (
      <Button
        color={props.isSelected ? 'secondary' : 'primary'}
        className={buildClassName(baseClassName(), styles.miniapp)}
        pill
        size="tiny"
        onClick={handleOpenApp}
      >
        {lang('BotChatMiniAppOpen')}
      </Button>
    );

    const visiblePinnedElement =
      !unreadCountElement &&
      !unreadMentionsElement &&
      !unreadReactionsElement &&
      !unreadPollVotesElement &&
      pinnedElement;

    const elements = [
      unopenedTopicElement,
      unreadPollVotesElement,
      unreadReactionsElement,
      unreadMentionsElement,
      unreadCountElement,
      visiblePinnedElement,
    ].filter(Boolean);

    if (props.isSavedDialog) return pinnedElement;

    // Show only if empty or have pinned icon
    if (props.hasMiniApp && (elements.length === 0 || visiblePinnedElement)) return miniAppButton;

    if (elements.length === 0) return undefined;

    if (elements.length === 1) return elements[0];

    if (props.shouldShowOnlyMostImportant) {
      const importanceOrderedElements = [
        unreadPollVotesElement,
        unreadReactionsElement,
        unreadMentionsElement,
        unreadCountElement,
        pinnedElement,
      ].filter(Boolean);
      return importanceOrderedElements[0];
    }

    return <div class={styles.wrapper}>{elements}</div>;
  }

  // Deviation: tt's `ShowTransition` keeps the previous children while it closes; the kit's keeps them live, so the
  // content is frozen while the badge is closing (it would be empty during the fade-out).
  const content = frozenWhile(renderContent, () => !effectiveIsOpen());

  return (
    <ShowTransition
      isCustom
      className={buildClassName(
        styles.transition,
        props.isSelected && styles.selected,
        props.isOnAvatar && styles.onAvatar,
        props.transitionClassName,
      )}
      isOpen={effectiveIsOpen()}
    >
      {content()}
    </ShowTransition>
  );
};

export default ChatBadge;
