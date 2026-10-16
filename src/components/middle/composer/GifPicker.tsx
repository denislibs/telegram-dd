// FOUNDATION STUB: GifPicker (telegram-tt src/components/middle/composer/GifPicker.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiVideo } from '../../../api/types';

type OwnProps = {
  className: string;
  loadAndPlay: boolean;
  canSendGifs?: boolean;
  onGifSelect?: (gif: ApiVideo, isSilent?: boolean, shouldSchedule?: boolean) => void;
  onGifAddCaption?: (gif: ApiVideo) => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const GifPicker = (_props: OwnProps) => undefined;

export default GifPicker;
