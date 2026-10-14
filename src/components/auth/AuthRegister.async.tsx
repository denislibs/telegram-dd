import { lazy } from 'frameact/dom';

import { Bundles, loadBundle } from '../../util/moduleLoader';

import Loading from '../ui/Loading';

const AuthRegister = lazy<Record<string, never>>(
  () => loadBundle(Bundles.Auth).then((m) => ({ default: m.AuthRegister })),
  {
    placeholder: () => <Loading />,
  },
);

const AuthRegisterAsync = () => {
  return <AuthRegister />;
};

export default AuthRegisterAsync;
