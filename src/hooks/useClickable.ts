import type { Accessor } from 'frameact';
import type { JSX } from 'frameact/jsx-runtime';

import type { MaybeAccessor } from '../util/accessors';

import { read } from '../util/accessors';

type UseClickableOptions = {
  disabled?: MaybeAccessor<boolean | undefined>;
  role?: MaybeAccessor<React.AriaRole>;
  withA11y?: MaybeAccessor<boolean>;
  tabIndex?: MaybeAccessor<number>;
};

// Deviation: `React.HTMLAttributes` -> the JSX attributes of the runtime. The result is an object with getters (spread
// it onto an element: the spread reads every getter in a tracked pass) so that a change of `onPress` / the options
// reaches the element.
type ClickableProps<T extends HTMLElement> = Partial<
  Pick<JSX.HTMLAttributes<T>, 'onClick' | 'onKeyDown' | 'onKeyUp' | 'role' | 'tabIndex' | 'aria-disabled'>
>;

// WAI-ARIA keyboard activation patterns per role
const ROLES_WITH_ENTER_ACTIVATION = new Set<React.AriaRole>([
  'button',
  'link',
  'menuitem',
  'switch',
  'tab',
  'treeitem',
]);

const ROLES_WITH_SPACE_ACTIVATION = new Set<React.AriaRole>([
  'button',
  'switch',
  'checkbox',
  'radio',
  'option',
  'tab',
  'treeitem',
]);

// Deviation: `onPress` is an accessor of the handler (the handler and its presence can change); the options are
// `MaybeAccessor`s.
export default function useClickable<T extends HTMLElement>(
  onPress: Accessor<((e: React.MouseEvent<T>) => void) | undefined>,
  options: UseClickableOptions = {},
): ClickableProps<T> {
  let shouldHandleSyntheticClick = false;

  const isDisabled = () => read(options.disabled);
  const getRole = () => read(options.role) ?? 'button';
  const withA11y = () => read(options.withA11y) ?? true;
  const withListeners = () => Boolean(onPress()) && !isDisabled();

  const handlePress = (e: React.MouseEvent<T>) => {
    // Deviation: the runtime delivers the native event (tt reads `e.nativeEvent`).
    const isSyntheticClick = e.detail === 0 || (e as MouseEvent & { pointerId?: number }).pointerId === -1; // Some mouse clicks produce two events

    if (isSyntheticClick && !shouldHandleSyntheticClick) return;

    shouldHandleSyntheticClick = false;
    onPress()?.(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<T>) => {
    // A key pressed on a nested button must press that button, not the element around it
    if (e.target !== e.currentTarget) return;

    if (e.key === 'Enter' && ROLES_WITH_ENTER_ACTIVATION.has(getRole())) {
      e.preventDefault();
      shouldHandleSyntheticClick = true;
      e.currentTarget.click();
      return;
    }

    if (e.key === ' ' && ROLES_WITH_SPACE_ACTIVATION.has(getRole())) {
      e.preventDefault();
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<T>) => {
    if (e.target !== e.currentTarget || e.key !== ' ' || !ROLES_WITH_SPACE_ACTIVATION.has(getRole())) return;

    e.preventDefault();
    shouldHandleSyntheticClick = true;
    e.currentTarget.click();
  };

  return {
    get onClick() {
      return withListeners() ? handlePress : undefined;
    },
    get onKeyDown() {
      return withListeners() ? handleKeyDown : undefined;
    },
    get onKeyUp() {
      return withListeners() ? handleKeyUp : undefined;
    },
    get role() {
      return onPress() && withA11y() ? getRole() : undefined;
    },
    get tabIndex() {
      return onPress() && withA11y() ? (isDisabled() ? -1 : (read(options.tabIndex) ?? 0)) : undefined;
    },
    get 'aria-disabled'() {
      // Deviation: a string (frameact writes `aria-*={true}` as an empty attribute).
      return onPress() && withA11y() && isDisabled() ? 'true' : undefined;
    },
  };
}
