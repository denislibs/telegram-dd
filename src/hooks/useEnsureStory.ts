import { createEffect, createMemo } from 'frameact';
import { getActions } from '../global';
import { depsOf } from '../util/effectDeps';

import type { ApiTypeStory } from '../api/types';

import { throttle } from '../util/schedulers';

const THROTTLE_THRESHOLD_MS = 200;

// TODO(codemod): useEnsureStory: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
function useEnsureStory(peerId?: string, storyId?: number, story?: ApiTypeStory) {
  const { loadPeerStoriesByIds } = getActions();

  const loadStoryThrottled = createMemo(() => {
    const throttled = throttle(loadPeerStoriesByIds, THROTTLE_THRESHOLD_MS, true);
    return () => {
      throttled({ peerId: peerId!, storyIds: [storyId!] });
    };
  });

  createEffect(
    depsOf(() => [loadStoryThrottled(), story, storyId, peerId] as const),
    ([loadStoryThrottled2]) => {
      const shouldLoadStory = !story || !('content' in story || 'isDeleted' in story);
      if (peerId && storyId && shouldLoadStory) {
        loadStoryThrottled2();
      }
    },
  );
}

export default useEnsureStory;
