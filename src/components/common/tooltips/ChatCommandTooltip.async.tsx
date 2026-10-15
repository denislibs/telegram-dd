import { lazy } from 'frameact/dom';

import type { OwnProps } from './ChatCommandTooltip';

import { Bundles, loadBundle } from '../../../util/moduleLoader';

const ChatCommandTooltip = lazy<OwnProps>(() =>
  loadBundle(Bundles.Extra).then((m) => ({ default: m.ChatCommandTooltip })),
);

const ChatCommandTooltipAsync = (props: OwnProps) => {
  return <ChatCommandTooltip {...props} />;
};

export default ChatCommandTooltipAsync;
