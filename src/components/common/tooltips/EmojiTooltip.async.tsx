import { createMemo } from 'frameact';
import { lazy, Show } from 'frameact/dom';

import type { OwnProps } from './EmojiTooltip';

import { Bundles, loadBundle } from '../../../util/moduleLoader';

const EmojiTooltip = lazy<OwnProps>(() => loadBundle(Bundles.Extra).then((m) => ({ default: m.EmojiTooltip })));

const EmojiTooltipAsync = (props: OwnProps) => {
  // Deviation: tt loaded the module while `isOpen` and rendered it for as long as it was in memory, so the closing fade
  // of the tooltip still ran. Here the lazy component is created on the first open and kept afterwards.
  let wasOpen = false;
  const shouldRender = createMemo(() => (wasOpen ||= props.isOpen));

  return (
    <Show when={shouldRender()}>
      <EmojiTooltip {...props} />
    </Show>
  );
};

export default EmojiTooltipAsync;
