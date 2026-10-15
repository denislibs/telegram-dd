// FOUNDATION STUB: StarGiftUnique (telegram-tt src/components/middle/message/actions/StarGiftUnique.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiMessage } from '../../../../api/types';
import type { ApiMessageActionStarGiftUnique } from '../../../../api/types/messageActions';
import type { ObserveFn } from '../../../../hooks/useIntersectionObserver';

export type OwnProps = {
  message: ApiMessage;
  action: ApiMessageActionStarGiftUnique;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  onClick?: NoneToVoidFunction;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const StarGiftUnique = (_props: OwnProps) => undefined;

export default StarGiftUnique;
