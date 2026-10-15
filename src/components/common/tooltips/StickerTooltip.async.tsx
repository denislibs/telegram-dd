// FOUNDATION STUB: StickerTooltip.async (telegram-tt src/components/common/tooltips/StickerTooltip.async.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
// Deviation: the sync StickerTooltip is not in src yet, so its OwnProps are copied here and exported from this file.
import type { ApiSticker } from '../../../api/types';
import type { ThreadId } from '../../../types';

export type OwnProps = {
  isOpen: boolean;
  chatId: string;
  threadId?: ThreadId;
  stickers?: ApiSticker[];
  isSavedMessages?: boolean;
  isCurrentUserPremium?: boolean;
  onStickerSelect: (sticker: ApiSticker, isSilent?: boolean, shouldSchedule?: boolean) => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const StickerTooltipAsync = (_props: OwnProps) => undefined;

export default StickerTooltipAsync;
