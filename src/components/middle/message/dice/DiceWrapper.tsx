// FOUNDATION STUB: DiceWrapper (telegram-tt src/components/middle/message/dice/DiceWrapper.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiDice } from '../../../../api/types';
import type { ObserveFn } from '../../../../hooks/useIntersectionObserver';

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DiceWrapper = (_props: OwnProps) => undefined;

export default DiceWrapper;
