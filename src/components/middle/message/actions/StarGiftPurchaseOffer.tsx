// FOUNDATION STUB: StarGiftPurchaseOffer (telegram-tt src/components/middle/message/actions/StarGiftPurchaseOffer.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiMessage } from '../../../../api/types';
import type { ApiMessageActionStarGiftPurchaseOffer } from '../../../../api/types/messageActions';
import type { ObserveFn } from '../../../../hooks/useIntersectionObserver';

export type OwnProps = {
  message: ApiMessage;
  action: ApiMessageActionStarGiftPurchaseOffer;
  hasButtons?: boolean;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  onClick?: NoneToVoidFunction;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const StarGiftPurchaseOffer = (_props: OwnProps) => undefined;

export default StarGiftPurchaseOffer;
