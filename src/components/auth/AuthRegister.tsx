import { createSignal } from 'frameact';
import { getActions, withGlobal } from '../../global';

import type { GlobalState } from '../../global/types';

import { pick } from '../../util/iteratees';

import useLang from '../../hooks/useLang';

import AvatarEditable from '../ui/AvatarEditable';
import Button from '../ui/Button';
import InputText from '../ui/InputText';

type StateProps = {
  auth: GlobalState['auth'];
};

const AuthRegister = () => {
  const props = withGlobal({}, mapStateToProps);
  const { signUp, clearAuthErrorKey, uploadProfilePhoto } = getActions();
  const isLoading = () => props.auth.isLoading;
  const errorKey = () => props.auth.errorKey;

  const lang = useLang();
  const [isButtonShown, setIsButtonShown] = createSignal(false);
  const [croppedFile, setCroppedFile] = createSignal<File | undefined>(undefined);
  const [firstName, setFirstName] = createSignal('');
  const [lastName, setLastName] = createSignal('');

  const handleFirstNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (errorKey()) {
      clearAuthErrorKey();
    }

    const { target } = event;

    setFirstName(target.value);
    setIsButtonShown(target.value.length > 0);
  };

  const handleLastNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { target } = event;

    setLastName(target.value);
  };

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    signUp({ firstName: firstName(), lastName: lastName() });

    const file = croppedFile();
    if (file) {
      uploadProfilePhoto({ file });
    }
  }

  return (
    <div id="auth-registration-form" class="custom-scroll">
      <div class="auth-form">
        <form action="" method="post" onSubmit={handleSubmit}>
          <AvatarEditable onChange={setCroppedFile} />
          <h2>{lang('YourName')}</h2>
          <p class="note">{lang('LoginRegisterDesc')}</p>
          <InputText
            id="registration-first-name"
            label={lang('LoginRegisterFirstNamePlaceholder')}
            onChange={handleFirstNameChange}
            value={firstName()}
            error={errorKey() && lang.withRegular(errorKey()!)}
            autoComplete="given-name"
          />
          <InputText
            id="registration-last-name"
            label={lang('LoginRegisterLastNamePlaceholder')}
            onChange={handleLastNameChange}
            value={lastName()}
            autoComplete="family-name"
          />
          {isButtonShown() && (
            <Button type="submit" ripple isLoading={isLoading()}>
              {lang('Next')}
            </Button>
          )}
        </form>
      </div>
    </div>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => pick(global, ['auth']);

export default AuthRegister;
