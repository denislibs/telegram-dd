import { lazy } from 'frameact/dom';

import { Bundles, loadBundle } from '../../util/moduleLoader';

import Loading from '../ui/Loading';

const AuthPassword = lazy(() => loadBundle(Bundles.Auth).then((m) => ({ default: m.AuthPassword })));

const AuthPasswordAsync = () => {
  return <AuthPassword />;
};

export default AuthPasswordAsync;
