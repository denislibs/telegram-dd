// FOUNDATION STUB: SuggestedPhoto (telegram-tt src/components/middle/message/actions/SuggestedPhoto.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiMessage } from '../../../../api/types';
import type { ApiMessageActionSuggestProfilePhoto } from '../../../../api/types/messageActions';
import type { ObserveFn } from '../../../../hooks/useIntersectionObserver';

export type OwnProps = {
  message: ApiMessage;
  action: ApiMessageActionSuggestProfilePhoto;
  observeIntersection?: ObserveFn;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SuggestedPhoto = (_props: OwnProps) => undefined;

export default SuggestedPhoto;
