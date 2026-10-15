import { createMemo, createSignal, onMount, requestNextMutation } from 'frameact';

import { type MaybeAccessor, read } from '../../../../util/accessors';
import { mapValues } from '../../../../util/iteratees';
import { useChatAnimationType } from './useChatAnimationType';

const EMPTY_ORDER_DIFF = {};

// Deviation: a hook runs once. The parameters are `MaybeAccessor`s and the result holds accessors (`orderDiffById`,
// `shiftDiff`, `getAnimationType`; `onReorderAnimationEnd` is a function). tt computed the diff during render
// (`useSyncEffect`) from the previous render's values; here memos do (they are lazy: the chat rows read them), the
// "previous" values are `let`s updated at the end of each run and tt's `forceUpdate` is a version signal bumped by
// `onReorderAnimationEnd`. tt reset the diff on the next render of the list, whatever caused it (a scroll that slides the
// window re-renders the list too): `renderKey` stands for "the list was rendered again", the caller passes what changes
// with such a render (the rendered window of ids). The diff then lasts for the render of the reorder and is reset by the
// next one or by the end of the animation (a bump of the version re-runs the memos with nothing changed).
export default function useOrderDiff(
  orderedIds: MaybeAccessor<(string | number)[] | undefined>,
  topOffset: MaybeAccessor<number>,
  key?: MaybeAccessor<string | undefined>,
  renderKey?: MaybeAccessor<unknown>,
) {
  const orderById = createMemo(() => {
    const orderedIds2 = read(orderedIds);
    if (!orderedIds2) {
      return undefined;
    }

    return orderedIds2.reduce(
      (acc, id, i) => {
        acc[id] = i;
        return acc;
      },
      {} as Record<string, number>,
    );
  });

  let prevOrderById: Record<string, number> | undefined;
  let prevChatId: string | undefined;
  let prevTopOffset: number | undefined;
  let isInitialRender = true;

  onMount(() => {
    requestNextMutation(() => {
      isInitialRender = false;
    });
  });

  let orderDiffByIdRef: Record<string | number, number> = EMPTY_ORDER_DIFF;
  let shiftDiffRef = 0;
  const [version, setVersion] = createSignal(0); // tt's `forceUpdate`

  const onReorderAnimationEnd = () => {
    if (orderDiffByIdRef === EMPTY_ORDER_DIFF && !shiftDiffRef) return;

    orderDiffByIdRef = EMPTY_ORDER_DIFF;
    setVersion((value) => value + 1);
  };

  const shiftDiff = createMemo(() => {
    version();
    const topOffset2 = read(topOffset);
    shiftDiffRef = prevTopOffset !== undefined ? topOffset2 - prevTopOffset : 0;
    prevTopOffset = topOffset2;

    return shiftDiffRef;
  });

  // `useSyncEffect`
  const orderDiffById = createMemo(() => {
    version();
    read(renderKey);
    const key2 = read(key);
    const orderById2 = orderById();
    const prevOrderById2 = prevOrderById;
    const prevChatId2 = prevChatId;
    prevOrderById = orderById2;
    prevChatId = key2;

    if (!orderById2 || !prevOrderById2 || key2 !== prevChatId2 || prevOrderById2 === orderById2) {
      orderDiffByIdRef = EMPTY_ORDER_DIFF;
      return orderDiffByIdRef;
    }

    const diff = mapValues(orderById2, (order, id) => {
      return prevOrderById2[id] !== undefined ? order - prevOrderById2[id] : -Infinity;
    });

    const hasChanges = Object.values(diff).some((value) => value !== 0);
    orderDiffByIdRef = hasChanges ? diff : EMPTY_ORDER_DIFF;
    return orderDiffByIdRef;
  });

  const getAnimationType = useChatAnimationType(
    orderDiffById,
    () => isInitialRender,
    () => Boolean(shiftDiff()),
  );

  return {
    orderDiffById,
    shiftDiff,
    getAnimationType,
    onReorderAnimationEnd,
  };
}
