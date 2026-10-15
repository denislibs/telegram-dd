import { createEffect, createSignal } from 'frameact';
import { getActions } from '../../global';
import { depsOf } from '../../util/effectDeps';

import { IS_MOBILE } from '../../util/browser/windowEnvironment';
import useLastCallback from '../useLastCallback';
import useOldLang from '../useOldLang';

const NOTIFICATION_DURATION = 8000;

// TODO(codemod): useUnsupportedMedia: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useUnsupportedMedia(
  ref: (el: HTMLVideoElement) => void,
  shouldDisableNotification?: boolean,
  isDisabled?: boolean,
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

  createEffect(depsOf(() => [isDisabled, ref]), () => {
    if (isDisabled) return undefined;

    const { current } = ref;
    if (!current) {
      return undefined;
    }

    current.addEventListener('error', onError);
    current.addEventListener('canplay', onCanPlay);

    return () => {
      current.removeEventListener('error', onError);
      current.removeEventListener('canplay', onCanPlay);
    };
  });

  return isUnsupported;
}
