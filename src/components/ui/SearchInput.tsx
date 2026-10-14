import type { MouseEvent as ReactMouseEvent } from 'react';
import { createMeasureEffect, untrack } from 'frameact';
import { mergeProps } from 'frameact/dom';

import { IS_TAURI } from '../../util/browser/globalEnvironment';
import buildClassName from '../../util/buildClassName';
import { depsOf } from '../../util/effectDeps';

import useFlag from '../../hooks/useFlag';
import useInputFocusOnOpen from '../../hooks/useInputFocusOnOpen';
import useLang from '../../hooks/useLang';
import useOldLang from '../../hooks/useOldLang';

import Icon from '../common/icons/Icon';
import Button from './Button';
import Loading from './Loading';
import Transition from './Transition';

import './SearchInput.scss';

type OwnProps = {
  ref?: (el: HTMLInputElement) => void;
  children?: React.ReactNode;
  resultsItemSelector?: string;
  className?: string;
  inputId?: string;
  value?: string;
  focused?: boolean;
  isLoading?: boolean;
  spinnerColor?: 'yellow';
  spinnerBackgroundColor?: 'light';
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
  canClose?: boolean;
  autoFocusSearch?: boolean;
  hasUpButton?: boolean;
  hasDownButton?: boolean;
  teactExperimentControlled?: boolean;
  withBackIcon?: boolean;
  variant?: 'island';
  onChange: (value: string) => void;
  onStartBackspace?: NoneToVoidFunction;
  onReset?: NoneToVoidFunction;
  onFocus?: NoneToVoidFunction;
  onBlur?: NoneToVoidFunction;
  onClick?: (e: ReactMouseEvent<HTMLDivElement, MouseEvent>) => void;
  onUpClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDownClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onSpinnerClick?: NoneToVoidFunction;
  onEnter?: NoneToVoidFunction;
};

// Deviation: both <Transition>s render by `slide.key` (framework guide section 6): the left one has the search icon on
// key 1 and the back icon / the spinner on key 0; the right one has the spinner on key 1 when `withBackIcon`, else
// the close button.
const SearchInput = (rawProps: OwnProps) => {
  const props = mergeProps({ isLoading: false }, rawProps) as OwnProps & Required<Pick<OwnProps, 'isLoading'>>;
  let inputRef!: HTMLInputElement;

  const [isInputFocused, markInputFocused, unmarkInputFocused] = useFlag(untrack(() => props.focused)); // the initial value only, as in tt

  useInputFocusOnOpen(
    () => inputRef,
    () => props.autoFocusSearch,
    unmarkInputFocused,
  );

  createMeasureEffect(
    depsOf(() => [props.focused, props.placeholder] as const),
    ([focused2]) => {
      if (!inputRef) {
        return;
      }

      if (focused2) {
        inputRef.focus();
      } else {
        inputRef.blur();
      }
    },
  ); // Trick for setting focus when selecting a contact to search for

  const oldLang = useOldLang();
  const lang = useLang();

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { currentTarget } = event;
    props.onChange(currentTarget.value);

    if (!isInputFocused()) {
      handleFocus();
    }
  }

  function handleFocus() {
    markInputFocused();
    props.onFocus?.();
  }

  function handleBlur() {
    unmarkInputFocused();
    props.onBlur?.();
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (props.onEnter) {
        e.preventDefault();
        props.onEnter();
        return;
      }

      if (props.resultsItemSelector) {
        const element = document.querySelector(props.resultsItemSelector) as HTMLElement;
        if (element) {
          element.focus();
        }
      }
    }

    if (props.resultsItemSelector && e.key === 'ArrowDown') {
      const element = document.querySelector(props.resultsItemSelector) as HTMLElement;
      if (element) {
        element.focus();
      }
    }

    if (e.key === 'Backspace' && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
      props.onStartBackspace?.();
    }
  };

  return (
    <div
      class={buildClassName('SearchInput', props.className, props.variant, isInputFocused() && 'has-focus')}
      onClick={(e) => props.onClick?.(e)}
      dir={lang.isRtl ? 'rtl' : undefined}
    >
      <Transition
        name="fade"
        shouldCleanup
        activeKey={Number(!props.isLoading && !props.withBackIcon)}
        className="icon-container-left"
        slideClassName="icon-container-slide"
      >
        {(slide) =>
          slide.key === 1 ? (
            <Icon name="search" className="search-icon" />
          ) : (
            <>
              {props.withBackIcon ? (
                <Icon name="arrow-left" className="back-icon" onClick={props.onReset} />
              ) : (
                <Loading
                  color={props.spinnerColor}
                  backgroundColor={props.spinnerBackgroundColor}
                  onClick={props.onSpinnerClick}
                />
              )}
            </>
          )
        }
      </Transition>
      <div>{props.children}</div>
      <input
        ref={(el) => {
          inputRef = el;
          props.ref?.(el);
        }}
        id={props.inputId}
        type="text"
        dir="auto"
        placeholder={props.placeholder || oldLang('Search')}
        class="form-control"
        use:value={() => props.value ?? ''}
        disabled={props.disabled}
        autocomplete={props.autoComplete}
        spellcheck={IS_TAURI ? false : undefined}
        onInput={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {props.hasUpButton && (
        <Button
          round
          size="tiny"
          color="translucent"
          iconName="up"
          onClick={props.onUpClick}
          disabled={!props.onUpClick}
          ariaLabel={lang('AriaSearchOlderResult')}
        />
      )}
      {props.hasDownButton && (
        <Button
          round
          size="tiny"
          color="translucent"
          iconName="down"
          onClick={props.onDownClick}
          disabled={!props.onDownClick}
          ariaLabel={lang('AriaSearchNewerResult')}
        />
      )}
      <Transition
        name="fade"
        shouldCleanup
        activeKey={Number(props.isLoading)}
        className="icon-container-right"
        slideClassName="icon-container-slide"
      >
        {(slide) => (
          <>
            {slide.key === 1 && props.withBackIcon ? (
              <Loading
                color={props.spinnerColor}
                backgroundColor={props.spinnerBackgroundColor}
                onClick={props.onSpinnerClick}
              />
            ) : (
              (props.value || props.canClose) &&
              props.onReset && <Button round size="tiny" color="translucent" iconName="close" onClick={props.onReset} />
            )}
          </>
        )}
      </Transition>
    </div>
  );
};

export default SearchInput;
