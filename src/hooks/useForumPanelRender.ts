import { createEffect, createSignal } from 'frameact';

import { type MaybeAccessor, read } from '../util/accessors';

// Deviation: returns accessors (frameact components run once; the refs + `forceUpdate` of tt are signals).
export default function useForumPanelRender(isForumPanelOpen: MaybeAccessor<boolean> = false) {
  const [shouldRenderForumPanel, setShouldRenderForumPanel] = createSignal(read(isForumPanelOpen));
  const [isAnimationStarted, setIsAnimationStarted] = createSignal(false);

  createEffect(
    () => read(isForumPanelOpen),
    (isForumPanelOpen2) => {
      if (isForumPanelOpen2) {
        setShouldRenderForumPanel(true);
      }
    },
  );

  const handleForumPanelAnimationEnd = () => {
    setShouldRenderForumPanel(false);
    setIsAnimationStarted(false);
  };

  const handleForumPanelAnimationStart = () => {
    setIsAnimationStarted(true);
  };

  return {
    shouldRenderForumPanel,
    isAnimationStarted,
    handleForumPanelAnimationEnd,
    handleForumPanelAnimationStart,
  };
}
