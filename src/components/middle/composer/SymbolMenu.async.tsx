import { createMemo } from 'frameact';
import { lazy, Show } from 'frameact/dom';

import type { OwnProps } from './SymbolMenu';

import { Bundles, loadBundle } from '../../../util/moduleLoader';

const SymbolMenu = lazy<OwnProps>(() => loadBundle(Bundles.Extra).then((m) => ({ default: m.SymbolMenu })));

const SymbolMenuAsync = (props: OwnProps) => {
  // Deviation: tt loaded the module while `isOpen` and rendered it for as long as it was in memory, so the closing
  // animation of the menu still ran. Here the lazy component is created on the first open and kept afterwards.
  let wasOpen = false;
  const shouldRender = createMemo(() => (wasOpen ||= props.isOpen));

  return (
    <Show when={shouldRender()}>
      <SymbolMenu {...props} />
    </Show>
  );
};

export default SymbolMenuAsync;
