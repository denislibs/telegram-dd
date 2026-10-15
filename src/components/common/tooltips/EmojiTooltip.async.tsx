import { lazy } from 'frameact/dom';

import type { OwnProps } from './EmojiTooltip';

import { Bundles, loadBundle } from '../../../util/moduleLoader';

const EmojiTooltip = lazy<OwnProps>(() => loadBundle(Bundles.Extra).then((m) => ({ default: m.EmojiTooltip })));

const EmojiTooltipAsync = (props: OwnProps) => {
  return <EmojiTooltip {...props} />;
};

export default EmojiTooltipAsync;
