import { lazy } from 'frameact/dom';

import { Bundles, loadBundle } from '../../util/moduleLoader';

import Loading from '../ui/Loading';

const AuthCode = lazy<Record<string, never>>(() => loadBundle(Bundles.Auth).then((m) => ({ default: m.AuthCode })), {
  placeholder: () => <Loading />,
});

const AuthCodeAsync = () => {
  return <AuthCode />;
};

export default AuthCodeAsync;
