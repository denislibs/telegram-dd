// FOUNDATION STUB: CustomSendMenu.async (telegram-tt src/components/middle/composer/CustomSendMenu.async.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
// Deviation: the sync CustomSendMenu is not in src yet, so its OwnProps are copied here and exported from this file.
import type { ApiAvailableReaction, ApiReaction } from '../../../api/types';

export type OwnProps = {
  isOpen: boolean;
  isOpenToBottom?: boolean;
  isSavedMessages?: boolean;
  canSchedule?: boolean;
  canScheduleUntilOnline?: boolean;
  onSendSilent?: NoneToVoidFunction;
  onSendSchedule?: NoneToVoidFunction;
  onSendWhenOnline?: NoneToVoidFunction;
  onRemoveEffect?: NoneToVoidFunction;
  onClose: NoneToVoidFunction;
  onCloseAnimationEnd?: NoneToVoidFunction;
  chatId?: string;
  withEffects?: boolean;
  hasCurrentEffect?: boolean;
  effectReactions?: ApiReaction[];
  allAvailableReactions?: ApiAvailableReaction[];
  onToggleReaction?: (reaction: ApiReaction) => void;
  canBuyPremium?: boolean;
  isCurrentUserPremium?: boolean;
  isInSavedMessages?: boolean;
  isInStoryViewer?: boolean;
  canPlayAnimatedEmojis?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CustomSendMenuAsync = (_props: OwnProps) => undefined;

export default CustomSendMenuAsync;
