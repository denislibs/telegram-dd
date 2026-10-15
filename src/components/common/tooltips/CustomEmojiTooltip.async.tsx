import { lazy } from 'frameact/dom';

import type { OwnProps } from './CustomEmojiTooltip';

import { Bundles, loadBundle } from '../../../util/moduleLoader';

const CustomEmojiTooltip = lazy<OwnProps>(() =>
  loadBundle(Bundles.Extra).then((m) => ({ default: m.CustomEmojiTooltip })),
);

const CustomEmojiTooltipAsync = (props: OwnProps) => {
  return <CustomEmojiTooltip {...props} />;
};

export default CustomEmojiTooltipAsync;
