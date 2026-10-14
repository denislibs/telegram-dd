import type { ChangeEvent } from 'react';
import { createMemo, createSignal, currentOrPrev } from 'frameact';
import { For } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import type { ApiPeer } from '../../api/types';
import type { IconName } from '../../types/icons';
import type { IRadioOption } from './CheckboxGroup';

import buildClassName from '../../util/buildClassName';
import { REM } from '../common/helpers/mediaDimensions';
import renderText from '../common/helpers/renderText';

import useLang from '../../hooks/useLang';

import Avatar from '../common/Avatar';
import Icon from '../common/icons/Icon';
import Button from './Button';
import Spinner from './Spinner';

import './Checkbox.scss';

type OwnProps = {
  id?: string;
  name?: string;
  value?: string;
  peer?: ApiPeer;
  label?: JSX.Element;
  labelText?: JSX.Element;
  subLabel?: string;
  checked?: boolean;
  rightIcon?: IconName;
  disabled?: boolean;
  tabIndex?: number;
  withIcon?: boolean;
  blocking?: boolean;
  permissionGroup?: boolean;
  isLoading?: boolean;
  withCheckedCallback?: boolean;
  onlyInput?: boolean;
  isRound?: boolean;
  className?: string;
  nestedCheckbox?: boolean;
  nestedCheckboxCount?: number | undefined;
  nestedOptionList?: IRadioOption[];
  leftElement?: JSX.Element;
  values?: string[];
  teactExperimentControlled?: boolean;
  onChange?: (e: ChangeEvent<HTMLInputElement>, nestedOptionList?: IRadioOption[]) => void;
  onCheck?: (isChecked: boolean) => void;
  onClickLabel?: (e: React.MouseEvent, value?: string) => void;
};
const AVATAR_SIZE = 1.25 * REM;

const Checkbox = (props: OwnProps) => {
  const lang = useLang();
  let labelRef!: HTMLLabelElement;
  let inputRef!: HTMLInputElement;
  const [showNested, setShowNested] = createSignal(false);
  const renderingPeer = currentOrPrev(() => props.peer, { skipUndefined: true });

  const handleChange = (event: ChangeEvent<HTMLInputElement>, childNestedOptionList?: IRadioOption[]) => {
    if (props.disabled) {
      return;
    }

    if (props.onChange) {
      const isOwnInput = event.target === inputRef;
      props.onChange(event, isOwnInput ? props.nestedOptionList : childNestedOptionList);
    }

    if (props.onCheck) {
      props.onCheck(event.currentTarget.checked);
    }
  };

  const toggleNested = () => {
    setShowNested(!showNested());
  };

  function handleClick(event: React.MouseEvent) {
    if (event.target !== labelRef) {
      props.onClickLabel?.(event, props.value);
    }
  }

  function handleInputClick(event: React.MouseEvent) {
    event.stopPropagation();
  }

  const labelClassName = createMemo(() =>
    buildClassName(
      'Checkbox',
      props.disabled && 'disabled',
      props.withIcon && 'withIcon',
      props.isLoading && 'loading',
      props.blocking && 'blocking',
      props.nestedCheckbox && 'nested',
      props.subLabel && 'withSubLabel',
      props.permissionGroup && 'permission-group',
      Boolean(props.leftElement) && 'avatar',
      props.onlyInput && 'onlyInput',
      props.isRound && 'round',
      Boolean(props.rightIcon) && 'withNestedList',
      props.className,
    ),
  );

  return (
    <>
      <label
        class={labelClassName()}
        dir={lang.isRtl ? 'rtl' : undefined}
        onClick={props.onClickLabel ? handleClick : undefined}
        ref={labelRef}
      >
        <input
          ref={inputRef}
          type="checkbox"
          id={props.id}
          name={props.name}
          use:value={() => props.value}
          use:checked={() => props.checked}
          disabled={props.disabled}
          tabIndex={props.tabIndex}
          onChange={handleChange}
          onClick={props.onClickLabel ? handleInputClick : undefined}
        />
        <div class={buildClassName('Checkbox-main', Boolean(props.leftElement) && 'Nested-avatar-list')}>
          <div class={buildClassName('user-avatar', renderingPeer() && 'user-avatar-visible')}>
            {renderingPeer() && <Avatar peer={renderingPeer()} size={AVATAR_SIZE} />}
          </div>
          <span class="label" dir="auto">
            {props.leftElement}
            {typeof props.label === 'string' ? renderText(props.label) : props.label}
            {Boolean(props.labelText) && <span class="ml-1">{renderText(props.labelText)}</span>}
          </span>
          {props.subLabel && (
            <span class="subLabel" dir="auto">
              {renderText(props.subLabel)}
            </span>
          )}
          {props.rightIcon && <Icon name={props.rightIcon} className="right-icon" />}
        </div>
        {props.nestedCheckbox && (
          <span class="nestedButton" dir="auto">
            <Button className="button" color="translucent" size="smaller" onClick={toggleNested}>
              <Icon name="group-filled" className="group-icon" />
              {props.nestedCheckboxCount}
              <Icon name={showNested() ? 'up' : 'down'} />
            </Button>
          </span>
        )}
        {props.isLoading && <Spinner />}
      </label>
      {props.nestedCheckbox && (
        <div class={buildClassName('nested-checkbox-group', showNested() && 'nested-checkbox-group-open')}>
          <For each={props.nestedOptionList} keyed={(nestedOption) => nestedOption.value}>
            {(nestedOption) => (
              <Checkbox
                leftElement={props.leftElement}
                onChange={handleChange}
                checked={props.values?.indexOf(nestedOption().value) !== -1}
                values={props.values}

                {...nestedOption()}
              />
            )}
          </For>
        </div>
      )}
    </>
  );
};

export default Checkbox;
