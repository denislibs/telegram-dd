// FOUNDATION STUB: ChannelPhoto (telegram-tt src/components/middle/message/actions/ChannelPhoto.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiMessageActionChatEditPhoto } from '../../../../api/types/messageActions';
import type { ObserveFn } from '../../../../hooks/useIntersectionObserver';

export type OwnProps = {
  action: ApiMessageActionChatEditPhoto;
  observeIntersection?: ObserveFn;
  onClick?: NoneToVoidFunction;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ChannelPhoto = (_props: OwnProps) => undefined;

export default ChannelPhoto;
