// FOUNDATION STUB: DiceWrapper (telegram-tt src/components/middle/message/dice/DiceWrapper.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { ApiDice } from '../../../../api/types';
import type { ObserveFn } from '../../../../hooks/useIntersectionObserver';

import { REM } from '../../../common/helpers/mediaDimensions';
import { PLACEHOLDER_RADIUS, PLACEHOLDER_SURFACE } from '../../../common/helpers/placeholder';

export type OwnProps = {
  dice: ApiDice;
  canPlayWinEffect?: boolean;
  isLocal?: boolean;
  isOutgoing?: boolean;
  canSendDice?: boolean;
  onEffectPlayed?: NoneToVoidFunction;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
};

// tt's dice is a square of the idle sticker size, `13 * REM` until the sticker set is known.
const FALLBACK_SIZE = 13 * REM;

// TODO(port): the real DiceWrapper (the dice / slot machine stickers and the win effect).
const DiceWrapper = (_props: OwnProps) => {
  return (
    <div
      role="img"
      aria-label="Dice, not supported yet"
      style={`position: relative; display: block; width: ${FALLBACK_SIZE}px; height: ${FALLBACK_SIZE}px; ${PLACEHOLDER_SURFACE}; ${PLACEHOLDER_RADIUS}`}
    />
  );
};

export default DiceWrapper;
