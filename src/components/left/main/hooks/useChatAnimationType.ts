import { createMemo } from 'frameact';

import { type MaybeAccessor, read } from '../../../../util/accessors';

export enum ChatAnimationTypes {
  Shift,
  Move,
  Opacity,
  None,
}

export const ARCHIVE_ANIMATION_ID = 'archive';

// Deviation: the parameters are `MaybeAccessor`s and the result is an accessor of tt's `(chatId) => type` function (the
// memo re-runs when the order diff, the initial-render flag or the shift flag changes).
export function useChatAnimationType<T extends number | string>(
  orderDiffById: MaybeAccessor<Record<T, number>>,
  isInitialRender: MaybeAccessor<boolean>,
  isShifted?: MaybeAccessor<boolean | undefined>,
) {
  return createMemo(() => {
    const orderDiffById2 = read(orderDiffById);
    const isInitialRender2 = read(isInitialRender);
    const isShifted2 = read(isShifted);

    if (isInitialRender2) {
      return () => ChatAnimationTypes.None;
    }

    const orderDiffs = Object.values<number>(orderDiffById2);
    const numberOfUp = orderDiffs.filter((diff) => diff < 0).length;
    const numberOfDown = orderDiffs.filter((diff) => diff > 0).length;

    return (chatId: T): ChatAnimationTypes => {
      const orderDiff = orderDiffById2[chatId];
      if (!orderDiff) {
        if (isShifted2) {
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
