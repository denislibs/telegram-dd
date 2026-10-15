import {
  type Accessor,
  createEffect,
  createMeasureEffect,
  createMemo,
  createSignal,
  onMount,
  requestMeasure,
} from 'frameact';
import { getActions } from '../../../global';

import type { MessageListType } from '../../../types';
import { LoadMoreDirection } from '../../../types';

import { MESSAGE_LIST_SENSITIVE_AREA } from '../../../util/browser/windowEnvironment';
import { type MaybeAccessor, read } from '../../../util/accessors';
import { depsOf } from '../../../util/effectDeps';
import { debounce } from '../../../util/schedulers';

import { useDebouncedSignal } from '../../../hooks/useAsyncResolvers';
import useDebouncedCallback from '../../../hooks/useDebouncedCallback';
import { type ObserveFn, useIntersectionObserver } from '../../../hooks/useIntersectionObserver';

const FAB_THRESHOLD = 50;
const NOTCH_THRESHOLD = 1; // Notch has zero height so we at least need a 1px margin to intersect
const CONTAINER_HEIGHT_DEBOUNCE = 200;
const SCROLL_TOOLS_DEBOUNCE = 100;
const TOOLS_FREEZE_TIMEOUT = 350; // Approximate message sending animation duration

// Deviation: the parameters are `MaybeAccessor`s (a component runs once), `containerRef` and `getContainerHeight` are
// accessors, the trigger "refs" are callback refs that keep the element in a signal (the triggers are rendered
// conditionally, a `let` variable would not tell the observer effect that the element appeared).
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
  type: MaybeAccessor<MessageListType>;
  containerRef: () => HTMLDivElement | undefined;
  messageIds: MaybeAccessor<number[] | undefined>;
  getContainerHeight: Accessor<number | undefined>;
  isViewportNewest: MaybeAccessor<boolean>;
  isUnread: MaybeAccessor<boolean>;
  isReady: MaybeAccessor<boolean>;
  isReplacingHistoryRef: { current: boolean };
  onScrollDownToggle: BooleanToVoidFunction | undefined;
}) {
  const { loadViewportMessages } = getActions();

  // Recreated (the debounce state is reset) when the ids change, as in tt (`[loadViewportMessages, messageIds]`).
  const loadMore = createMemo(() => {
    read(messageIds);
    return read(type) === 'thread'
      ? ([
          debounce(() => loadViewportMessages({ direction: LoadMoreDirection.Backwards }), 1000, true, false),
          debounce(() => loadViewportMessages({ direction: LoadMoreDirection.Forwards }), 1000, true, false),
        ] as const)
      : undefined;
  });

  const [backwardsTrigger, setBackwardsTrigger] = createSignal<HTMLDivElement | undefined>(undefined);
  const [forwardsTrigger, setForwardsTrigger] = createSignal<HTMLDivElement | undefined>(undefined);
  const [fabTrigger, setFabTrigger] = createSignal<HTMLDivElement | undefined>(undefined);

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
    if (!read(isReady)) return;

    if (!read(messageIds)?.length) {
      toggleScrollTools(false);

      return;
    }

    if (!read(isViewportNewest)) {
      toggleScrollToolsDebounced(true);

      return;
    }

    const container = containerRef();
    const fabTriggerEl = fabTrigger();
    if (!container || !fabTriggerEl) return;

    const { offsetHeight, scrollHeight, scrollTop } = container;
    const fabOffsetTop = fabTriggerEl.offsetTop;
    const scrollBottom = Math.round(fabOffsetTop - scrollTop - offsetHeight);
    const isNearBottom = scrollBottom <= FAB_THRESHOLD;
    const isAtBottom = scrollBottom <= NOTCH_THRESHOLD;

    if (scrollHeight === 0) return;

    toggleScrollToolsDebounced(read(isUnread) ? !isAtBottom : !isNearBottom);
  };

  const { observe: observeIntersectionForHistory } = useIntersectionObserver(
    {
      rootRef: containerRef,
      margin: MESSAGE_LIST_SENSITIVE_AREA,
    },
    (entries) => {
      const loadMoreFns = loadMore();
      if (!loadMoreFns) {
        return;
      }
      const [loadMoreBackwards, loadMoreForwards] = loadMoreFns;

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

  const withHistoryTriggers = createMemo(() => {
    const ids = read(messageIds);
    return Boolean(ids && ids.length > 1);
  });

  // Deviation: tt's `useOnIntersect(ref, observe)` reads the element once; the triggers are rendered and removed by
  // `withHistoryTriggers`, so the element is tracked.
  const observeTarget = (
    target: Accessor<HTMLElement | undefined>,
    observe: Accessor<ObserveFn | undefined>,
    inNextFrame = false,
  ) => {
    createEffect(
      depsOf(() => [target(), observe()] as const),
      ([el, observe2]) => {
        if (!el || !observe2) return undefined;
        if (!inNextFrame) return observe2(el);

        // Deviation (history triggers): observed in the measure phase of the next frame. An observer reports a trigger once,
        // when its state changes, and `isReplacingHistoryRef` drops the reports that arrive while the history is being
        // replaced (the frame in which the list is rendered and positioned). tt observed from `useEffect`, i.e. after that
        // frame; observing at once here would get the first report of a new list dropped and no load would ever start.
        let stop: NoneToVoidFunction | undefined;
        let isCancelled = false;
        requestMeasure(() => {
          if (!isCancelled) stop = observe2(el);
        });
        return () => {
          isCancelled = true;
          stop?.();
        };
      },
    );
  };

  observeTarget(backwardsTrigger, () => (withHistoryTriggers() ? observeIntersectionForHistory : undefined), true);
  observeTarget(forwardsTrigger, () => (withHistoryTriggers() ? observeIntersectionForHistory : undefined), true);

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

  observeTarget(fabTrigger, () => observeIntersectionForFab);

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

  observeTarget(fabTrigger, () => observeIntersectionForNotch);

  createMeasureEffect(
    () => read(isReady),
    (isReady2) => {
      if (isReady2) {
        updateScrollTools();
      }
    },
  );

  onMount(() => {
    const container = containerRef();
    if (!container) return undefined;

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
  createEffect(
    () => read(messageIds),
    () => freezeShortly(),
  );

  // Workaround for notch flickering when opening Composer Embedded Message
  const getContainerHeightDebounced = useDebouncedSignal(getContainerHeight, CONTAINER_HEIGHT_DEBOUNCE);
  createEffect(
    () => getContainerHeightDebounced(),
    () => freezeShortly(),
  );

  return {
    withHistoryTriggers,
    backwardsTriggerRef: setBackwardsTrigger,
    forwardsTriggerRef: setForwardsTrigger,
    fabTriggerRef: setFabTrigger,
  };
}
