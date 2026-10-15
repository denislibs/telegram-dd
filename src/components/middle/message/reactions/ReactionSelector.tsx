// FOUNDATION STUB: ReactionSelector (telegram-tt src/components/middle/message/reactions/ReactionSelector.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiAvailableReaction, ApiChatReactions, ApiReaction, ApiReactionCount } from '../../../../api/types';
import type { IAnchorPosition } from '../../../../types';

type OwnProps = {
  enabledReactions?: ApiChatReactions;
  isPrivate?: boolean;
  topReactions?: ApiReaction[];
  defaultTagReactions?: ApiReaction[];
  effectReactions?: ApiReaction[];
  allAvailableReactions?: ApiAvailableReaction[];
  currentReactions?: ApiReactionCount[];
  reactionsLimit?: number;
  isReady?: boolean;
  canBuyPremium?: boolean;
  isCurrentUserPremium?: boolean;
  canPlayAnimatedEmojis?: boolean;
  className?: string;
  isInSavedMessages?: boolean;
  isInStoryViewer?: boolean;
  isForEffects?: boolean;
  isWithPaidReaction?: boolean;
  onClose?: NoneToVoidFunction;
  onToggleReaction: (reaction: ApiReaction) => void;
  onSendPaidReaction?: NoneToVoidFunction;
  onShowPaidReactionModal?: NoneToVoidFunction;
  onShowMore: (position: IAnchorPosition) => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ReactionSelector = (_props: OwnProps) => undefined;

export default ReactionSelector;
