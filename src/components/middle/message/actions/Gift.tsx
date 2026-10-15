// FOUNDATION STUB: Gift (telegram-tt src/components/middle/message/actions/Gift.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type {
  ApiMessageActionGiftPremium,
  ApiMessageActionGiftStars,
  ApiMessageActionGiftTon,
} from '../../../../api/types/messageActions';
import type { ObserveFn } from '../../../../hooks/useIntersectionObserver';

export type OwnProps = {
  action: ApiMessageActionGiftPremium | ApiMessageActionGiftStars | ApiMessageActionGiftTon;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  onClick?: NoneToVoidFunction;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Gift = (_props: OwnProps) => undefined;

export default Gift;
