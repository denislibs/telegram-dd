import { createMemo } from 'frameact';
import { mergeProps } from 'frameact/dom';

import buildClassName from '../../util/buildClassName';

import './Switcher.scss';

type OwnProps = {
  id?: string;
  name?: string;
  value?: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
  inactive?: boolean;
  noAnimation?: boolean;
  onCheck?: (isChecked: boolean) => void;
};

const Switcher = (rawProps: OwnProps) => {
  const props = mergeProps({ checked: false }, rawProps) as OwnProps & Required<Pick<OwnProps, 'checked'>>;
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    props.onCheck?.(e.currentTarget.checked);
  };

  const className = createMemo(() =>
    buildClassName(
      'Switcher',
      props.disabled && 'disabled',
      props.inactive && 'inactive',
      props.noAnimation && 'no-animation',
    ),
  );

  return (
    <label class={className()} title={props.label}>
      <input
        type="checkbox"
        id={props.id}
        name={props.name}
        // Deviation: `value` of a native input is `use:value` (as in Checkbox); undefined is the empty string.
        use:value={() => props.value}
        use:checked={() => props.checked}
        disabled={props.disabled}
        onInput={handleChange}
      />
      <span class="widget" />
    </label>
  );
};

export default Switcher;
