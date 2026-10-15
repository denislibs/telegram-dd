import {
  type Accessor,
  createEffect,
  createMemo,
  createMutationEffect,
  createSignal,
  requestForcedReflow,
  requestMeasure,
} from 'frameact';

import { type MaybeAccessor, read } from '../../util/accessors';
import { depsOf } from '../../util/effectDeps';
import calcTextLineHeightAndCount from '../../util/element/calcTextLineHeightAndCount';
import useDebouncedCallback from '../useDebouncedCallback';
import useWindowSize from '../window/useWindowSize';

const WINDOW_RESIZE_LINE_RECALC_DEBOUNCE = 200;

// Deviation: a hook runs once, so the options are accessors (or plain values for a constant). `recalculationKey` is an
// accessor only: its value is any type, which `MaybeAccessor` could not tell from a getter. Element refs are accessors.
type UseCollapsibleLinesOptions<C extends HTMLElement> = {
  cutoutRef?: Accessor<C | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  noInitialCollapse?: MaybeAccessor<boolean | undefined>;
  recalculationKey?: Accessor<unknown>;
  ignoredLines?: MaybeAccessor<number | undefined>;
  isCollapsed?: MaybeAccessor<boolean | undefined>;
  onCollapseChange?: (isCollapsed: boolean) => void;
};

export default function useCollapsibleLines<T extends HTMLElement, C extends HTMLElement>(
  ref: Accessor<T | undefined>,
  maxLinesBeforeCollapse: number,
  {
    cutoutRef,
    isDisabled,
    noInitialCollapse,
    recalculationKey,
    ignoredLines,
    isCollapsed: isCollapsedControlled,
    onCollapseChange,
  }: UseCollapsibleLinesOptions<C> = {},
) {
  let isFirstRender = true;
  let cutoutHeight: number | undefined;
  let fullHeight: number | undefined;
  const shouldInitiallyCollapse = read(isCollapsedControlled) ?? !read(noInitialCollapse);
  const [isCollapsible, setIsCollapsible] = createSignal(!read(isDisabled) && shouldInitiallyCollapse);
  const [isCollapsedUncontrolled, setIsCollapsedUncontrolled] = createSignal(isCollapsible());
  const isCollapsed = createMemo(() => isCollapsible() && (read(isCollapsedControlled) ?? isCollapsedUncontrolled()));
  // A value in tt (`recalculationKey !== undefined`), read where it is used: the key is an accessor here
  const shouldKeepExpandedHeightAuto = () => recalculationKey?.() !== undefined;

  const setIsCollapsed = (newValue: boolean | ((prev: boolean) => boolean)) => {
    const isNextCollapsed = typeof newValue === 'function' ? newValue(isCollapsed()) : newValue;
    if (isNextCollapsed === isCollapsed()) return;

    if (read(isCollapsedControlled) === undefined) {
      setIsCollapsedUncontrolled(isNextCollapsed);
    }
    onCollapseChange?.(isNextCollapsed);
  };

  // The first apply (at creation, before the ref is set) returns at `isFirstRender`
  createMutationEffect(
    depsOf(() => [cutoutRef?.() ?? ref(), isCollapsed(), read(isDisabled), shouldKeepExpandedHeightAuto()] as const),
    ([element, isCollapsed2, isDisabled2, shouldKeepExpandedHeightAuto2]) => {
      const shouldUseStyleInExpand = !cutoutRef && !shouldKeepExpandedHeightAuto2;

      if (!element || isFirstRender) return;

      if (isDisabled2) {
        element.style.maxHeight = '';
        return;
      }

      element.style.maxHeight = isCollapsed2 ? `${cutoutHeight}px` : shouldUseStyleInExpand ? `${fullHeight}px` : ``;
    },
  );

  const recalculateTextLines = () => {
    const element = ref();
    if (read(isDisabled) || !element) {
      return;
    }

    const { lineHeight, totalLines } = calcTextLineHeightAndCount(element);
    fullHeight = element.scrollHeight;
    if (totalLines - (read(ignoredLines) || 0) > maxLinesBeforeCollapse) {
      cutoutHeight = lineHeight * maxLinesBeforeCollapse;
      setIsCollapsible(true);
    } else {
      setIsCollapsible(false);
      setIsCollapsedUncontrolled(false);
    }
  };

  const debouncedRecalcTextLines = useDebouncedCallback(
    () => requestMeasure(recalculateTextLines),
    [recalculateTextLines],
    WINDOW_RESIZE_LINE_RECALC_DEBOUNCE,
  );

  createMutationEffect(
    depsOf(() => [cutoutRef?.() ?? ref(), isCollapsed(), read(isDisabled), shouldKeepExpandedHeightAuto()] as const),
    ([, , isDisabled2]) => {
      if (!isDisabled2 && isFirstRender) {
        requestForcedReflow(() => {
          recalculateTextLines();

          return () => {
            isFirstRender = false;
            const element = cutoutRef?.() ?? ref();
            if (!element) return;
            element.style.maxHeight =
              isCollapsed() && cutoutHeight
                ? `${cutoutHeight}px`
                : shouldKeepExpandedHeightAuto()
                  ? ''
                  : `${fullHeight}px`;
          };
        });
      }
    },
  );

  createEffect(
    depsOf(() => [read(isDisabled), recalculationKey?.()] as const),
    ([isDisabled2, recalculationKey2]) => {
      if (isDisabled2 || isFirstRender || recalculationKey2 === undefined) return;

      requestMeasure(recalculateTextLines);
    },
  );

  // Parent resize is triggered on every collapse/expand, so we do recalculation only on window resize to save resources
  const windowSize = useWindowSize();
  createEffect(
    depsOf(() => [read(isDisabled), windowSize().width] as const),
    ([isDisabled2]) => {
      if (!isDisabled2) {
        if (isFirstRender) return;

        debouncedRecalcTextLines();
      } else {
        setIsCollapsible(false);
        setIsCollapsedUncontrolled(false);
      }
    },
  );

  return {
    isCollapsed,
    isCollapsible,
    setIsCollapsed,
  };
}
