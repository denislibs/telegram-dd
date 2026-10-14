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

  // Deviation: every slide renders the screen of its own key (framework guide section 6), so the outgoing slide keeps
  // its content while it fades out; tt re-rendered one `getScreen()` from the previous auth state (`currentOrPrev`).
  function renderScreen(key: number) {
    switch (key) {
      case 0:
        return <AuthCode />;
      case 1:
        return <AuthPassword />;
      case 2:
        return <AuthRegister />;
      case 3:
        return <AuthPhoneNumber />;
      default:
        return <AuthQrCode />;
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
    <Transition
      activeKey={getActiveKey()}
      name="fade"
      className="Auth"
      data-tauri-drag-region={IS_TAURI && IS_MAC_OS ? true : undefined}
    >
      {(slide) => renderScreen(slide.key)}
    </Transition>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  return {
    authState: global.auth.state,
  };
};

export default Auth;
