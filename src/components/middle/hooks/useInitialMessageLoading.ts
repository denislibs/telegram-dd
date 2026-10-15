import { createEffect, frameForcedReflow } from 'frameact';

import { MESSAGE_LIST_SLICE } from '../../../config';
import { type MaybeAccessor, read } from '../../../util/accessors';
import { depsOf } from '../../../util/effectDeps';
import { isLocalMessageId } from '../../../util/keys/messageKey';

// Deviation: tt had this effect inline in `MessageList`; it is a hook here so that the phase it runs in can be tested.
// A forced-reflow effect, not a measure effect: tt's `useEffect` ran after teact patched the DOM, so the height of the content
// was that of the new `messageIds`. A measure effect runs before the mutate phase of the frame in which the ids changed and
// would read the previous content (a request too many after a short page, or a skipped one after a tall list).
export default function useInitialMessageLoading({
  containerRef,
  isChatLoaded,
  messageIds,
  loadMoreAround,
  focusingId,
  isRestricted,
}: {
  containerRef: () => HTMLDivElement | undefined;
  isChatLoaded: MaybeAccessor<boolean | undefined>;
  messageIds: MaybeAccessor<number[] | undefined>;
  loadMoreAround: () => NoneToVoidFunction | undefined;
  focusingId: MaybeAccessor<number | undefined>;
  isRestricted: MaybeAccessor<boolean | undefined>;
}) {
  createEffect(
    depsOf(
      () => [read(isChatLoaded), read(messageIds), loadMoreAround(), read(focusingId), read(isRestricted)] as const,
    ),
    ([isChatLoaded2, messageIds2, loadMoreAround2, focusingId2, isRestricted2]) => {
      if (!loadMoreAround2 || !isChatLoaded2 || isRestricted2 || focusingId2) {
        return;
      }

      // Loading history while sending a message can return the same message and cause ambiguity
      const isLastMessageLocal = messageIds2 && isLocalMessageId(messageIds2[messageIds2.length - 1]);
      if (isLastMessageLocal) {
        return;
      }

      const container = containerRef();
      if (!container) return;

      if (
        !messageIds2 ||
        messageIds2.length === 1 ||
        (messageIds2.length < MESSAGE_LIST_SLICE / 2 &&
          (container.firstElementChild as HTMLDivElement).clientHeight <= container.offsetHeight)
      ) {
        loadMoreAround2();
      }
    },
    frameForcedReflow,
  );
}
