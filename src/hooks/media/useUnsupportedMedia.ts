import { type Accessor, createEffect, createSignal } from 'frameact';
import { getActions } from '../../global';

import { type MaybeAccessor, read } from '../../util/accessors';
import { IS_MOBILE } from '../../util/browser/windowEnvironment';
import { depsOf } from '../../util/effectDeps';
import useOldLang from '../useOldLang';

const NOTIFICATION_DURATION = 8000;

// Deviation: `ref` is an accessor of the video element (a signal: the element is created conditionally) and the
// listeners are attached by an effect keyed on it; `isDisabled` is a `MaybeAccessor`.
export default function useUnsupportedMedia(
  ref: Accessor<HTMLVideoElement | undefined>,
  shouldDisableNotification?: boolean,
  isDisabled?: MaybeAccessor<boolean | undefined>,
) {
  const { showNotification } = getActions();
  const lang = useOldLang();
  const [isUnsupported, setIsUnsupported] = createSignal(false);

  const handleUnsupported = () => {
    setIsUnsupported(true);
    if (shouldDisableNotification) return;

    showNotification({
      message: IS_MOBILE ? lang('Video.Unsupported.Mobile') : lang('Video.Unsupported.Desktop'),
      duration: NOTIFICATION_DURATION,
    });
  };

  const onError = (event: Event) => {
    const target = event.currentTarget as HTMLVideoElement;
    const { error } = target;
    if (!error) return;

    // https://developer.mozilla.org/en-US/docs/Web/API/MediaError/code
    if (error.code === 3 || error.code === 4) {
      handleUnsupported();
    }
  };

  const onCanPlay = (event: Event) => {
    const target = event.currentTarget as HTMLVideoElement;

    if (!target.videoHeight || !target.videoWidth) {
      handleUnsupported();
    }
  };

  createEffect(
    depsOf(() => [read(isDisabled), ref()] as const),
    ([isDisabled2, current]) => {
      if (isDisabled2) return undefined;

      if (!current) {
        return undefined;
      }

      current.addEventListener('error', onError);
      current.addEventListener('canplay', onCanPlay);

      return () => {
        current.removeEventListener('error', onError);
        current.removeEventListener('canplay', onCanPlay);
      };
    },
  );

  return isUnsupported;
}
