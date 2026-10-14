import { createMeasureEffect, createSignal, requestMeasure, requestMutation } from 'frameact';

import useLastCallback from './useLastCallback';

// TODO(codemod): useKeyboardListNavigation: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
const useKeyboardListNavigation = (
  elementRef: (el: HTMLElement) => void,
  isOpen: boolean,
  onSelectWithEnter?: (index: number) => void,
  itemSelector?: string,
  noCaptureFocus?: boolean,
) => {
  const [focusedIndex, setFocusedIndex] = createSignal(-1);

  createMeasureEffect(
    () => [elementRef, isOpen, noCaptureFocus],
    () => {
      setFocusedIndex(-1);

      const element = elementRef.current;
      if (isOpen && element && !noCaptureFocus) {
        requestMutation(() => {
          element.tabIndex = -1;
        });
        requestMeasure(() => element.focus());
      }
    },
  );

  return (e: React.KeyboardEvent<any>) => {
    const element = elementRef.current;

    if (!element || !isOpen) {
      return;
    }

    if (e.keyCode === 13 && onSelectWithEnter) {
      onSelectWithEnter(focusedIndex());
      return;
    }

    if (e.keyCode !== 38 && e.keyCode !== 40) {
      return;
    }

    e.preventDefault();

    const focusedElement = document.activeElement;
    const elementChildren = Array.from(itemSelector ? element.querySelectorAll(itemSelector) : element.children);

    const activeIndex = focusedElement ? elementChildren.indexOf(focusedElement) : -1;
    let newIndex = activeIndex >= 0 ? activeIndex : focusedIndex();

    if (e.keyCode === 38 && newIndex > 0) {
      newIndex--;
    } else if (e.keyCode === 40 && newIndex < elementChildren.length - 1) {
      newIndex++;
    } else if (elementChildren.length === 1) {
      newIndex = 0;
    } else {
      return;
    }

    const item = elementChildren[newIndex] as HTMLElement;
    if (item) {
      setFocusedIndex(newIndex);
      item.focus({ preventScroll: true });
      item.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    }
  };
};

export default useKeyboardListNavigation;
