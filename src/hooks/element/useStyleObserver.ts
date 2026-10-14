import { createEffect, createMeasureEffect, createSignal, frameMutation } from 'frameact';

import { type MaybeAccessor, read } from '../../util/accessors';
import useResizeObserver from '../useResizeObserver';

const UPDATE_DEBOUNCE = 50; // ms

/**
 * @param property animateable property
 */
// Deviation: the transition style is applied in the mutate phase (a mutation effect would apply before the ref is set).
export default function useStyleObserver(
  ref: MaybeAccessor<HTMLElement | undefined>,
  property: MaybeAccessor<string>,
  debounce: MaybeAccessor<number> = UPDATE_DEBOUNCE,
  isDisabled?: MaybeAccessor<boolean | undefined>,
) {
  const [value, setValue] = createSignal<string | undefined>(undefined);

  const updateValue = () => {
    const el = read(ref);
    if (!el || read(isDisabled)) {
      setValue(undefined);
      return;
    }

    const computedValue = getComputedStyle(el).getPropertyValue(read(property)).trim();
    setValue(computedValue);
  };

  // Element does not receive `transitionend` event if parent has `display: none`.
  // We will receive `resize` event when parent is shown again.
  useResizeObserver(ref, updateValue, isDisabled);

  createEffect(
    () => [read(debounce), read(isDisabled), read(property)] as const,
    ([debounce2, isDisabled2, property2]) => {
      const el = read(ref);
      if (!el || isDisabled2) {
        return undefined;
      }

      el.style.setProperty('transition', `${debounce2}ms ${property2} linear`, 'important');

      return () => {
        el.style.removeProperty('transition');
      };
    },
    frameMutation,
  );

  createMeasureEffect(
    () => [read(isDisabled), read(property)] as const,
    ([isDisabled2, property2]) => {
      const el = read(ref);
      if (!el) {
        return undefined;
      }

      updateValue();

      if (isDisabled2) {
        return undefined;
      }

      function handleTransitionEnd(e: TransitionEvent) {
        if (e.propertyName !== property2) return;
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
