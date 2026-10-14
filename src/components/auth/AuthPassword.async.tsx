import { lazy } from 'frameact/dom';

import { Bundles, loadBundle } from '../../util/moduleLoader';

import Loading from '../ui/Loading';

const AuthPassword = lazy<Record<string, never>>(
  () => loadBundle(Bundles.Auth).then((m) => ({ default: m.AuthPassword })),
  {
    placeholder: () => <Loading />,
  },
);

const AuthPasswordAsync = () => {
  return <AuthPassword />;
};

export default AuthPasswordAsync;
