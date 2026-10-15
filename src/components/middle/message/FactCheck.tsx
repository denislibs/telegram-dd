// FOUNDATION STUB: FactCheck (telegram-tt src/components/middle/message/FactCheck.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { ApiFactCheck } from '../../../api/types';

import { PLACEHOLDER_RADIUS, PLACEHOLDER_SURFACE } from '../../common/helpers/placeholder';

export type OwnProps = {
  factCheck: ApiFactCheck;
  isToggleDisabled?: boolean;
};

// TODO(port): the real FactCheck (title, collapsible text, footnote).
const FactCheck = (_props: OwnProps) => {
  return (
    <div
      role="img"
      aria-label="Fact check, not supported yet"
      style={`min-height: 5.5rem; margin-top: 0.5rem; ${PLACEHOLDER_SURFACE}; ${PLACEHOLDER_RADIUS}`}
    />
  );
};

export default FactCheck;
