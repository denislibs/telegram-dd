import useLastCallback from './useLastCallback';

type UseClickableOptions = {
  disabled?: boolean;
  role?: React.AriaRole;
  withA11y?: boolean;
  tabIndex?: number;
};

type ClickableProps<T extends HTMLElement> = Partial<
  Pick<React.HTMLAttributes<T>, 'onClick' | 'onKeyDown' | 'onKeyUp' | 'role' | 'tabIndex' | 'aria-disabled'>
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

// TODO(codemod): useClickable: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useClickable<T extends HTMLElement>(
  onPress?: (e: React.MouseEvent<T>) => void,
  { disabled, role = 'button', withA11y = true, tabIndex = 0 }: UseClickableOptions = {},
): ClickableProps<T> {
  let shouldHandleSyntheticClickRef = false;
  const withListeners = Boolean(onPress) && !disabled;

  const handlePress = (e: React.MouseEvent<T>) => {
    const nativeEvent = e.nativeEvent as (MouseEvent & { pointerId?: number }) | undefined;
    const isSyntheticClick = e.detail === 0 || nativeEvent?.pointerId === -1; // Some mouse clicks produce two events

    if (isSyntheticClick && !shouldHandleSyntheticClickRef) return;

    shouldHandleSyntheticClickRef = false;
    onPress?.(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<T>) => {
    // A key pressed on a nested button must press that button, not the element around it
    if (e.target !== e.currentTarget) return;

    if (e.key === 'Enter' && ROLES_WITH_ENTER_ACTIVATION.has(role)) {
      e.preventDefault();
      shouldHandleSyntheticClickRef = true;
      e.currentTarget.click();
      return;
    }

    if (e.key === ' ' && ROLES_WITH_SPACE_ACTIVATION.has(role)) {
      e.preventDefault();
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<T>) => {
    if (e.target !== e.currentTarget || e.key !== ' ' || !ROLES_WITH_SPACE_ACTIVATION.has(role)) return;

    e.preventDefault();
    shouldHandleSyntheticClickRef = true;
    e.currentTarget.click();
  };

  return {
    onClick: withListeners ? handlePress : undefined,
    onKeyDown: withListeners ? handleKeyDown : undefined,
    onKeyUp: withListeners ? handleKeyUp : undefined,
    role: onPress && withA11y ? role : undefined,
    tabIndex: onPress && withA11y ? (disabled ? -1 : tabIndex) : undefined,
    'aria-disabled': onPress && withA11y && disabled ? true : undefined,
  };
}
