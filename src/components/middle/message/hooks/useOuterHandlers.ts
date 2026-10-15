import { type Accessor, createEffect, requestMeasure } from 'frameact';
import { getActions } from '../../../../global';

import { type MaybeAccessor, read } from '../../../../util/accessors';
import { IS_ANDROID, IS_TOUCH_ENV } from '../../../../util/browser/windowEnvironment';
import { captureEvents, SwipeDirection } from '../../../../util/captureEvents';
import { depsOf } from '../../../../util/effectDeps';
import stopEvent from '../../../../util/stopEvent';
import windowSize from '../../../../util/windowSize';
import { REM } from '../../../common/helpers/mediaDimensions';
import { preventMessageInputBlur } from '../../helpers/preventMessageInputBlur';

import useFlag from '../../../../hooks/useFlag';
import useThrottledCallback from '../../../../hooks/useThrottledCallback';

const ANDROID_KEYBOARD_HIDE_DELAY_MS = 350;
const SWIPE_ANIMATION_DURATION = 150;
const QUICK_REACTION_DOUBLE_TAP_DELAY = 200;
const QUICK_REACTION_AREA_WIDTH = 3 * REM;
const QUICK_REACTION_AREA_HEIGHT = Number(REM);
const GROUP_MESSAGE_HOVER_ATTRIBUTE = 'data-is-document-group-hover';

// Deviation: a hook runs once. The reactive parameters are `MaybeAccessor`s and the refs are accessors of the element.
// The returned handlers are always defined and check the select mode / protection when the event arrives (tt returned
// `undefined` for a render in which the handler is off, and the bound handler of an element cannot change here);
// `isSwiped` and `isQuickReactionVisible` are accessors.
export default function useOuterHandlers(
  selectMessage: (e?: React.MouseEvent<HTMLDivElement, MouseEvent>, groupedId?: string) => void,
  containerRef: Accessor<HTMLDivElement | undefined>,
  messageId: MaybeAccessor<number>,
  isInSelectMode: MaybeAccessor<boolean>,
  canReply: MaybeAccessor<boolean>,
  isProtected: MaybeAccessor<boolean>,
  onContextMenu: (e: React.MouseEvent) => void,
  handleBeforeContextMenu: (e: React.MouseEvent) => void,
  chatId: MaybeAccessor<string>,
  isContextMenuShown: MaybeAccessor<boolean>,
  quickReactionRef: Accessor<HTMLDivElement | undefined>,
  shouldHandleMouseLeave: MaybeAccessor<boolean>,
  getIsMessageListReady?: Accessor<boolean>,
  isEphemeral?: MaybeAccessor<boolean | undefined>,
) {
  const { updateDraftReplyInfo, sendDefaultReaction } = getActions();

  const [isQuickReactionVisible, markQuickReactionVisible, unmarkQuickReactionVisible] = useFlag();
  const [isSwiped, markSwiped, unmarkSwiped] = useFlag();
  let doubleTapTimeoutRef: number | undefined;

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (read(isInSelectMode)) return;

    preventMessageInputBlur(e);
    handleBeforeContextMenu(e);
  }

  const handleMouseMove = useThrottledCallback(
    (e: React.MouseEvent) => {
      const quickReactionContainer = quickReactionRef();
      if (!quickReactionContainer) return;

      const { clientX, clientY } = e;
      const {
        x: quickReactionX,
        width: quickReactionWidth,
        y: quickReactionY,
        height: quickReactionHeight,
      } = quickReactionContainer.getBoundingClientRect();
      const x = quickReactionX + quickReactionWidth / 2;
      const y = quickReactionY + quickReactionHeight / 2;

      const isVisibleX = Math.abs(x - clientX) < QUICK_REACTION_AREA_WIDTH;
      const isVisibleY = Math.abs(y - clientY) < QUICK_REACTION_AREA_HEIGHT;
      if (isVisibleX && isVisibleY) {
        markQuickReactionVisible();
      } else {
        unmarkQuickReactionVisible();
      }
    },
    [quickReactionRef],
    requestMeasure,
  );

  function handleSendQuickReaction(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    e.stopPropagation();
    if (read(isEphemeral)) return;
    sendDefaultReaction({
      chatId: read(chatId),
      messageId: read(messageId),
    });
  }

  function handleTap(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (IS_ANDROID) {
      const target = e.target as HTMLDivElement;
      if (!target.classList.contains('text-content') && !target.classList.contains('Message')) {
        return;
      }

      if (windowSize.getIsKeyboardVisible()) {
        setTimeout(() => {
          onContextMenu(e);
        }, ANDROID_KEYBOARD_HIDE_DELAY_MS);
      } else {
        onContextMenu(e);
      }
    }
  }

  function handleDoubleTap() {
    if (read(isEphemeral)) return;
    sendDefaultReaction({
      chatId: read(chatId),
      messageId: read(messageId),
    });
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (read(isInSelectMode)) {
      selectMessage(e);
      return;
    }

    if (!IS_TOUCH_ENV) return;

    if (doubleTapTimeoutRef) {
      clearTimeout(doubleTapTimeoutRef);
      doubleTapTimeoutRef = undefined;
      handleDoubleTap();
      return;
    }

    doubleTapTimeoutRef = window.setTimeout(() => {
      doubleTapTimeoutRef = undefined;
      handleTap(e);
    }, QUICK_REACTION_DOUBLE_TAP_DELAY);
  }

  function handleContextMenu(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (read(isInSelectMode)) {
      if (read(isProtected)) stopEvent(e);
      return;
    }

    if (IS_ANDROID) {
      if ((e.target as HTMLElement).matches('a[href]') || read(isContextMenuShown)) {
        return;
      }

      e.preventDefault();
      selectMessage();
    } else {
      onContextMenu(e);
    }
  }

  function handleContainerDoubleClick() {
    if (read(isInSelectMode)) return;
    if (IS_TOUCH_ENV || !read(canReply)) return;

    if (read(isEphemeral)) {
      updateDraftReplyInfo({
        type: 'ephemeral',
        replyToMsgId: read(messageId),
      });
      return;
    }

    updateDraftReplyInfo({
      replyToMsgId: read(messageId),
      replyToPeerId: undefined,
      quoteText: undefined,
      quoteOffset: undefined,
    });
  }

  function handleContentDoubleClick(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (IS_TOUCH_ENV) return;

    e.stopPropagation();
  }

  createEffect(
    depsOf(
      () =>
        [
          read(isInSelectMode),
          read(messageId),
          read(canReply),
          read(isContextMenuShown),
          // Deviation: the readiness of the list is a signal here (tt read it in the effect body, which re-ran with the
          // render): it is read in the compute half, so the swipe is attached when the list becomes ready.
          getIsMessageListReady ? getIsMessageListReady() : true,
          read(isEphemeral),
        ] as const,
    ),
    ([isInSelectMode2, messageId2, canReply2, isContextMenuShown2, isListReady, isEphemeral2]) => {
      const container = containerRef();
      if (!IS_TOUCH_ENV || isInSelectMode2 || !canReply2 || isContextMenuShown2 || !isListReady || !container) {
        return undefined;
      }

      let startedAt: number | undefined;
      return captureEvents(container, {
        selectorToPreventScroll: '.MessageList',
        excludedClosestSelector: '.no-word-wrap',
        onSwipe: (e, direction) => {
          if (direction === SwipeDirection.Left) {
            if (!startedAt) {
              startedAt = Date.now();
            }

            markSwiped();

            return true;
          }

          return false;
        },
        onRelease: () => {
          if (!startedAt || !canReply2) {
            return;
          }

          if (isEphemeral2) {
            updateDraftReplyInfo({
              type: 'ephemeral',
              replyToMsgId: messageId2,
            });
          } else {
            updateDraftReplyInfo({ replyToMsgId: messageId2 });
          }

          setTimeout(unmarkSwiped, Math.max(0, SWIPE_ANIMATION_DURATION - (Date.now() - startedAt)));
          startedAt = undefined;
        },
      });
    },
  );

  function handleMouseLeave(e: React.MouseEvent<HTMLDivElement>) {
    // Because `mousemove` event is throttled, we need to also throttle `mouseleave` event,
    // so the order of events is preserved
    requestMeasure(unmarkQuickReactionVisible);
    if (read(shouldHandleMouseLeave)) handleDocumentGroupMouseLeave(e);
  }

  function handleDocumentGroupMouseEnterIfNeeded(e: React.MouseEvent<HTMLDivElement>) {
    if (read(shouldHandleMouseLeave)) handleDocumentGroupMouseEnter(e);
  }

  return {
    handleMouseDown,
    handleClick,
    handleContextMenu,
    handleDoubleClick: handleContainerDoubleClick,
    handleContentDoubleClick,
    handleMouseMove,
    handleSendQuickReaction,
    handleMouseLeave,
    isSwiped,
    isQuickReactionVisible,
    handleDocumentGroupMouseEnter: handleDocumentGroupMouseEnterIfNeeded,
  };
}

function handleDocumentGroupMouseEnter(e: React.MouseEvent<HTMLDivElement>) {
  const lastGroupElement = getLastElementInDocumentGroup(e.currentTarget);
  if (lastGroupElement) {
    lastGroupElement.setAttribute(GROUP_MESSAGE_HOVER_ATTRIBUTE, '');
  }
}

function handleDocumentGroupMouseLeave(e: React.MouseEvent<HTMLDivElement>) {
  const lastGroupElement = getLastElementInDocumentGroup(e.currentTarget);
  if (lastGroupElement) {
    lastGroupElement.removeAttribute(GROUP_MESSAGE_HOVER_ATTRIBUTE);
  }
}

function getLastElementInDocumentGroup(element: Element) {
  let current: Element | null = element;

  do {
    current = current.nextElementSibling;
  } while (current && !current.classList.contains('last-in-document-group'));

  return current;
}
