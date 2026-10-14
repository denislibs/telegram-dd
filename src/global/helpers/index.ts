// FOUNDATION STUB (types only): telegram-tt's global/helpers barrel is ported with the app layer.
import type { ApiAudio, ApiDocument, ApiPhoto, ApiSticker, ApiVideo, ApiVoice, ApiWebDocument } from '../../api/types';

// Copied from telegram-tt src/global/helpers/messageMedia.ts
export type DownloadableMedia = ApiPhoto | ApiVideo | ApiDocument | ApiSticker | ApiAudio | ApiVoice | ApiWebDocument;
