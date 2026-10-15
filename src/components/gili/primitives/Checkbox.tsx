import { createMemo, createMutationEffect } from 'frameact';
import { splitProps } from 'frameact/dom';

import buildClassName from '../../../util/buildClassName';

import { useControlContext } from '../layout/Control';
import { useInteractiveContext } from '../layout/Interactive';

import styles from './Checkbox.module.scss';

type InputProps = React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>;

type OwnProps = {
  checked?: boolean;
  disabled?: boolean;
  isRound?: boolean;
  indeterminate?: boolean;
  isInvalid?: boolean;
  nonInteractive?: boolean;
  className?: string;
  onChange?: (checked: boolean) => void;
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
  let ref!: HTMLInputElement;

  const resolvedId = createMemo(() => props.id ?? control?.id);
  const isDisabled = createMemo(() => props.disabled || interactive?.isDisabled || interactive?.isLoading);
  const isNonInteractive = createMemo(() => props.nonInteractive);

  createMutationEffect(
    () => props.indeterminate,
    (indeterminate2) => {
      if (!ref) return;
      ref.indeterminate = Boolean(indeterminate2);
    },
  );

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

  if (interactive?.isLoading) return undefined;

  return (
    <input
      {...restProps}
      ref={ref}
      type="checkbox"
      id={resolvedId()}
      use:checked={() => props.checked}
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
      aria-disabled={isNonInteractive() || undefined}
      onClick={handleClick}
      onInput={handleChange}
    />
  );
};

export default Checkbox;
