import type { ChangeEvent } from 'react';
import { For } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import type { ApiPeer } from '../../api/types';

import buildClassName from '../../util/buildClassName';
import { unique } from '../../util/iteratees';

import Checkbox from './Checkbox';

export type IRadioOption = {
  label: JSX.Element;
  subLabel?: string;
  disabled?: boolean;
  value: string;
  nestedOptions?: IRadioOption[];
  peer?: ApiPeer;
};

type OwnProps = {
  id?: string;
  options: IRadioOption[];
  selected: string[];
  disabled?: boolean;
  nestedCheckbox?: boolean;
  loadingOptions?: string[];
  isRound?: boolean;
  onChange: (value: string[]) => void;
  onClickLabel?: (e: React.MouseEvent, value?: string) => void;
  className?: string;
};

const CheckboxGroup = (props: OwnProps) => {
  const handleChange = (event: ChangeEvent<HTMLInputElement>, nestedOptionList?: IRadioOption[]) => {
    const { value, checked } = event.currentTarget;
    let newValues: string[];

    if (checked) {
      newValues = unique([...props.selected, value]);
      nestedOptionList?.forEach((nestedOption) => {
        if (!newValues.includes(nestedOption.value)) {
          newValues.push(nestedOption.value);
        }
      });
    } else {
      newValues = props.selected.filter((v) => v !== value);
      if (nestedOptionList) {
        newValues = newValues.filter((v) => !nestedOptionList.some((nestedOption) => nestedOption.value === v));
      }
    }
    props.onChange(newValues);
  };
  const getCheckedNestedCount = (nestedOptions: IRadioOption[]) => {
    const checkedCount = nestedOptions?.filter((nestedOption) => props.selected.includes(nestedOption.value)).length;
    return checkedCount > 0 ? checkedCount : nestedOptions.length;
  };

  return (
    <div id={props.id} class={buildClassName('radio-group', props.className)}>
      <For each={props.options}>
        {(option) => {
          const isParentChecked = option.nestedOptions?.length
            ? option.nestedOptions.some((nestedOption) => props.selected?.includes(nestedOption.value))
            : props.selected?.indexOf(option.value) !== -1;

          return (
            <Checkbox
              label={option.label}
              subLabel={option.subLabel}
              value={option.value}
              peer={option.peer}
              checked={isParentChecked}
              disabled={option.disabled || props.disabled}
              isLoading={props.loadingOptions ? props.loadingOptions.indexOf(option.value) !== -1 : undefined}
              onChange={handleChange}
              onClickLabel={props.onClickLabel}
              nestedCheckbox={props.nestedCheckbox}
              nestedCheckboxCount={getCheckedNestedCount(option.nestedOptions ?? [])}
              nestedOptionList={option.nestedOptions}
              values={props.selected}
              isRound={props.isRound}
            />
          );
        }}
      </For>
    </div>
  );
};

export default CheckboxGroup;
