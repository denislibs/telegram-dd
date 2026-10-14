import { createMemo, previous } from 'frameact';

import { LoadMoreDirection } from '../types';

import { areSortedArraysEqual } from '../util/iteratees';
import useForceUpdate from './useForceUpdate';
import useLastCallback from './useLastCallback';
import usePreviousDeprecated from './usePreviousDeprecated';

type GetMore = (args: { direction: LoadMoreDirection; noScroll?: boolean }) => void;
type LoadMoreBackwards = (args: { offsetId?: string | number }) => void;

const DEFAULT_LIST_SLICE = 30;

// TODO(codemod): useInfiniteScroll: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
const useInfiniteScroll = <ListId extends string | number>(
  loadMoreBackwards?: LoadMoreBackwards,
  listIds?: ListId[],
  isDisabled = false,
  listSlice = DEFAULT_LIST_SLICE,
  initialOffsetId?: ListId,
): [ListId[]?, GetMore?, number?] => {
  let requestParamsRef:
    | {
        direction?: LoadMoreDirection;
        offsetId?: ListId;
      }
    | undefined;

  let currentStateRef: { viewportIds: ListId[]; isOnTop: boolean; offset: number } | undefined;
  if (!currentStateRef && listIds && !isDisabled) {
    const { newViewportIds, newIsOnTop, fromOffset } = getViewportSlice(
      listIds,
      LoadMoreDirection.Forwards,
      listSlice,
      initialOffsetId !== undefined && listIds.includes(initialOffsetId) ? initialOffsetId : listIds[0],
    );
    currentStateRef = { viewportIds: newViewportIds, isOnTop: newIsOnTop, offset: fromOffset };
  }

  // TODO(codemod): useForceUpdate: a component runs once; make the changing value a signal and delete the force update
  const forceUpdate = useForceUpdate();

  if (isDisabled) {
    requestParamsRef = {};
  }

  const prevListIds = previous(() => listIds);
  const prevIsDisabled = previous(() => isDisabled);
  const prevInitialOffsetId = previous(() => initialOffsetId);
  const hasInitialOffsetChanged = createMemo(() => initialOffsetId !== prevInitialOffsetId());
  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (
    listIds &&
    !isDisabled &&
    (listIds !== prevListIds() || isDisabled !== prevIsDisabled() || hasInitialOffsetChanged())
  ) {
    const { viewportIds, isOnTop } = currentStateRef || {};
    const shouldAnchorToInitial =
      initialOffsetId !== undefined &&
      listIds.includes(initialOffsetId) &&
      (hasInitialOffsetChanged() || isDisabled !== prevIsDisabled());
    const currentMiddleId = viewportIds && !isOnTop ? viewportIds[Math.round(viewportIds.length / 2)] : undefined;
    const defaultOffsetId = shouldAnchorToInitial
      ? initialOffsetId
      : currentMiddleId && listIds.includes(currentMiddleId)
        ? currentMiddleId
        : listIds[0];
    const { offsetId = defaultOffsetId, direction = LoadMoreDirection.Forwards } = shouldAnchorToInitial
      ? {}
      : requestParamsRef || {};
    const currentSlice =
      viewportIds && direction === LoadMoreDirection.Forwards && offsetId === listIds[0]
        ? Math.max(listSlice, viewportIds.length)
        : listSlice;
    const { newViewportIds, newIsOnTop, fromOffset } = getViewportSlice(listIds, direction, currentSlice, offsetId);

    requestParamsRef = {};

    if (!viewportIds || !areSortedArraysEqual(viewportIds, newViewportIds)) {
      currentStateRef = { viewportIds: newViewportIds, isOnTop: newIsOnTop, offset: fromOffset };
    }
  } else if (!listIds) {
    currentStateRef = undefined;
  }

  const getMore: GetMore = ({ direction, noScroll }: { direction: LoadMoreDirection; noScroll?: boolean }) => {
    const { viewportIds } = currentStateRef || {};

    const offsetId = viewportIds
      ? direction === LoadMoreDirection.Backwards
        ? viewportIds[viewportIds.length - 1]
        : viewportIds[0]
      : undefined;

    if (!listIds) {
      if (loadMoreBackwards) {
        loadMoreBackwards({ offsetId });
      }

      return;
    }

    const { newViewportIds, areSomeLocal, areAllLocal, newIsOnTop, fromOffset } = getViewportSlice(
      listIds,
      direction,
      listSlice,
      offsetId,
    );

    if (areSomeLocal && !(viewportIds && areSortedArraysEqual(viewportIds, newViewportIds))) {
      currentStateRef = { viewportIds: newViewportIds, isOnTop: newIsOnTop, offset: fromOffset };
      forceUpdate();
    }

    if (!areAllLocal && loadMoreBackwards) {
      if (!noScroll) {
        requestParamsRef = { ...requestParamsRef, direction, offsetId };
      }

      loadMoreBackwards({ offsetId });
    }
  };

  return isDisabled ? [listIds] : [currentStateRef?.viewportIds, getMore, currentStateRef?.offset];
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
