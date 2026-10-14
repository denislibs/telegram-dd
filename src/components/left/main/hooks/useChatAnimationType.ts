import { createMemo } from 'frameact';

import { type MaybeAccessor, read } from '../../../../util/accessors';

export enum ChatAnimationTypes {
  Shift,
  Move,
  Opacity,
  None,
}

export const ARCHIVE_ANIMATION_ID = 'archive';

// Deviation: the arguments are `MaybeAccessor`s and the result is an accessor of tt's function (frameact hooks run once).
export function useChatAnimationType<T extends number | string>(
  orderDiffById: MaybeAccessor<Record<T, number>>,
  isInitialRender: MaybeAccessor<boolean>,
  isShifted?: MaybeAccessor<boolean | undefined>,
) {
  return createMemo(() => {
    if (read(isInitialRender)) {
      return () => ChatAnimationTypes.None;
    }

    const orderDiffs = Object.values<number>(read(orderDiffById));
    const numberOfUp = orderDiffs.filter((diff) => diff < 0).length;
    const numberOfDown = orderDiffs.filter((diff) => diff > 0).length;

    return (chatId: T): ChatAnimationTypes => {
      const orderDiff = read(orderDiffById)[chatId];
      if (!orderDiff) {
        if (read(isShifted)) {
          return ChatAnimationTypes.Shift;
        }
        return ChatAnimationTypes.None;
      }

      if (
        orderDiff === Infinity ||
        orderDiff === -Infinity ||
        (numberOfUp <= numberOfDown && orderDiff < 0) ||
        (numberOfDown < numberOfUp && orderDiff > 0)
      ) {
        return ChatAnimationTypes.Opacity;
      }

      return ChatAnimationTypes.Move;
    };
  });
}
