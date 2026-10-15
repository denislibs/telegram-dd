import { createMutationEffect, requestMeasure, requestMutation } from 'frameact';
import { addExtraClass } from 'frameact/dom';
import { depsOf } from '../../../../util/effectDeps';

import type { FocusDirection, ScrollTargetPosition } from '../../../../types';

import { SCROLL_MAX_DISTANCE } from '../../../../config';
import animateScroll from '../../../../util/animateScroll';
import { REM } from '../../../common/helpers/mediaDimensions';
import { requestAfterMessageListReflow } from '../../helpers/messageListReflow';
import {
  getEffectiveMessageListBottomReserve,
  getMessageListTopReserve,
  isSendCollapsePhaseActive,
} from '../../helpers/messageListReserves';

// This is used when the viewport was replaced.
const BOTTOM_FOCUS_OFFSET = 500;
const RELOCATED_FOCUS_OFFSET = SCROLL_MAX_DISTANCE;
const FOCUS_MARGIN = 1.25 * REM;
const BOTTOM_FOCUS_MARGIN = 0.5 * REM;
const FORCE_MESSAGES_SCROLL_CLASS = 'force-messages-scroll';
const FEW_MESSAGES_SCROLL_RISE = 4 * REM;

// TODO(codemod): useFocusMessageListElement: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useFocusMessageListElement({
  elementRef,
  isFocused,
  focusDirection,
  noFocusHighlight,
  isResizingContainer,
  isJustAdded,
  isQuote,
  scrollTargetPosition,
}: {
  elementRef: (el: HTMLDivElement) => void;
  isFocused?: boolean;
  focusDirection?: FocusDirection;
  noFocusHighlight?: boolean;
  isResizingContainer?: boolean;
  isJustAdded?: boolean;
  isQuote?: boolean;
  scrollTargetPosition?: ScrollTargetPosition;
}) {
  let isRelocatedRef = !isJustAdded;

  createMutationEffect(depsOf(() => [elementRef, isFocused, focusDirection, noFocusHighlight, isResizingContainer, isQuote, scrollTargetPosition]), () => {
    const isRelocated = isRelocatedRef;
    isRelocatedRef = false;

    if (isFocused && elementRef.current) {
      const messagesContainer = elementRef.current.closest<HTMLDivElement>('.MessageList');
      if (!messagesContainer) return;

      // `noFocusHighlight` is always called with “scroll-to-bottom” buttons
      const isToBottom = noFocusHighlight;
      const scrollPosition = scrollTargetPosition || (isToBottom ? 'end' : 'centerOrTop');

      const exec = () => {
        const isFewMessagesScroll =
          Boolean(isToBottom) && messagesContainer.parentElement?.classList.contains(FORCE_MESSAGES_SCROLL_CLASS);
        const maxDistance = isFewMessagesScroll
          ? FEW_MESSAGES_SCROLL_RISE
          : focusDirection !== undefined
            ? isToBottom
              ? BOTTOM_FOCUS_OFFSET
              : RELOCATED_FOCUS_OFFSET
            : undefined;

        const topReserve = getMessageListTopReserve(messagesContainer);
        const bottomReserve = getEffectiveMessageListBottomReserve(messagesContainer);
        const marginReserve = scrollPosition === 'end' ? bottomReserve : topReserve;

        // Scroll to the quote itself so it stays visible in messages taller than the viewport
        const firstQuote = isQuote ? elementRef.current!.querySelector<HTMLSpanElement>('.is-quote') : undefined;

        const result = animateScroll({
          container: messagesContainer,
          element: firstQuote || elementRef.current!,
          position: scrollPosition,
          margin: (isToBottom ? BOTTOM_FOCUS_MARGIN : FOCUS_MARGIN) + marginReserve,
          topReserve,
          bottomReserve,
          maxDistance,
          forceDirection: focusDirection,
          forceNormalContainerHeight: isResizingContainer && !isSendCollapsePhaseActive(messagesContainer),
          shouldReturnMutationFn: true,
        });

        if (firstQuote) {
          requestMutation(() => {
            addExtraClass(firstQuote, 'animate');
          });
        }

        return result;
      };

      if (isRelocated) {
        // We need this to override scroll setting from Message List layout effect
        requestAfterMessageListReflow(exec);
      } else {
        requestMeasure(() => {
          requestMutation(exec()!);
        });
      }
    }
  });
}
