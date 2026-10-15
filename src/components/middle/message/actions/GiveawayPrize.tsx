// FOUNDATION STUB: GiveawayPrize (telegram-tt src/components/middle/message/actions/GiveawayPrize.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiPeer } from '../../../../api/types';
import type { ApiMessageActionGiftCode, ApiMessageActionPrizeStars } from '../../../../api/types/messageActions';
import type { ObserveFn } from '../../../../hooks/useIntersectionObserver';

export type OwnProps = {
  action: ApiMessageActionGiftCode | ApiMessageActionPrizeStars;
  sender?: ApiPeer;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  onClick?: NoneToVoidFunction;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const GiveawayPrize = (_props: OwnProps) => undefined;

export default GiveawayPrize;
