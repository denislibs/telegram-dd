// FOUNDATION STUB: StickerPicker (telegram-tt src/components/middle/composer/StickerPicker.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiSticker } from '../../../api/types';
import type { ThreadId } from '../../../types';

type OwnProps = {
  chatId: string;
  threadId?: ThreadId;
  className: string;
  isHidden?: boolean;
  isTranslucent?: boolean;
  loadAndPlay: boolean;
  canSendStickers?: boolean;
  noContextMenus?: boolean;
  idPrefix: string;
  onStickerSelect: (
    sticker: ApiSticker,
    isSilent?: boolean,
    shouldSchedule?: boolean,
    canUpdateStickerSetsOrder?: boolean,
  ) => void;
  isForEffects?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const StickerPicker = (_props: OwnProps) => undefined;

export default StickerPicker;
