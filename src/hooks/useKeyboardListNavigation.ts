import { createMeasureEffect, createSignal, requestMeasure, requestMutation } from 'frameact';

import { type MaybeAccessor, read } from '../util/accessors';
import { depsOf } from '../util/effectDeps';

const useKeyboardListNavigation = (
  elementRef: MaybeAccessor<HTMLElement | undefined>,
  isOpen: MaybeAccessor<boolean>,
  onSelectWithEnter?: (index: number) => void,
  itemSelector?: string,
  noCaptureFocus?: MaybeAccessor<boolean | undefined>,
) => {
  const [focusedIndex, setFocusedIndex] = createSignal(-1);

  createMeasureEffect(
    depsOf(() => [read(isOpen), read(noCaptureFocus)] as const),
    ([isOpen2, noCaptureFocus2]) => {
      setFocusedIndex(-1);

      const element = read(elementRef);
      if (isOpen2 && element && !noCaptureFocus2) {
        requestMutation(() => {
          element.tabIndex = -1;
        });
        requestMeasure(() => element.focus());
      }
    },
  );

  return (e: React.KeyboardEvent<any>) => {
    const element = read(elementRef);

    if (!element || !read(isOpen)) {
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
