import { createMemo, createSignal } from 'frameact';

import { STICKER_SIZE_AUTH, STICKER_SIZE_AUTH_MOBILE, STICKER_SIZE_TWO_FA } from '../../config';
import { LOCAL_TGS_URLS } from './helpers/animatedAssets';

import useAppLayout from '../../hooks/useAppLayout';

import AnimatedSticker from './AnimatedSticker';

import './PasswordMonkey.scss';

type OwnProps = {
  code: string;
  codeLength: number;
  trackingDirection: number;
  isTracking: boolean;
  isBig?: boolean;
};

const TRACKING_START_FRAME = 15;
const TRACKING_END_FRAME = 180;

const TrackingMonkey = (props: OwnProps) => {
  const [isFirstMonkeyLoaded, setIsFirstMonkeyLoaded] = createSignal(false);
  const { isMobile } = useAppLayout();
  const trackningFramesPerSymbol = createMemo(() => (TRACKING_END_FRAME - TRACKING_START_FRAME) / props.codeLength);
  const stickerSize = isMobile ? STICKER_SIZE_AUTH_MOBILE : STICKER_SIZE_AUTH;

  const handleFirstMonkeyLoad = () => setIsFirstMonkeyLoaded(true);

  function getTrackingFrames(): [number, number] {
    const startFrame =
      (props.code && props.code.length > 1) || props.trackingDirection < 0
        ? TRACKING_START_FRAME + trackningFramesPerSymbol() * (props.code.length - 1)
        : 0;
    const endFrame =
      props.code.length === props.codeLength
        ? TRACKING_END_FRAME
        : TRACKING_START_FRAME + trackningFramesPerSymbol() * props.code.length;

    if (props.trackingDirection < 1) {
      return [endFrame, startFrame];
    }

    return [startFrame, endFrame];
  }

  return (
    <div id="monkey" class={props.isBig ? 'big' : ''}>
      {!isFirstMonkeyLoaded() && <div class="monkey-preview" />}
      <AnimatedSticker
        size={props.isBig ? STICKER_SIZE_TWO_FA : stickerSize}
        className={props.isTracking ? 'hidden' : undefined}
        tgsUrl={LOCAL_TGS_URLS.MonkeyIdle}
        play={!props.isTracking}
        onLoad={handleFirstMonkeyLoad}
      />
      <AnimatedSticker
        size={props.isBig ? STICKER_SIZE_TWO_FA : stickerSize}
        className={!props.isTracking ? 'hidden' : 'shown'}
        tgsUrl={LOCAL_TGS_URLS.MonkeyTracking}
        playSegment={props.isTracking ? getTrackingFrames() : undefined}
        speed={2}
        noLoop
      />
    </div>
  );
};

export default TrackingMonkey;
