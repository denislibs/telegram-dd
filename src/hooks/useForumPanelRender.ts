import { createEffect } from 'frameact';

import useForceUpdate from './useForceUpdate';
import useLastCallback from './useLastCallback';
import useSyncEffect from './useSyncEffect';

// TODO(codemod): useForumPanelRender: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useForumPanelRender(isForumPanelOpen = false) {
  let shouldRenderForumPanelRef = isForumPanelOpen;
  let isAnimationStartedRef = false;
  // TODO(codemod): useForceUpdate: a component runs once; make the changing value a signal and delete the force update
  const forceUpdate = useForceUpdate();

  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(
    () => isForumPanelOpen,
    () => {
      if (isForumPanelOpen) {
        shouldRenderForumPanelRef = true;
      }
    },
  );

  const handleForumPanelAnimationEnd = () => {
    shouldRenderForumPanelRef = false;
    isAnimationStartedRef = false;
    forceUpdate();
  };

  const handleForumPanelAnimationStart = () => {
    isAnimationStartedRef = true;
    forceUpdate();
  };

  return {
    shouldRenderForumPanel: shouldRenderForumPanelRef,
    isAnimationStarted: isAnimationStartedRef,
    handleForumPanelAnimationEnd,
    handleForumPanelAnimationStart,
  };
}
