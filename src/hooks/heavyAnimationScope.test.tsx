// Original file (not in telegram-tt): hooks that tt froze for EVERY heavy animation must hear a root animation while they
// live under a scope of their own (a Transition slide, a HeavyAnimationScope).
import { beginHeavyAnimation, flushSync } from 'frameact';
import { HeavyAnimationScope, render } from 'frameact/dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { container, useDomHarness } from '../lib/kit/testing/dom';
import { useIntersectionObserver } from './useIntersectionObserver';

import useVideoAutoPause from '../components/middle/message/hooks/useVideoAutoPause';

vi.mock('./window/useBackgroundMode', () => ({ default: () => undefined, isBackgroundModeActive: () => false }));

const { frame } = useDomHarness();
let observerCallback: IntersectionObserverCallback | undefined;

beforeEach(() => {
  observerCallback = undefined;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it('useIntersectionObserver: a root animation freezes the callbacks of an observer under a scope until it ends', async () => {
  const rootCallback = vi.fn();
  let observe!: ReturnType<typeof useIntersectionObserver>['observe'];
  const dispose = render(
    () => (
      <HeavyAnimationScope>
        {(() => {
          ({ observe } = useIntersectionObserver({ rootRef: undefined }, rootCallback));
          return <div />;
        })()}
      </HeavyAnimationScope>
    ),
    container(),
  );
  flushSync();
  observe(document.createElement('div'));

  const endRoot = beginHeavyAnimation(Infinity);
  observerCallback!(
    [{ target: document.createElement('div') } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
  expect(rootCallback).not.toHaveBeenCalled();

  endRoot();
  await frame();
  expect(rootCallback).toHaveBeenCalledTimes(1);
  dispose();
});

it('useVideoAutoPause: a root animation pauses a playing video under a scope and its end resumes it', async () => {
  const video = document.createElement('video');
  document.body.append(video);
  const play = vi.fn(() => Promise.resolve());
  const pause = vi.fn();
  Object.assign(video, { play, pause });
  const dispose = render(
    () => (
      <HeavyAnimationScope>
        {(() => {
          useVideoAutoPause(
            () => video,
            () => true,
          );
          return <div />;
        })()}
      </HeavyAnimationScope>
    ),
    container(),
  );
  flushSync();
  await frame();
  play.mockClear();

  const endRoot = beginHeavyAnimation(Infinity);
  expect(pause).toHaveBeenCalled();

  endRoot();
  await frame();
  expect(play).toHaveBeenCalled();
  dispose();
  video.remove();
});
