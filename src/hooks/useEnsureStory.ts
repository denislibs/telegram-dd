import { createEffect, createMemo } from 'frameact';
import { getActions } from '../global';
import { type MaybeAccessor, read } from '../util/accessors';
import { depsOf } from '../util/effectDeps';

import type { ApiTypeStory } from '../api/types';

import { throttle } from '../util/schedulers';

const THROTTLE_THRESHOLD_MS = 200;

function useEnsureStory(
  peerId?: MaybeAccessor<string | undefined>,
  storyId?: MaybeAccessor<number | undefined>,
  story?: MaybeAccessor<ApiTypeStory | undefined>,
) {
  const { loadPeerStoriesByIds } = getActions();

  const loadStoryThrottled = createMemo(() => {
    const throttled = throttle(loadPeerStoriesByIds, THROTTLE_THRESHOLD_MS, true);
    return () => {
      throttled({ peerId: read(peerId)!, storyIds: [read(storyId)!] });
    };
  });

  createEffect(
    depsOf(() => [loadStoryThrottled(), read(story), read(storyId), read(peerId)] as const),
    ([loadStoryThrottled2, story2, storyId2, peerId2]) => {
      const shouldLoadStory = !story2 || !('content' in story2 || 'isDeleted' in story2);
      if (peerId2 && storyId2 && shouldLoadStory) {
        loadStoryThrottled2();
      }
    },
  );
}

export default useEnsureStory;
