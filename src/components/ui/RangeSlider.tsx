import type { ChangeEvent } from 'react';
import { createMemo } from 'frameact';
import { For, mergeProps } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import buildClassName from '../../util/buildClassName';

import useLang from '../../hooks/useLang';

import './RangeSlider.scss';

type OwnProps = {
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  value: number;
  disabled?: boolean;
  readOnly?: boolean;
  bold?: boolean;
  className?: string;
  renderValue?: (value: number) => JSX.Element;
  onChange: (value: number) => void;
  isCenteredLayout?: boolean;
};

const RangeSlider = (rawProps: OwnProps) => {
  const props = mergeProps(
    {
      min: 0,
      get max() {
        return props.options ? props.options.length - 1 : 100;
      },
      step: 1,
    },
    rawProps,
  ) as OwnProps & Required<Pick<OwnProps, 'min' | 'max' | 'step'>>;
  const lang = useLang();
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    props.onChange(Number(event.currentTarget.value));
  };

  const mainClassName = createMemo(() =>
    buildClassName(
      props.className,
      'RangeSlider',
      props.disabled && 'disabled',
      props.readOnly && 'readOnly',
      props.bold && 'bold',
    ),
  );

  const trackWidth = createMemo(() => {
    if (props.options) {
      return (props.value / (props.options.length - 1)) * 100;
    } else {
      const possibleValuesLength = (props.max - props.min) / props.step;
      return ((props.value - props.min) / possibleValuesLength) * 100;
    }
  });

  function renderTopRow() {
    if (props.isCenteredLayout) {
      return (
        <div class="slider-top-row" dir={lang.isRtl ? 'rtl' : undefined}>
          {!props.options && (
            <>
              <span class="value-min" dir="auto">
                {props.min}
              </span>
              <span class="label" dir="auto">
                {props.renderValue ? props.renderValue(props.value) : props.value}
              </span>
              <span class="value-max" dir="auto">
                {props.max}
              </span>
            </>
          )}
        </div>
      );
    }

    if (!props.label) {
      return undefined;
    }

    return (
      <div class="slider-top-row" dir={lang.isRtl ? 'rtl' : undefined}>
        <span class="label" dir="auto">
          {props.label}
        </span>
        {!props.options && (
          <span class="value" dir="auto">
            {props.renderValue ? props.renderValue(props.value) : props.value}
          </span>
        )}
      </div>
    );
  }

  return (
    <div class={mainClassName()}>
      {renderTopRow()}
      <div class="slider-main">
        <div class="slider-fill-track" style={`width: ${trackWidth()}%`} />
        <input
          min={props.min}
          max={props.max}
          use:value={() => props.value}
          step={props.step}
          type="range"
          class="RangeSlider__input"
          onInput={handleChange}
        />
        {props.options && (
          <div class="slider-options">
            <For each={props.options}>
              {(option, index) => (
                <div
                  class={buildClassName('slider-option', index() === props.value && 'active')}
                  onClick={() => props.onChange(index())}
                >
                  {option}
                </div>
              )}
            </For>
          </div>
        )}
      </div>
    </div>
  );
};

export default RangeSlider;
