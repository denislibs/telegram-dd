import type { ChangeEvent } from 'react';
import { createEffect, createSignal, requestMeasure } from 'frameact';
import { mergeProps } from 'frameact/dom';

import { MIN_PASSWORD_LENGTH } from '../../config';
import { IS_TAURI } from '../../util/browser/globalEnvironment';
import { IS_TOUCH_ENV } from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';
import stopEvent from '../../util/stopEvent';

import useTimeout from '../../hooks/schedulers/useTimeout';
import useAppLayout from '../../hooks/useAppLayout';
import useLang from '../../hooks/useLang';

import Button from '../ui/Button';
import Icon from './icons/Icon';

type OwnProps = {
  className?: string;
  submitLabel?: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  description?: string;
  isLoading?: boolean;
  shouldDisablePasswordManager?: boolean;
  shouldShowSubmit?: boolean;
  shouldResetValue?: boolean;
  shouldOfferPasskey?: boolean;
  isPasswordVisible?: boolean;
  noRipple?: boolean;
  onClearError: NoneToVoidFunction;
  onChangePasswordVisibility: (state: boolean) => void;
  onInputChange?: (password: string) => void;
  onSubmit?: (password: string) => void;
};

const PasswordForm = (rawProps: OwnProps) => {
  const props = mergeProps(
    { isLoading: false, shouldDisablePasswordManager: false, noRipple: false },
    rawProps,
  ) as OwnProps & Required<Pick<OwnProps, 'isLoading' | 'shouldDisablePasswordManager' | 'noRipple'>>;
  let inputRef!: HTMLInputElement;

  const lang = useLang();

  const { isMobile } = useAppLayout();
  const [password, setPassword] = createSignal('');
  const [canSubmit, setCanSubmit] = createSignal(false);
  const focusDelayTimeoutMs = () => (isMobile() ? 550 : 400);

  createEffect(
    () => props.shouldResetValue,
    (shouldResetValue2) => {
      if (shouldResetValue2) {
        setPassword('');
        setCanSubmit(false);
      }
    },
  );

  useTimeout(() => {
    if (!IS_TOUCH_ENV) {
      inputRef.focus();
    }
  }, focusDelayTimeoutMs);

  createEffect(
    () => props.error,
    (error2) => {
      if (error2) {
        // Deviation: `focus()`/`select()` are layout reads for stricterdom, so the task is a measure task (tt: requestMutation).
        requestMeasure(() => {
          inputRef.focus();
          inputRef.select();
        });
      }
    },
  );

  function onPasswordChange(e: ChangeEvent<HTMLInputElement>) {
    if (props.error) {
      props.onClearError();
    }

    const { target } = e;
    setPassword(target.value);
    setCanSubmit(target.value.length >= MIN_PASSWORD_LENGTH);
    if (props.onInputChange) {
      props.onInputChange(target.value);
    }
  }

  function togglePasswordVisibility() {
    props.onChangePasswordVisibility(!props.isPasswordVisible);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (props.isLoading) {
      return;
    }

    if (canSubmit()) {
      props.onSubmit!(password());
    }
  }

  function renderFakeInput() {
    return <input type="password" id="prevent_autofill" autocomplete="off" class="visually-hidden" tabIndex={-2} />;
  }

  return (
    <form
      class={props.className}
      action=""
      onSubmit={(e) => (props.onSubmit ? handleSubmit(e) : stopEvent(e))}
      autocomplete="off"
    >
      <div
        class={buildClassName('input-group password-input', password() && 'touched', props.error && 'error')}
        dir={lang.isRtl ? 'rtl' : undefined}
      >
        {props.shouldDisablePasswordManager && renderFakeInput()}
        <input
          ref={inputRef}
          class="form-control"
          type={props.isPasswordVisible ? 'text' : 'password'}
          id="sign-in-password"
          use:value={() => password() || ''}
          autocomplete={
            props.shouldOfferPasskey
              ? 'one-time-code webauthn'
              : props.shouldDisablePasswordManager
                ? 'one-time-code'
                : 'current-password'
          }
          spellcheck={IS_TAURI ? false : undefined}
          onInput={onPasswordChange}
          maxLength={256}
          dir="auto"
        />
        <label>{props.error || props.hint || props.placeholder || lang('PasswordFormPlaceholder')}</label>
        <div
          class="div-button toggle-password"
          onClick={togglePasswordVisibility}
          role="button"
          tabIndex={0}
          title={lang('AriaPasswordToggle')}
          aria-label={lang('AriaPasswordToggle')}
        >
          <Icon name={props.isPasswordVisible ? 'eye' : 'eye-crossed'} />
        </div>
      </div>
      {props.description && <p class="description">{props.description}</p>}
      {props.onSubmit && (canSubmit() || props.shouldShowSubmit) && (
        <Button type="submit" ripple={!props.noRipple} isLoading={props.isLoading} disabled={!canSubmit()}>
          {props.submitLabel || lang('PasswordFormSubmit')}
        </Button>
      )}
    </form>
  );
};

export default PasswordForm;
