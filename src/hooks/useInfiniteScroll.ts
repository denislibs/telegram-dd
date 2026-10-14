import { type Accessor, createMemo, createSignal } from 'frameact';

import { LoadMoreDirection } from '../types';

import { type MaybeAccessor, read } from '../util/accessors';
import { areSortedArraysEqual } from '../util/iteratees';

type GetMore = (args: { direction: LoadMoreDirection; noScroll?: boolean }) => void;
type LoadMoreBackwards = (args: { offsetId?: string | number }) => void;

const DEFAULT_LIST_SLICE = 30;

// Deviation: ported in place as an app primitive. The reactive arguments are `MaybeAccessor`s and the hook returns
// `[viewportIds, getMore, offset]` as accessors. tt computed the slice during render; here a memo does, with tt's
// refs as plain `let`s mutated inside it (the teact `previous*` values are `let`s updated at the end of each run, and
// `forceUpdate` is a version signal that `getMore` bumps). The memo is lazy: `getMore` reads it first.
// `getMore` is always defined (tt returned `[listIds]` without it while disabled); it does nothing then.
const useInfiniteScroll = <ListId extends string | number>(
  loadMoreBackwards?: LoadMoreBackwards,
  listIds?: MaybeAccessor<ListId[] | undefined>,
  isDisabled: MaybeAccessor<boolean> = false,
  listSlice: MaybeAccessor<number> = DEFAULT_LIST_SLICE,
  initialOffsetId?: MaybeAccessor<ListId | undefined>,
): [Accessor<ListId[] | undefined>, GetMore, Accessor<number | undefined>] => {
  let requestParamsRef:
    | {
        direction?: LoadMoreDirection;
        offsetId?: ListId;
      }
    | undefined;

  let currentStateRef: { viewportIds: ListId[]; isOnTop: boolean; offset: number } | undefined;

  let prevListIds: ListId[] | undefined;
  let prevIsDisabled: boolean | undefined;
  let prevInitialOffsetId: ListId | undefined;

  const [version, setVersion] = createSignal(0);

  const state = createMemo(() => {
    version(); // `forceUpdate`
    const listIds2 = read(listIds);
    const isDisabled2 = read(isDisabled);
    const listSlice2 = read(listSlice);
    const initialOffsetId2 = read(initialOffsetId);

    if (!currentStateRef && listIds2 && !isDisabled2) {
      const { newViewportIds, newIsOnTop, fromOffset } = getViewportSlice(
        listIds2,
        LoadMoreDirection.Forwards,
        listSlice2,
        initialOffsetId2 !== undefined && listIds2.includes(initialOffsetId2) ? initialOffsetId2 : listIds2[0],
      );
      currentStateRef = { viewportIds: newViewportIds, isOnTop: newIsOnTop, offset: fromOffset };
    }

    if (isDisabled2) {
      requestParamsRef = {};
    }

    const hasInitialOffsetChanged = initialOffsetId2 !== prevInitialOffsetId;
    if (
      listIds2 &&
      !isDisabled2 &&
      (listIds2 !== prevListIds || isDisabled2 !== prevIsDisabled || hasInitialOffsetChanged)
    ) {
      const { viewportIds, isOnTop } = currentStateRef || {};
      const shouldAnchorToInitial =
        initialOffsetId2 !== undefined &&
        listIds2.includes(initialOffsetId2) &&
        (hasInitialOffsetChanged || isDisabled2 !== prevIsDisabled);
      const currentMiddleId = viewportIds && !isOnTop ? viewportIds[Math.round(viewportIds.length / 2)] : undefined;
      const defaultOffsetId = shouldAnchorToInitial
        ? initialOffsetId2
        : currentMiddleId && listIds2.includes(currentMiddleId)
          ? currentMiddleId
          : listIds2[0];
      const { offsetId = defaultOffsetId, direction = LoadMoreDirection.Forwards } = shouldAnchorToInitial
        ? {}
        : requestParamsRef || {};
      const currentSlice =
        viewportIds && direction === LoadMoreDirection.Forwards && offsetId === listIds2[0]
          ? Math.max(listSlice2, viewportIds.length)
          : listSlice2;
      const { newViewportIds, newIsOnTop, fromOffset } = getViewportSlice(listIds2, direction, currentSlice, offsetId);

      requestParamsRef = {};

      if (!viewportIds || !areSortedArraysEqual(viewportIds, newViewportIds)) {
        currentStateRef = { viewportIds: newViewportIds, isOnTop: newIsOnTop, offset: fromOffset };
      }
    } else if (!listIds2) {
      currentStateRef = undefined;
    }

    prevListIds = listIds2;
    prevIsDisabled = isDisabled2;
    prevInitialOffsetId = initialOffsetId2;

    return currentStateRef;
  });

  const getMore: GetMore = ({ direction, noScroll }: { direction: LoadMoreDirection; noScroll?: boolean }) => {
    if (read(isDisabled)) return;

    state(); // bring `currentStateRef` up to date with the arguments
    const { viewportIds } = currentStateRef || {};

    const offsetId = viewportIds
      ? direction === LoadMoreDirection.Backwards
        ? viewportIds[viewportIds.length - 1]
        : viewportIds[0]
      : undefined;

    const listIds2 = read(listIds);
    if (!listIds2) {
      if (loadMoreBackwards) {
        loadMoreBackwards({ offsetId });
      }

      return;
    }

    const { newViewportIds, areSomeLocal, areAllLocal, newIsOnTop, fromOffset } = getViewportSlice(
      listIds2,
      direction,
      read(listSlice),
      offsetId,
    );

    if (areSomeLocal && !(viewportIds && areSortedArraysEqual(viewportIds, newViewportIds))) {
      currentStateRef = { viewportIds: newViewportIds, isOnTop: newIsOnTop, offset: fromOffset };
      setVersion((value) => value + 1);
    }

    if (!areAllLocal && loadMoreBackwards) {
      if (!noScroll) {
        requestParamsRef = { ...requestParamsRef, direction, offsetId };
      }

      loadMoreBackwards({ offsetId });
    }
  };

  const viewportIds = createMemo(() => {
    const state2 = state();
    return read(isDisabled) ? read(listIds) : state2?.viewportIds;
  });
  const offset = createMemo(() => {
    const state2 = state();
    return read(isDisabled) ? undefined : state2?.offset;
  });

  return [viewportIds, getMore, offset];
};

function getViewportSlice<ListId extends string | number>(
  sourceIds: ListId[],
  direction: LoadMoreDirection,
  listSlice: number,
  offsetId?: ListId,
) {
  const { length } = sourceIds;
  const index = offsetId ? sourceIds.indexOf(offsetId) : 0;
  const isForwards = direction === LoadMoreDirection.Forwards;
  const indexForDirection = isForwards ? index : index + 1 || length;
  const from = Math.max(0, indexForDirection - listSlice);
  const to = indexForDirection + listSlice - 1;
  const newViewportIds = sourceIds.slice(Math.max(0, from), to + 1);

  let areSomeLocal;
  let areAllLocal;
  switch (direction) {
    case LoadMoreDirection.Forwards:
      areSomeLocal = indexForDirection >= 0;
      areAllLocal = from >= 0;
      break;
    case LoadMoreDirection.Backwards:
      areSomeLocal = indexForDirection < length;
      areAllLocal = to <= length - 1;
      break;
  }

  return {
    newViewportIds,
    areSomeLocal,
    areAllLocal,
    newIsOnTop: newViewportIds[0] === sourceIds[0],
    fromOffset: from,
  };
}

export default useInfiniteScroll;
