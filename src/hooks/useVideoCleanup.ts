import { onFullyIdle, onMount } from 'frameact';

import { type MaybeAccessor, read } from '../util/accessors';
import unloadVideo from '../util/browser/unloadVideo';

// Fix memory leak when unmounting video element
// Deviation: no `handlers` to remove by hand (frameact keeps them on the node), so the parameter is gone.
export default function useVideoCleanup(videoRef: MaybeAccessor<HTMLVideoElement | undefined>) {
  onMount(() => {
    const videoEl = read(videoRef);
    if (!videoEl) return undefined;

    return () => {
      // It may be slow (specifically on iOS), so we postpone it after unmounting
      onFullyIdle(() => {
        unloadVideo(videoEl);
      });
    };
  });
}
