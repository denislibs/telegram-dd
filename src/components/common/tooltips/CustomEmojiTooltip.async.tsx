import { createMemo } from 'frameact';
import { lazy, Show } from 'frameact/dom';

import type { OwnProps } from './CustomEmojiTooltip';

import { Bundles, loadBundle } from '../../../util/moduleLoader';

const CustomEmojiTooltip = lazy<OwnProps>(() =>
  loadBundle(Bundles.Extra).then((m) => ({ default: m.CustomEmojiTooltip })),
);

const CustomEmojiTooltipAsync = (props: OwnProps) => {
  // Deviation: tt loaded the module while `isOpen` and rendered it for as long as it was in memory, so the closing fade
  // of the tooltip still ran. Here the lazy component is created on the first open and kept afterwards.
  let wasOpen = false;
  const shouldRender = createMemo(() => (wasOpen ||= props.isOpen));

  return (
    <Show when={shouldRender()}>
      <CustomEmojiTooltip {...props} />
    </Show>
  );
};

export default CustomEmojiTooltipAsync;
