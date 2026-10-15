import { createEffect, frameForcedReflow, requestMeasure, requestMutation } from 'frameact';
import { addExtraClass } from 'frameact/dom';

import type { FocusDirection, ScrollTargetPosition } from '../../../../types';

import { SCROLL_MAX_DISTANCE } from '../../../../config';
import { type MaybeAccessor, read } from '../../../../util/accessors';
import animateScroll from '../../../../util/animateScroll';
import { depsOf } from '../../../../util/effectDeps';
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

// Deviation: the reactive parameters are `MaybeAccessor`s, `elementRef` is an accessor of the element. tt's layout effect is a
// forced-reflow effect (it runs after the DOM update of the frame, in the measure half of the forced reflow, and hands
// the scroll to `animateScroll`'s mutation function, as tt does).
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
  elementRef: () => HTMLElement | undefined;
  isFocused?: MaybeAccessor<boolean | undefined>;
  focusDirection?: MaybeAccessor<FocusDirection | undefined>;
  noFocusHighlight?: MaybeAccessor<boolean | undefined>;
  isResizingContainer?: MaybeAccessor<boolean | undefined>;
  isJustAdded?: MaybeAccessor<boolean | undefined>;
  isQuote?: MaybeAccessor<boolean | undefined>;
  scrollTargetPosition?: MaybeAccessor<ScrollTargetPosition | undefined>;
}) {
  let isRelocatedRef = !read(isJustAdded);

  createEffect(
    depsOf(
      () =>
        [
          read(isFocused),
          read(focusDirection),
          read(noFocusHighlight),
          read(isResizingContainer),
          read(isQuote),
          read(scrollTargetPosition),
        ] as const,
    ),
    ([isFocused2, focusDirection2, noFocusHighlight2, isResizingContainer2, isQuote2, scrollTargetPosition2]) => {
      const isRelocated = isRelocatedRef;
      isRelocatedRef = false;

      const element = elementRef();
      if (isFocused2 && element) {
        const messagesContainer = element.closest<HTMLDivElement>('.MessageList');
        if (!messagesContainer) return;

        // `noFocusHighlight` is always called with “scroll-to-bottom” buttons
        const isToBottom = noFocusHighlight2;
        const scrollPosition = scrollTargetPosition2 || (isToBottom ? 'end' : 'centerOrTop');

        const exec = () => {
          const isFewMessagesScroll =
            Boolean(isToBottom) && messagesContainer.parentElement?.classList.contains(FORCE_MESSAGES_SCROLL_CLASS);
          const maxDistance = isFewMessagesScroll
            ? FEW_MESSAGES_SCROLL_RISE
            : focusDirection2 !== undefined
              ? isToBottom
                ? BOTTOM_FOCUS_OFFSET
                : RELOCATED_FOCUS_OFFSET
              : undefined;

          const topReserve = getMessageListTopReserve(messagesContainer);
          const bottomReserve = getEffectiveMessageListBottomReserve(messagesContainer);
          const marginReserve = scrollPosition === 'end' ? bottomReserve : topReserve;

          // Scroll to the quote itself so it stays visible in messages taller than the viewport
          const firstQuote = isQuote2 ? element.querySelector<HTMLSpanElement>('.is-quote') : undefined;

          const result = animateScroll({
            container: messagesContainer,
            element: firstQuote || element,
            position: scrollPosition,
            margin: (isToBottom ? BOTTOM_FOCUS_MARGIN : FOCUS_MARGIN) + marginReserve,
            topReserve,
            bottomReserve,
            maxDistance,
            forceDirection: focusDirection2,
            forceNormalContainerHeight: isResizingContainer2 && !isSendCollapsePhaseActive(messagesContainer),
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
    },
    frameForcedReflow,
  );
}
