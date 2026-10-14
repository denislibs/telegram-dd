import {
  createEffect,
  createMeasureEffect,
  createMemo,
  createMutationEffect,
  createSignal,
  requestMeasure,
} from 'frameact';
import { getActions, withGlobal } from '../../global';

import type { ApiCountryCode } from '../../api/types';
import type { GlobalState } from '../../global/types';

import { IS_SAFARI, IS_TOUCH_ENV } from '../../util/browser/windowEnvironment';
import { depsOf } from '../../util/effectDeps';
import { preloadImage } from '../../util/files';
import preloadFonts from '../../util/fonts';
import { getAccountSlotUrl } from '../../util/multiaccount';
import { oldSetLanguage } from '../../util/oldLangProvider';
import { formatPhoneNumber, getCountryCodeByIso, getCountryFromPhoneNumber } from '../../util/phoneNumber';
import { navigateBack } from './helpers/backNavigation';
import { getSuggestedLanguage } from './helpers/getSuggestedLanguage';

import useFlag from '../../hooks/useFlag';
import useLang from '../../hooks/useLang';
import useLangString from '../../hooks/useLangString';
import useMultiaccountInfo from '../../hooks/useMultiaccountInfo';

import Button from '../ui/Button';
import Checkbox from '../ui/Checkbox';
import InputText from '../ui/InputText';
import Loading from '../ui/Loading';
import CountryCodeInput from './CountryCodeInput';

import monkeyPath from '../../assets/monkey.svg';

type StateProps = {
  auth: GlobalState['auth'];
  connectionState: GlobalState['connectionState'];
  language?: string;
  phoneCodeList: ApiCountryCode[];
  isTestServer?: boolean;
};

const MIN_NUMBER_LENGTH = 7;

let isPreloadInitiated = false;

const AuthPhoneNumber = () => {
  const props = withGlobal({}, mapStateToProps);
  const {
    setAuthPhoneNumber,
    setAuthRememberMe,
    loadNearestCountry,
    loadCountryList,
    clearAuthErrorKey,
    goToAuthQrCode,
    setSharedSettingOption,
    loginWithPasskey,
  } = getActions();

  const state = () => props.auth.state;
  const authPhoneNumber = () => props.auth.phoneNumber;
  const nearestCountry = () => props.auth.nearestCountry;
  const authIsLoading = () => props.auth.isLoading;
  const errorKey = () => props.auth.errorKey;
  const rememberMe = () => props.auth.rememberMe;
  const isLoadingQrCode = () => props.auth.isLoadingQrCode;
  const passkeyOption = () => props.auth.passkeyOption;
  const lang = useLang();
  let inputRef!: HTMLInputElement;
  const suggestedLanguage = getSuggestedLanguage();

  const isConnected = createMemo(() => props.connectionState === 'connectionStateReady');
  const continueText = useLangString('AuthContinueOnThisLanguage', suggestedLanguage);
  const [country, setCountry] = createSignal<ApiCountryCode | undefined>(undefined);
  const [phoneNumber, setPhoneNumber] = createSignal<string | undefined>(undefined);
  const [isTouched, setIsTouched] = createSignal(false);
  const [lastSelection, setLastSelection] = createSignal<[number, number] | undefined>(undefined);
  const [isLoading, markIsLoading, unmarkIsLoading] = useFlag();

  const accountsInfo = useMultiaccountInfo();
  const hasActiveAccount = () => Object.values(accountsInfo()).length > 0;
  const phoneNumberSlots = createMemo(() =>
    Object.entries(accountsInfo())
      .filter(([, info]) => info.isTest === props.isTestServer)
      .reduce(
        (acc, [key, { phone }]) => {
          if (phone) acc[phone] = Number(key);
          return acc;
        },
        {} as Record<string, number>,
      ),
  );

  const fullNumber = createMemo(() =>
    country() ? `+${country()!.countryCode} ${phoneNumber() || ''}` : phoneNumber(),
  );
  const canSubmit = createMemo(() => fullNumber() && fullNumber()!.replace(/[^\d]+/g, '').length >= MIN_NUMBER_LENGTH);

  createMeasureEffect(
    () => country(),
    () => {
      if (!IS_TOUCH_ENV) {
        inputRef.focus();
      }
    },
  );

  createEffect(
    depsOf(() => [isConnected(), nearestCountry()] as const),
    ([isConnected2, nearestCountry2]) => {
      if (isConnected2 && !nearestCountry2) {
        loadNearestCountry();
      }
    },
  );

  createEffect(
    depsOf(() => [isConnected(), props.language] as const),
    ([isConnected2, language2]) => {
      if (isConnected2) {
        loadCountryList({ langCode: language2 });
      }
    },
  );

  createEffect(
    depsOf(() => [country(), nearestCountry(), isTouched(), props.phoneCodeList] as const),
    ([country2, nearestCountry2, isTouched2, phoneCodeList2]) => {
      if (nearestCountry2 && phoneCodeList2 && !country2 && !isTouched2) {
        setCountry(getCountryCodeByIso(phoneCodeList2, nearestCountry2));
      }
    },
  );

  const parseFullNumber = (newFullNumber: string) => {
    if (!newFullNumber.length) {
      setPhoneNumber('');
    }

    const suggestedCountry = props.phoneCodeList && getCountryFromPhoneNumber(props.phoneCodeList, newFullNumber);

    // Any phone numbers should be allowed, in some cases ignoring formatting
    const selectedCountry =
      !country() ||
      (suggestedCountry && suggestedCountry.iso2 !== country()!.iso2) ||
      (!suggestedCountry && newFullNumber.length)
        ? suggestedCountry
        : country();

    if (!country() || !selectedCountry || (selectedCountry && selectedCountry.iso2 !== country()!.iso2)) {
      setCountry(selectedCountry);
    }
    setPhoneNumber(formatPhoneNumber(newFullNumber, selectedCountry));
  };

  const handleLangChange = () => {
    markIsLoading();

    void oldSetLanguage(suggestedLanguage, () => {
      unmarkIsLoading();

      setSharedSettingOption({ language: suggestedLanguage });
    });
  };

  createEffect(
    depsOf(() => [authPhoneNumber(), phoneNumber(), parseFullNumber] as const),
    ([authPhoneNumber2, phoneNumber2]) => {
      if (phoneNumber2 === undefined && authPhoneNumber2) {
        parseFullNumber(authPhoneNumber2);
      }
    },
  );

  createMutationEffect(
    () => lastSelection(),
    (lastSelection2) => {
      if (inputRef && lastSelection2) {
        inputRef.setSelectionRange(...lastSelection2);
      }
    },
  );

  let isJustPastedRef = false;
  const handlePaste = () => {
    isJustPastedRef = true;
    requestMeasure(() => {
      isJustPastedRef = false;
    });
  };

  const handleBackNavigation = () => {
    navigateBack();
  };

  const handleCountryChange = (value: ApiCountryCode) => {
    setCountry(value);
    setPhoneNumber('');
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (errorKey()) {
      clearAuthErrorKey();
    }

    // This is for further screens. We delay it until user input to speed up the initial loading.
    if (!isPreloadInitiated) {
      isPreloadInitiated = true;
      preloadFonts();
      void preloadImage(monkeyPath);
    }

    const { value, selectionStart, selectionEnd } = e.target;
    setLastSelection(
      selectionStart && selectionEnd && selectionEnd < value.length ? [selectionStart, selectionEnd] : undefined,
    );

    setIsTouched(true);

    const shouldFixSafariAutoComplete =
      IS_SAFARI &&
      country() &&
      fullNumber() !== undefined &&
      value.length - fullNumber()!.length > 1 &&
      !isJustPastedRef;
    parseFullNumber(shouldFixSafariAutoComplete ? `${country()!.countryCode} ${value}` : value);
  };

  const handleKeepSessionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAuthRememberMe({ value: e.target.checked });
  };

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (authIsLoading()) {
      return;
    }

    const adaptedPhoneNumber = fullNumber()?.replace(/[^\d]/g, '');
    if (adaptedPhoneNumber && phoneNumberSlots()[adaptedPhoneNumber]) {
      window.location.replace(getAccountSlotUrl(phoneNumberSlots()[adaptedPhoneNumber]));
      return;
    }

    if (canSubmit()) {
      setAuthPhoneNumber({ phoneNumber: fullNumber()! });
    }
  }

  const handleGoToAuthQrCode = () => {
    goToAuthQrCode();
  };

  const handleLoginWithPasskey = () => {
    loginWithPasskey();
  };

  const isAuthReady = createMemo(() => state() === 'authorizationStateWaitPhoneNumber');

  return (
    <div id="auth-phone-number-form" class="custom-scroll">
      {hasActiveAccount() && (
        <Button
          size="smaller"
          round
          color="translucent"
          className="auth-close"
          iconName="close"
          onClick={handleBackNavigation}
        />
      )}
      <div class="auth-form">
        <div id="logo" />
        <h1>{lang('AuthTitle')}</h1>
        <p class="note">{lang('StartText')}</p>
        <form class="form" action="" onSubmit={handleSubmit}>
          <CountryCodeInput
            id="sign-in-phone-code"
            value={country()}
            isLoading={!nearestCountry() && !country()}
            onChange={handleCountryChange}
          />
          <InputText
            ref={(el) => {
              inputRef = el;
            }}
            id="sign-in-phone-number"
            label={lang('LoginPhonePlaceholder')}
            value={fullNumber()}
            error={errorKey() && lang.withRegular(errorKey()!)}
            inputMode="tel"
            onChange={handlePhoneNumberChange}
            onPaste={IS_SAFARI ? handlePaste : undefined}
          />
          <Checkbox
            id="sign-in-keep-session"
            label={lang('AuthKeepSignedIn')}
            checked={Boolean(rememberMe())}
            onChange={handleKeepSessionChange}
          />
          {canSubmit() &&
            (isAuthReady() ? (
              <Button className="auth-button" type="submit" ripple isLoading={authIsLoading()}>
                {lang('LoginNext')}
              </Button>
            ) : (
              <Loading />
            ))}
          {isAuthReady() && (
            <Button className="auth-button" isText ripple isLoading={isLoadingQrCode()} onClick={handleGoToAuthQrCode}>
              {lang('LoginQRLogin')}
            </Button>
          )}
          {passkeyOption() && (
            <Button className="auth-button" isText onClick={handleLoginWithPasskey}>
              {lang('LoginPasskey')}
            </Button>
          )}
          {suggestedLanguage && suggestedLanguage !== props.language && continueText() && (
            <Button className="auth-button" isText isLoading={isLoading()} onClick={handleLangChange}>
              {continueText()}
            </Button>
          )}
        </form>
      </div>
    </div>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  const {
    sharedState: {
      settings: { language },
    },
    countryList: { phoneCodes: phoneCodeList },
    config,
    auth,
    connectionState,
  } = global;

  return {
    auth,
    connectionState,
    language,
    phoneCodeList,
    isTestServer: config?.isTestServer,
  };
};

export default AuthPhoneNumber;
