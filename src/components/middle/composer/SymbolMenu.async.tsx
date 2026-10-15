import { lazy, Show } from 'frameact/dom';

import type { OwnProps } from './SymbolMenu';

import { Bundles, loadBundle } from '../../../util/moduleLoader';

const SymbolMenu = lazy<OwnProps>(() => loadBundle(Bundles.Extra).then((m) => ({ default: m.SymbolMenu })));

const SymbolMenuAsync = (props: OwnProps) => {
  return (
    <Show when={props.isOpen}>
      <SymbolMenu {...props} />
    </Show>
  );
};

export default SymbolMenuAsync;
