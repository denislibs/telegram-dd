import { createSignal } from 'frameact';
import { getActions, withGlobal } from '../../global';

import type { GlobalState } from '../../global/types';

import { pick } from '../../util/iteratees';

import useLang from '../../hooks/useLang';

import PasswordForm from '../common/PasswordForm';
import MonkeyPassword from '../common/PasswordMonkey';

type StateProps = {
  auth: GlobalState['auth'];
};

const AuthPassword = () => {
  const props = withGlobal({}, mapStateToProps);
  const { setAuthPassword, clearAuthErrorKey } = getActions();
  const isLoading = () => props.auth.isLoading;
  const errorKey = () => props.auth.errorKey;
  const hint = () => props.auth.hint;

  const lang = useLang();
  const [showPassword, setShowPassword] = createSignal(false);

  const handleChangePasswordVisibility = (isVisible: boolean) => {
    setShowPassword(isVisible);
  };

  const handleSubmit = (password: string) => {
    setAuthPassword({ password });
  };

  return (
    <div id="auth-password-form" class="custom-scroll">
      <div class="auth-form">
        <MonkeyPassword isPasswordVisible={showPassword()} />
        <h1>{lang('LoginHeaderPassword')}</h1>
        <p class="note">{lang('LoginEnterPasswordDescription')}</p>
        <PasswordForm
          onClearError={clearAuthErrorKey}
          error={errorKey() && lang.withRegular(errorKey()!)}
          hint={hint()}
          isLoading={isLoading()}
          isPasswordVisible={showPassword()}
          onChangePasswordVisibility={handleChangePasswordVisibility}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => pick(global, ['auth']);

export default AuthPassword;
