import { createMemo } from 'frameact';
import { lazy, Show } from 'frameact/dom';

import type { OwnProps } from './ChatCommandTooltip';

import { Bundles, loadBundle } from '../../../util/moduleLoader';

const ChatCommandTooltip = lazy<OwnProps>(() =>
  loadBundle(Bundles.Extra).then((m) => ({ default: m.ChatCommandTooltip })),
);

const ChatCommandTooltipAsync = (props: OwnProps) => {
  // Deviation: tt loaded the module while `isOpen` and rendered it for as long as it was in memory, so the closing fade
  // of the tooltip still ran. Here the lazy component is created on the first open and kept afterwards.
  let wasOpen = false;
  const shouldRender = createMemo(() => (wasOpen ||= props.isOpen));

  return (
    <Show when={shouldRender()}>
      <ChatCommandTooltip {...props} />
    </Show>
  );
};

export default ChatCommandTooltipAsync;
