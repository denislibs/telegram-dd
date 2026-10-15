// FOUNDATION STUB: InlineBotTooltip.async (telegram-tt src/components/common/tooltips/InlineBotTooltip.async.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
// Deviation: the sync InlineBotTooltip is not in src yet, so its OwnProps are copied here and exported from this file.
import type {
  ApiBotInlineMediaResult,
  ApiBotInlineResult,
  ApiBotInlineSwitchPm,
  ApiBotInlineSwitchWebview,
} from '../../../api/types';

export type OwnProps = {
  isOpen: boolean;
  selectedIndex: number;
  botId?: string;
  isGallery?: boolean;
  inlineBotResults?: (ApiBotInlineResult | ApiBotInlineMediaResult)[];
  switchPm?: ApiBotInlineSwitchPm;
  switchWebview?: ApiBotInlineSwitchWebview;
  isSavedMessages?: boolean;
  canSendGifs?: boolean;
  onSelectResult: (
    inlineResult: ApiBotInlineMediaResult | ApiBotInlineResult,
    isSilent?: boolean,
    shouldSchedule?: boolean,
  ) => void;
  loadMore: NoneToVoidFunction;
  isCurrentUserPremium?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const InlineBotTooltipAsync = (_props: OwnProps) => undefined;

export default InlineBotTooltipAsync;
