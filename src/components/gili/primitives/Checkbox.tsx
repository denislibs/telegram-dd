import { createMemo } from 'frameact';
import { Show, splitProps } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import buildClassName from '../../../util/buildClassName';

import { useControlContext } from '../layout/Control';
import { useInteractiveContext } from '../layout/Interactive';

import styles from './Checkbox.module.scss';

// Deviation: `React.DetailedHTMLProps<React.InputHTMLAttributes<...>>` -> the JSX attributes of the runtime; `class` is
// not an own prop (`className` is).
type InputProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'class' | 'children'>;

type OwnProps = {
  checked?: boolean;
  disabled?: boolean;
  isRound?: boolean;
  indeterminate?: boolean;
  isInvalid?: boolean;
  nonInteractive?: boolean;
  className?: string;
  onChange?: (checked: boolean) => void;
  onClick?: (e: React.MouseEvent<HTMLInputElement>) => void;
};

type Props = OwnProps & Omit<InputProps, keyof OwnProps | 'type'>;

const Checkbox = (props: Props) => {
  const [, restProps] = splitProps(props, [
    'checked',
    'disabled',
    'isRound',
    'indeterminate',
    'isInvalid',
    'nonInteractive',
    'className',
    'onChange',
    'onClick',
    'id',
    'tabIndex',
  ]);
  const control = useControlContext();
  const interactive = useInteractiveContext();

  const resolvedId = createMemo(() => props.id ?? control?.id);
  const isDisabled = createMemo(() => props.disabled || interactive?.isDisabled || interactive?.isLoading);
  const isNonInteractive = createMemo(() => props.nonInteractive);

  const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    if (isNonInteractive()) {
      e.preventDefault();
      return;
    }

    props.onClick?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isNonInteractive()) return;

    props.onChange?.(e.currentTarget.checked);
  };

  // Deviation: tt returned `undefined` while loading; the body runs once, so the input is behind a `<Show>`.
  return (
    <Show when={!interactive?.isLoading}>
      <input
        {...restProps}
        type="checkbox"
        id={resolvedId()}
        // A spread (`restProps`) makes the compiler wrap this attribute in an effect: it takes a value there, not an accessor.
        use:checked={props.checked}
        // Deviation: tt set `indeterminate` from a layout effect through a ref.
        prop:indeterminate={Boolean(props.indeterminate)}
        disabled={isDisabled()}
        class={buildClassName(
          styles.root,
          control?.inputClassName,
          props.isInvalid && styles.invalid,
          props.isRound && styles.round,
          isNonInteractive() && styles.nonInteractive,
          props.className,
        )}
        tabIndex={isNonInteractive() ? -1 : props.tabIndex}
        // Deviation: frameact writes `aria-*={true}` as an empty attribute, which assistive technology ignores: a string.
        aria-disabled={isNonInteractive() ? 'true' : undefined}
        onClick={handleClick}
        // Deviation: `onChange` is `onInput` (teact fires it on every input event).
        onInput={handleChange}
      />
    </Show>
  );
};

export default Checkbox;
