// FOUNDATION STUB: HeaderMenuContainer.async (telegram-tt src/components/middle/HeaderMenuContainer.async.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { IAnchorPosition, ThreadId } from '../../types';

export type OwnProps = {
  chatId: string;
  threadId: ThreadId;
  isOpen: boolean;
  anchor: IAnchorPosition;
  isChannel?: boolean;
  canSubscribe?: boolean;
  canSearch?: boolean;
  canCall?: boolean;
  canMute?: boolean;
  canViewStatistics?: boolean;
  canViewBoosts?: boolean;
  canViewMonetization?: boolean;
  canShowBoostModal?: boolean;
  withForumActions?: boolean;
  canLeave?: boolean;
  canEnterVoiceChat?: boolean;
  canCreateVoiceChat?: boolean;
  pendingJoinRequests?: number;
  canTranslate?: boolean;
  channelMonoforumId?: string;
  onSearchClick: () => void;
  onAsMessagesClick: () => void;
  onClose: () => void;
  onCloseAnimationEnd: () => void;
  onJoinRequestsClick?: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const HeaderMenuContainerAsync = (_props: OwnProps) => undefined;

export default HeaderMenuContainerAsync;
