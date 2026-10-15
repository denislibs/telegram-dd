import { createEffect, createMemo, requestMeasure } from 'frameact';
import { getActions } from '../../../global';
import { depsOf } from '../../../util/effectDeps';

import type { MessageListType } from '../../../types';
import type { Signal } from '../../../util/signals';
import { LoadMoreDirection } from '../../../types';

import { MESSAGE_LIST_SENSITIVE_AREA } from '../../../util/browser/windowEnvironment';
import { debounce } from '../../../util/schedulers';

import { useDebouncedSignal } from '../../../hooks/useAsyncResolvers';
import useDebouncedCallback from '../../../hooks/useDebouncedCallback';
import { useIntersectionObserver, useOnIntersect } from '../../../hooks/useIntersectionObserver';
import { useSignalEffect } from '../../../hooks/useSignalEffect';

const FAB_THRESHOLD = 50;
const NOTCH_THRESHOLD = 1; // Notch has zero height so we at least need a 1px margin to intersect
const CONTAINER_HEIGHT_DEBOUNCE = 200;
const SCROLL_TOOLS_DEBOUNCE = 100;
const TOOLS_FREEZE_TIMEOUT = 350; // Approximate message sending animation duration

// TODO(codemod): useScrollHooks: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useScrollHooks({
  type,
  containerRef,
  messageIds,
  getContainerHeight,
  isViewportNewest,
  isUnread,
  isReady,
  isReplacingHistoryRef,
  onScrollDownToggle,
}: {
  type: MessageListType;
  containerRef: (el: HTMLDivElement) => void;
  messageIds: number[];
  getContainerHeight: Signal<number | undefined>;
  isViewportNewest: boolean;
  isUnread: boolean;
  isReady: boolean;
  isReplacingHistoryRef: { current: boolean };
  onScrollDownToggle: BooleanToVoidFunction | undefined;
}) {
  const { loadViewportMessages } = getActions();

  const [loadMoreBackwards, loadMoreForwards] = createMemo(
    () =>
      type === 'thread'
        ? [
            debounce(() => loadViewportMessages({ direction: LoadMoreDirection.Backwards }), 1000, true, false),
            debounce(() => loadViewportMessages({ direction: LoadMoreDirection.Forwards }), 1000, true, false),
          ]
        : [],
  );

  let backwardsTriggerRef!: HTMLDivElement;
  let forwardsTriggerRef!: HTMLDivElement;
  let fabTriggerRef!: HTMLDivElement;

  const toggleScrollTools = (scrollDown: boolean) => {
    onScrollDownToggle?.(scrollDown);
  };

  const toggleScrollToolsDebounced = useDebouncedCallback(
    toggleScrollTools,
    [toggleScrollTools],
    SCROLL_TOOLS_DEBOUNCE,
    true,
    false,
  );

  const updateScrollTools = () => {
    if (!isReady) return;

    if (!messageIds?.length) {
      toggleScrollTools(false);

      return;
    }

    if (!isViewportNewest) {
      toggleScrollToolsDebounced(true);

      return;
    }

    const container = containerRef.current;
    const fabTrigger = fabTriggerRef;
    if (!container || !fabTrigger) return;

    const { offsetHeight, scrollHeight, scrollTop } = container;
    const fabOffsetTop = fabTrigger.offsetTop;
    const scrollBottom = Math.round(fabOffsetTop - scrollTop - offsetHeight);
    const isNearBottom = scrollBottom <= FAB_THRESHOLD;
    const isAtBottom = scrollBottom <= NOTCH_THRESHOLD;

    if (scrollHeight === 0) return;

    toggleScrollToolsDebounced(isUnread ? !isAtBottom : !isNearBottom);
  };

  const { observe: observeIntersectionForHistory } = useIntersectionObserver(
    {
      rootRef: containerRef,
      margin: MESSAGE_LIST_SENSITIVE_AREA,
    },
    (entries) => {
      if (!loadMoreForwards || !loadMoreBackwards) {
        return;
      }

      if (isReplacingHistoryRef.current) {
        return;
      }

      entries.forEach(({ isIntersecting, target }) => {
        if (!isIntersecting) return;

        if (target.className === 'backwards-trigger') {
          loadMoreBackwards();
        }

        if (target.className === 'forwards-trigger') {
          loadMoreForwards();
        }
      });
    },
  );

  const withHistoryTriggers = messageIds && messageIds.length > 1;

  useOnIntersect(() => backwardsTriggerRef, withHistoryTriggers ? observeIntersectionForHistory : undefined);
  useOnIntersect(() => forwardsTriggerRef, withHistoryTriggers ? observeIntersectionForHistory : undefined);

  const {
    observe: observeIntersectionForFab,
    freeze: freezeForFab,
    unfreeze: unfreezeForFab,
  } = useIntersectionObserver(
    {
      rootRef: containerRef,
      margin: FAB_THRESHOLD * 2,
      throttleScheduler: requestMeasure,
    },
    updateScrollTools,
  );

  useOnIntersect(() => fabTriggerRef, observeIntersectionForFab);

  const {
    observe: observeIntersectionForNotch,
    freeze: freezeForNotch,
    unfreeze: unfreezeForNotch,
  } = useIntersectionObserver(
    {
      rootRef: containerRef,
      margin: NOTCH_THRESHOLD,
      throttleScheduler: requestMeasure,
    },
    updateScrollTools,
  );

  useOnIntersect(() => fabTriggerRef, observeIntersectionForNotch);

  createEffect(() => isReady, () => {
    if (isReady) {
      updateScrollTools();
    }
  });

  createEffect(() => containerRef, () => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', updateScrollTools);
    container.addEventListener('scrollend', updateScrollTools);

    return () => {
      container.removeEventListener('scroll', updateScrollTools);
      container.removeEventListener('scrollend', updateScrollTools);
    };
  });

  const freezeShortly = () => {
    freezeForFab();
    freezeForNotch();

    setTimeout(() => {
      unfreezeForNotch();
      unfreezeForFab();
    }, TOOLS_FREEZE_TIMEOUT);
  };

  // Workaround for FAB and notch flickering with tall incoming message
  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(depsOf(() => [freezeShortly, messageIds]), freezeShortly);

  // Workaround for notch flickering when opening Composer Embedded Message
  const getContainerHeightDebounced = useDebouncedSignal(getContainerHeight, CONTAINER_HEIGHT_DEBOUNCE);
  // TODO(codemod): useSignalEffect: createEffect(compute, apply) with the signal reads in compute
  useSignalEffect(freezeShortly, [freezeShortly, getContainerHeightDebounced]);

  return {
    withHistoryTriggers,
    // TODO(codemod): "backwardsTriggerRef" was a ref object passed as a value: pass an accessor (() => backwardsTriggerRef) or a callback ref
    backwardsTriggerRef,
    // TODO(codemod): "forwardsTriggerRef" was a ref object passed as a value: pass an accessor (() => forwardsTriggerRef) or a callback ref
    forwardsTriggerRef,
    // TODO(codemod): "fabTriggerRef" was a ref object passed as a value: pass an accessor (() => fabTriggerRef) or a callback ref
    fabTriggerRef,
  };
}
