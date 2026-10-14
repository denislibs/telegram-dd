import { expect, it } from 'vitest';

import * as kit from './index';

it('the kit exposes its public components and primitives', () => {
  for (const name of [
    'waitForAnimationEnd',
    'waitForTransitionEnd',
    'createShowTransition',
    'createMediaTransition',
    'ShowTransition',
    'Transition',
    'createScrollAnchor',
    'InfiniteScroll',
  ]) {
    expect(typeof (kit as Record<string, unknown>)[name], name).toBe('function');
  }
});
