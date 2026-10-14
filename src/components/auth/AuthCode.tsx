import { createSignal, onMount } from 'frameact';
import { getActions, withGlobal } from '../../global';

import type { GlobalState } from '../../global/types';

import { IS_TOUCH_ENV } from '../../util/browser/windowEnvironment';
import { pick } from '../../util/iteratees';

import useHistoryBack from '../../hooks/useHistoryBack';
import useLang from '../../hooks/useLang';

import Icon from '../common/icons/Icon';
import TrackingMonkey from '../common/TrackingMonkey';
import InputText from '../ui/InputText';
import Loading from '../ui/Loading';

type StateProps = {
  auth: GlobalState['auth'];
};

const CODE_LENGTH = 5;

const AuthCode = () => {
  const props = withGlobal({}, mapStateToProps);
  const { setAuthCode, returnToAuthPhoneNumber, clearAuthErrorKey } = getActions();

  const phoneNumber = () => props.auth.phoneNumber;
  const isCodeViaApp = () => props.auth.isCodeViaApp;
  const isLoading = () => props.auth.isLoading;
  const errorKey = () => props.auth.errorKey;
  const lang = useLang();
  let inputRef!: HTMLInputElement;

  const [code, setCode] = createSignal<string>('');
  const [isTracking, setIsTracking] = createSignal(false);
  const [trackingDirection, setTrackingDirection] = createSignal(1);

  onMount(() => {
    if (!IS_TOUCH_ENV) {
      inputRef!.focus();
    }
  });

  useHistoryBack({
    isActive: true,
    onBack: returnToAuthPhoneNumber,
  });

  const onCodeChange = (e: React.FormEvent<HTMLInputElement>) => {
    if (errorKey()) {
      clearAuthErrorKey();
    }

    const { currentTarget: target } = e;
    target.value = target.value.replace(/[^\d]+/, '').substr(0, CODE_LENGTH);

    if (target.value === code()) {
      return;
    }

    setCode(target.value);

    if (!isTracking()) {
      setIsTracking(true);
    } else if (!target.value.length) {
      setIsTracking(false);
    }

    if (code() && code().length > target.value.length) {
      setTrackingDirection(-1);
    } else {
      setTrackingDirection(1);
    }

    if (target.value.length === CODE_LENGTH) {
      setAuthCode({ code: target.value });
    }
  };

  function handleReturnToAuthPhoneNumber() {
    returnToAuthPhoneNumber();
  }

  return (
    <div id="auth-code-form" class="custom-scroll">
      <div class="auth-form">
        <TrackingMonkey
          code={code()}
          codeLength={CODE_LENGTH}
          isTracking={isTracking()}
          trackingDirection={trackingDirection()}
        />
        <h1>
          {phoneNumber()}
          <div
            class="auth-number-edit div-button"
            onClick={handleReturnToAuthPhoneNumber}
            role="button"
            tabIndex={0}
            title={lang('WrongNumber')}
            aria-label={lang('WrongNumber')}
          >
            <Icon name="edit" />
          </div>
        </h1>
        <p class="note">
          {lang(isCodeViaApp() ? 'SentAppCode' : 'LoginJustSentSms', undefined, {
            withNodes: true,
            withMarkdown: true,
          })}
        </p>
        <InputText
          ref={inputRef}
          id="sign-in-code"
          label={lang('Code')}
          onInput={onCodeChange}
          value={code()}
          error={errorKey() && lang.withRegular(errorKey())}
          autoComplete="off"
          inputMode="numeric"
        />
        {isLoading() && <Loading />}
      </div>
    </div>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => pick(global, ['auth']);

export default AuthCode;
