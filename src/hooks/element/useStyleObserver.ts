import { createEffect, createMutationEffect, createSignal } from 'frameact';

import useLastCallback from '../useLastCallback';
import useResizeObserver from '../useResizeObserver';

const UPDATE_DEBOUNCE = 50; // ms

/**
 * @param property animateable property
 */
// TODO(codemod): useStyleObserver: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useStyleObserver(
  ref: (el: HTMLElement) => void,
  property: string,
  debounce = UPDATE_DEBOUNCE,
  isDisabled?: boolean,
) {
  const [value, setValue] = createSignal<string | undefined>(undefined);

  const updateValue = () => {
    if (!ref.current || isDisabled) {
      setValue(undefined);
      return;
    }

    const computedValue = getComputedStyle(ref.current).getPropertyValue(property).trim();
    setValue(computedValue);
  };

  // Element does not receive `transitionend` event if parent has `display: none`.
  // We will receive `resize` event when parent is shown again.
  useResizeObserver(ref, updateValue, isDisabled);

  createMutationEffect(
    () => [debounce, isDisabled, property, ref],
    () => {
      const el = ref.current;
      if (!el || isDisabled) {
        return undefined;
      }

      el.style.setProperty('transition', `${debounce}ms ${property} linear`, 'important');

      return () => {
        el.style.removeProperty('transition');
      };
    },
  );

  createEffect(
    () => [isDisabled, property, ref, updateValue],
    () => {
      const el = ref.current;
      if (!el) {
        return undefined;
      }

      updateValue();

      if (isDisabled) {
        return undefined;
      }

      function handleTransitionEnd(e: TransitionEvent) {
        if (e.propertyName !== property) return;
        updateValue();
      }

      el.addEventListener('transitionend', handleTransitionEnd);

      return () => {
        el.removeEventListener('transitionend', handleTransitionEnd);
      };
    },
  );

  return value;
}
