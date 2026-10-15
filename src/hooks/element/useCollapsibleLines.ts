import { createEffect, createMemo, createMutationEffect, createSignal, requestForcedReflow, requestMeasure } from 'frameact';
import { depsOf } from '../../util/effectDeps';

import calcTextLineHeightAndCount from '../../util/element/calcTextLineHeightAndCount';
import useDebouncedCallback from '../useDebouncedCallback';
import useLastCallback from '../useLastCallback';
import useWindowSize from '../window/useWindowSize';

const WINDOW_RESIZE_LINE_RECALC_DEBOUNCE = 200;

type UseCollapsibleLinesOptions<C extends HTMLElement> = {
  cutoutRef?: (el: C) => void;
  isDisabled?: boolean;
  noInitialCollapse?: boolean;
  recalculationKey?: unknown;
  ignoredLines?: number;
  isCollapsed?: boolean;
  onCollapseChange?: (isCollapsed: boolean) => void;
};

// TODO(codemod): useCollapsibleLines: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useCollapsibleLines<T extends HTMLElement, C extends HTMLElement>(
  ref: (el: T) => void,
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
  let isFirstRenderRef = true;
  let cutoutHeightRef: number | undefined;
  let fullHeightRef: number | undefined;
  const shouldInitiallyCollapse = isCollapsedControlled ?? !noInitialCollapse;
  const [isCollapsible, setIsCollapsible] = createSignal(!isDisabled && shouldInitiallyCollapse);
  const [isCollapsedUncontrolled, setIsCollapsedUncontrolled] = createSignal(isCollapsible());
  const isCollapsed = createMemo(() => isCollapsible() && (isCollapsedControlled ?? isCollapsedUncontrolled()));
  const shouldKeepExpandedHeightAuto = recalculationKey !== undefined;

  const setIsCollapsed = (newValue) => {
    const isNextCollapsed = typeof newValue === 'function' ? newValue(isCollapsed()) : newValue;
    if (isNextCollapsed === isCollapsed()) return;

    if (isCollapsedControlled === undefined) {
      setIsCollapsedUncontrolled(isNextCollapsed);
    }
    onCollapseChange?.(isNextCollapsed);
  };

  createMutationEffect(depsOf(() => [cutoutRef, isCollapsed(), isDisabled, ref, shouldKeepExpandedHeightAuto]), () => {
    const element = (cutoutRef || ref).current;
    const shouldUseStyleInExpand = !cutoutRef && !shouldKeepExpandedHeightAuto;

    if (!element || isFirstRenderRef) return;

    if (isDisabled) {
      element.style.maxHeight = '';
      return;
    }

    element.style.maxHeight = isCollapsed()
      ? `${cutoutHeightRef}px`
      : shouldUseStyleInExpand
        ? `${fullHeightRef}px`
        : ``;
  });

  const recalculateTextLines = () => {
    if (isDisabled || !ref.current) {
      return;
    }
    const element = ref.current;

    const { lineHeight, totalLines } = calcTextLineHeightAndCount(element);
    fullHeightRef = element.scrollHeight;
    if (totalLines - (ignoredLines || 0) > maxLinesBeforeCollapse) {
      cutoutHeightRef = lineHeight * maxLinesBeforeCollapse;
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

  createMutationEffect(depsOf(() => [cutoutRef, isCollapsed(), isDisabled, recalculateTextLines, ref, shouldKeepExpandedHeightAuto]), () => {
    if (!isDisabled && isFirstRenderRef) {
      requestForcedReflow(() => {
        recalculateTextLines();

        return () => {
          isFirstRenderRef = false;
          const element = (cutoutRef || ref).current;
          if (!element) return;
          element.style.maxHeight =
            isCollapsed() && cutoutHeightRef
              ? `${cutoutHeightRef}px`
              : shouldKeepExpandedHeightAuto
                ? ''
                : `${fullHeightRef}px`;
        };
      });
    }
  });

  createEffect(depsOf(() => [isDisabled, recalculateTextLines, recalculationKey]), () => {
    if (isDisabled || isFirstRenderRef || recalculationKey === undefined) return;

    requestMeasure(recalculateTextLines);
  });

  // Parent resize is triggered on every collapse/expand, so we do recalculation only on window resize to save resources
  const { width: windowWidth } = useWindowSize();
  createEffect(depsOf(() => [debouncedRecalcTextLines, isDisabled, windowWidth]), () => {
    if (!isDisabled) {
      if (isFirstRenderRef) return;

      debouncedRecalcTextLines();
    } else {
      setIsCollapsible(false);
      setIsCollapsedUncontrolled(false);
    }
  });

  return {
    isCollapsed: isCollapsed(),
    isCollapsible,
    setIsCollapsed,
  };
}
