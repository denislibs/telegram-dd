import { lazy } from 'frameact/dom';

import type { OwnProps } from './Main';

import { Bundles, loadBundle } from '../../util/moduleLoader';

const Main = lazy(() => loadBundle(Bundles.Main).then((m) => ({ default: m.Main })));

const MainAsync = (props: OwnProps) => {
  return <Main {...props} />;
};

export default MainAsync;
