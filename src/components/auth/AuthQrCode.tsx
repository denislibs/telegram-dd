import { createMemo, createMutationEffect } from 'frameact';
import { enableStrict } from 'frameact/stricterdom';
import { getActions, withGlobal } from '../../global';
import { createMediaTransition } from '../../lib/kit';

import type { GlobalState } from '../../global/types';

import { STRICTERDOM_ENABLED } from '../../config';
// TODO(codemod): still imported from teact: disableStrict
import { disableStrict } from '../../lib/fasterdom/stricterdom';
import { selectSharedSettings } from '../../global/selectors/sharedState';
import buildClassName from '../../util/buildClassName';
import { oldSetLanguage } from '../../util/oldLangProvider';
import { createStyledQrCode } from '../../util/qrCode/buildStyledQrCode';
import { LOCAL_TGS_URLS } from '../common/helpers/animatedAssets';
import { navigateBack } from './helpers/backNavigation';
import { getSuggestedLanguage } from './helpers/getSuggestedLanguage';

import useAsync from '../../hooks/useAsync';
import useFlag from '../../hooks/useFlag';
import useLang from '../../hooks/useLang';
import useLangString from '../../hooks/useLangString';
import useMultiaccountInfo from '../../hooks/useMultiaccountInfo';

import AnimatedIcon from '../common/AnimatedIcon';
import Button from '../ui/Button';
import Loading from '../ui/Loading';

type StateProps = {
  auth: GlobalState['auth'];
  connectionState: GlobalState['connectionState'];
  language?: string;
};

const DATA_PREFIX = 'tg://login?token=';
const QR_SIZE = 280;
const QR_PLANE_SIZE = 54;
const QR_IMAGE_SIZE_RATIO = 0.4;
const QR_CODE_MUTATION_DURATION = 50; // The library is asynchronous and we need to wait for its mutation code

const AuthCode = () => {
  const props = withGlobal({}, mapStateToProps);
  const { returnToAuthPhoneNumber, setSharedSettingOption, loginWithPasskey } = getActions();

  const state = () => props.auth.state;
  const authQrCode = () => props.auth.qrCode;
  const passkeyOption = () => props.auth.passkeyOption;
  const suggestedLanguage = getSuggestedLanguage();
  const lang = useLang();
  let qrCodeRef!: HTMLDivElement;

  const isConnected = createMemo(() => props.connectionState === 'connectionStateReady');
  const continueText = useLangString('AuthContinueOnThisLanguage', suggestedLanguage);
  const [isLoading, markIsLoading, unmarkIsLoading] = useFlag();
  const [isQrMounted, markQrMounted, unmarkQrMounted] = useFlag();

  const accountsInfo = useMultiaccountInfo();
  const hasActiveAccount = Object.values(accountsInfo).length > 0;

  const { result: qrCode } = useAsync(
    () =>
      createStyledQrCode({
        size: QR_SIZE,
        imageSize: QR_IMAGE_SIZE_RATIO,
      }),
    [],
  );

  // TODO(codemod): useMediaTransitionDeprecated returned class names: apply the result through ref={t.ref} on the element
  const transitionClassNames = createMemo(() => createMediaTransition({ hasMediaData: () => Boolean(isQrMounted()) }));

  createMutationEffect(
    () => [isConnected(), authQrCode(), isQrMounted(), qrCode],
    ([isConnected, authQrCode, isQrMounted]) => {
      if (!authQrCode || !qrCode) {
        return () => {
          unmarkQrMounted();
        };
      }

      if (!isConnected) {
        return undefined;
      }

      const container = qrCodeRef!;
      const data = `${DATA_PREFIX}${authQrCode.token}`;

      if (STRICTERDOM_ENABLED) {
        disableStrict();
      }

      qrCode.update({
        data,
      });

      if (!isQrMounted) {
        qrCode.append(container);
        markQrMounted();
      }

      if (STRICTERDOM_ENABLED) {
        window.setTimeout(() => {
          enableStrict();
        }, QR_CODE_MUTATION_DURATION);
      }

      return undefined;
    },
  );

  const handleBackNavigation = () => {
    navigateBack();
  };

  const handleLangChange = () => {
    markIsLoading();

    void oldSetLanguage(suggestedLanguage, () => {
      unmarkIsLoading();

      setSharedSettingOption({ language: suggestedLanguage });
    });
  };

  const handleReturnToAuthPhoneNumber = () => {
    returnToAuthPhoneNumber();
  };

  const handleLoginWithPasskey = () => {
    loginWithPasskey();
  };

  const isAuthReady = createMemo(() => state() === 'authorizationStateWaitQrCode');

  return (
    <div id="auth-qr-form" class="custom-scroll">
      {hasActiveAccount && (
        <Button
          size="smaller"
          round
          color="translucent"
          className="auth-close"
          iconName="close"
          onClick={handleBackNavigation}
        />
      )}
      <div class="auth-form qr">
        <div class="qr-outer">
          <div class={buildClassName('qr-inner', transitionClassNames())}>
            <div class="qr-container" ref={qrCodeRef} style={`width: ${QR_SIZE}px; height: ${QR_SIZE}px`} />
            <AnimatedIcon
              tgsUrl={LOCAL_TGS_URLS.QrPlane}
              size={QR_PLANE_SIZE}
              className="qr-plane"
              nonInteractive
              noLoop={false}
            />
          </div>
          {!isQrMounted() && (
            <div class="qr-loading">
              <Loading />
            </div>
          )}
        </div>
        <h1>{lang('LoginQRTitle')}</h1>
        <ol>
          <li>
            <span>{lang('LoginQRHelp1')}</span>
          </li>
          <li>
            <span>{lang('LoginQRHelp2', undefined, { withNodes: true, withMarkdown: true })}</span>
          </li>
          <li>
            <span>{lang('LoginQRHelp3')}</span>
          </li>
        </ol>
        {isAuthReady() && (
          <Button className="auth-button" isText onClick={handleReturnToAuthPhoneNumber}>
            {lang('LoginQRCancel')}
          </Button>
        )}
        {passkeyOption() && (
          <Button className="auth-button" isText onClick={handleLoginWithPasskey}>
            {lang('LoginPasskey')}
          </Button>
        )}
        {suggestedLanguage && suggestedLanguage !== props.language && continueText && (
          <Button className="auth-button" isText isLoading={isLoading()} onClick={handleLangChange}>
            {continueText}
          </Button>
        )}
      </div>
    </div>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  const { connectionState, auth } = global;

  const { language } = selectSharedSettings(global);

  return {
    connectionState,
    auth,
    language,
  };
};

export default AuthCode;
