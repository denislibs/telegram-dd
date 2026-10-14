import { lazy, Show } from 'frameact/dom';

import type { OwnProps } from './LockScreen';

import { Bundles, loadBundle } from '../../util/moduleLoader';

const LockScreen = lazy(() => loadBundle(Bundles.Main).then((m) => ({ default: m.LockScreen })));

const LockScreenAsync = (props: OwnProps) => {
  return (
    <Show when={props.isLocked}>
      <LockScreen {...props} />
    </Show>
  );
};

export default LockScreenAsync;
