// FOUNDATION STUB: StarGift (telegram-tt src/components/middle/message/actions/StarGift.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiMessage } from '../../../../api/types';
import type { ApiMessageActionStarGift } from '../../../../api/types/messageActions';
import type { ObserveFn } from '../../../../hooks/useIntersectionObserver';

export type OwnProps = {
  message: ApiMessage;
  action: ApiMessageActionStarGift;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  onClick?: NoneToVoidFunction;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const StarGift = (_props: OwnProps) => undefined;

export default StarGift;
