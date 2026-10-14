import { createEffect, createMemo, onMount, previous, requestNextMutation } from 'frameact';
import { depsOf } from '../../../../util/effectDeps';

import { mapValues } from '../../../../util/iteratees';
import { useChatAnimationType } from './useChatAnimationType';

import useForceUpdate from '../../../../hooks/useForceUpdate';

const EMPTY_ORDER_DIFF = {};

// TODO(codemod): useOrderDiff: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useOrderDiff(orderedIds: (string | number)[] | undefined, topOffset: number, key?: string) {
  const orderById = createMemo(() => {
    if (!orderedIds) {
      return undefined;
    }

    return orderedIds.reduce(
      (acc, id, i) => {
        acc[id] = i;
        return acc;
      },
      {} as Record<string, number>,
    );
  });

  const prevOrderById = previous(() => orderById());
  const prevChatId = previous(() => key);
  const prevTopOffset = previous(() => topOffset);
  let isInitialRenderRef = true;

  onMount(() => {
    requestNextMutation(() => {
      isInitialRenderRef = false;
    });
  });

  let orderDiffByIdRef: Record<string | number, number> = EMPTY_ORDER_DIFF;
  // TODO(codemod): useForceUpdate: a component runs once; make the changing value a signal and delete the force update
  const forceUpdate = useForceUpdate();

  const onReorderAnimationEnd = () => {
    if (orderDiffByIdRef === EMPTY_ORDER_DIFF) return;

    orderDiffByIdRef = EMPTY_ORDER_DIFF;
    forceUpdate();
  };

  const shiftDiff = createMemo(() => (prevTopOffset() !== undefined ? topOffset - prevTopOffset() : 0));

  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(
    depsOf(() => [key, orderById(), prevChatId(), prevOrderById(), topOffset] as const),
    ([, orderById2, prevChatId2, prevOrderById2]) => {
      if (!orderById2 || !prevOrderById2 || key !== prevChatId2 || prevOrderById2 === orderById2) {
        orderDiffByIdRef = EMPTY_ORDER_DIFF;
        return;
      }

      const diff = mapValues(orderById2, (order, id) => {
        return prevOrderById2[id] !== undefined ? order - prevOrderById2[id] : -Infinity;
      });

      const hasChanges = Object.values(diff).some((value) => value !== 0);
      orderDiffByIdRef = hasChanges ? diff : EMPTY_ORDER_DIFF;
    },
  );

  const getAnimationType = useChatAnimationType(orderDiffByIdRef, isInitialRenderRef, Boolean(shiftDiff()));

  return {
    orderDiffById: orderDiffByIdRef,
    shiftDiff: shiftDiff(),
    getAnimationType,
    onReorderAnimationEnd,
  };
}
