import type { ChangeEvent, FormEvent } from 'react';
import { createMemo } from 'frameact';
import { mergeProps } from 'frameact/dom';

import { IS_TAURI } from '../../util/browser/globalEnvironment';
import buildClassName from '../../util/buildClassName';

import useLang from '../../hooks/useLang';

import AnimatedCounter from '../common/AnimatedCounter';

type OwnProps = {
  ref?: (el: HTMLInputElement) => void;
  id?: string;
  className?: string;
  value?: string;
  label?: string;
  error?: string;
  success?: string;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
  hasLengthIndicator?: boolean;
  maxLengthIndicator?: string;
  tabIndex?: number;
  title?: string;
  autoFocus?: boolean;
  teactExperimentControlled?: boolean;
  noMargin?: boolean;
  inputMode?: 'text' | 'none' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onInput?: (e: FormEvent<HTMLInputElement>) => void;
  onKeyPress?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLInputElement>) => void;
};

const InputText = (rawProps: OwnProps) => {
  const props = mergeProps({ autoComplete: 'off' }, rawProps) as OwnProps & Required<Pick<OwnProps, 'autoComplete'>>;
  const lang = useLang();
  const labelText = createMemo(() => props.error || props.success || props.label);
  const fullClassName = createMemo(() =>
    buildClassName(
      'input-group',
      props.value && 'touched',
      props.error ? 'error' : props.success && 'success',
      props.disabled && 'disabled',
      props.readOnly && 'disabled',
      labelText() && 'with-label',
      props.noMargin && 'no-margin',
      props.className,
    ),
  );

  return (
    <div class={fullClassName()} dir={lang.isRtl ? 'rtl' : undefined}>
      <input
        ref={props.ref}
        class="form-control"
        type="text"
        id={props.id}
        dir="auto"
        use:value={() => props.value || ''}
        tabIndex={props.tabIndex}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        autoComplete={props.autoComplete}
        spellCheck={IS_TAURI ? false : undefined}
        inputMode={props.inputMode}
        disabled={props.disabled}
        readOnly={props.readOnly}
        onChange={props.onChange}
        onInput={props.onInput}
        onKeyPress={props.onKeyPress}
        onKeyDown={props.onKeyDown}
        onBlur={props.onBlur}
        onPaste={props.onPaste}
        aria-label={labelText()}
        title={props.title}
        onClick={props.onClick}
        autoFocus={props.autoFocus}
      />
      {labelText() && <label htmlFor={props.id}>{labelText()}</label>}
      {(props.maxLengthIndicator || (props.hasLengthIndicator && props.maxLength !== undefined)) && (
        <div class="max-length-indicator">
          <AnimatedCounter
            text={props.maxLengthIndicator || Math.max(0, props.maxLength! - (props.value || '').length).toString()}
          />
        </div>
      )}
    </div>
  );
};

export default InputText;
