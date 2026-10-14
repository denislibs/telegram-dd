import '../../global/actions/initial';

import { currentOrPrev } from 'frameact';
import { getActions, withGlobal } from '../../global';

import type { GlobalState } from '../../global/types';

import { IS_TAURI } from '../../util/browser/globalEnvironment';
import { IS_MAC_OS, PLATFORM_ENV } from '../../util/browser/windowEnvironment';

import useHistoryBack from '../../hooks/useHistoryBack';

import Transition from '../ui/Transition';
import AuthCode from './AuthCode.async';
import AuthPassword from './AuthPassword.async';
import AuthPhoneNumber from './AuthPhoneNumber';
import AuthQrCode from './AuthQrCode';
import AuthRegister from './AuthRegister.async';

import './Auth.scss';

type StateProps = {
  authState: GlobalState['auth']['state'];
};

const Auth = () => {
  const props = withGlobal({}, mapStateToProps);
  const { returnToAuthPhoneNumber, goToAuthQrCode } = getActions();

  const isMobile = PLATFORM_ENV === 'iOS' || PLATFORM_ENV === 'Android';

  const handleChangeAuthorizationMethod = () => {
    if (!isMobile) {
      goToAuthQrCode();
    } else {
      returnToAuthPhoneNumber();
    }
  };

  useHistoryBack({
    isActive: () =>
      (!isMobile && props.authState === 'authorizationStateWaitPhoneNumber') ||
      (isMobile && props.authState === 'authorizationStateWaitQrCode'),
    onBack: handleChangeAuthorizationMethod,
  });

  // For animation purposes
  const renderingAuthState = currentOrPrev(
    () => (props.authState !== 'authorizationStateReady' ? props.authState : undefined),
    { skipUndefined: true },
  );

  function getScreen() {
    switch (renderingAuthState()) {
      case 'authorizationStateWaitCode':
        return <AuthCode />;
      case 'authorizationStateWaitPassword':
        return <AuthPassword />;
      case 'authorizationStateWaitRegistration':
        return <AuthRegister />;
      case 'authorizationStateWaitPhoneNumber':
        return <AuthPhoneNumber />;
      case 'authorizationStateWaitQrCode':
        return <AuthQrCode />;
      default:
        return isMobile ? <AuthPhoneNumber /> : <AuthQrCode />;
    }
  }

  function getActiveKey() {
    switch (renderingAuthState()) {
      case 'authorizationStateWaitCode':
        return 0;
      case 'authorizationStateWaitPassword':
        return 1;
      case 'authorizationStateWaitRegistration':
        return 2;
      case 'authorizationStateWaitPhoneNumber':
        return 3;
      case 'authorizationStateWaitQrCode':
        return 4;
      default:
        return isMobile ? 3 : 4;
    }
  }

  return (
    // TODO(codemod): <Transition> children: use the render function and render by slide.key (framework guide §6)
    <Transition
      activeKey={getActiveKey()}
      name="fade"
      className="Auth"
      data-tauri-drag-region={IS_TAURI && IS_MAC_OS ? true : undefined}
    >
      {getScreen()}
    </Transition>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  return {
    authState: global.auth.state,
  };
};

export default Auth;
