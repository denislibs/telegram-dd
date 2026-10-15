import { lazy } from 'frameact/dom';

import type { OwnProps } from './MentionTooltip';

import { Bundles, loadBundle } from '../../../util/moduleLoader';

const MentionTooltip = lazy<OwnProps>(() => loadBundle(Bundles.Extra).then((m) => ({ default: m.MentionTooltip })));

const MentionTooltipAsync = (props: OwnProps) => {
  return <MentionTooltip {...props} />;
};

export default MentionTooltipAsync;
