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

// Dependency direction (review m4): the kit may use two app modules (the DOM natives and tt's swipe controller, ported to
// src/util); the app's util never imports the kit, so there is no cycle and the kit's chunk pulls in nothing but those.
const utilSources = import.meta.glob('../../util/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const kitSources = import.meta.glob(['./*.ts', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const importsOf = (source: string) => Array.from(source.matchAll(/from '([^']+)'/g), (m) => m[1]);

it('src/util never imports the kit', () => {
  const offenders = Object.entries(utilSources)
    .filter(([, source]) => importsOf(source).some((path) => /lib\/kit/.test(path)))
    .map(([file]) => file);
  expect(offenders).toEqual([]);
});

it('the kit imports from the app only the DOM natives and the swipe controller', () => {
  const outside = Object.entries(kitSources).flatMap(([file, source]) =>
    importsOf(source)
      .filter((path) => path.startsWith('../'))
      .map((path) => `${file.slice(2)} -> ${path}`),
  );
  expect(outside.sort()).toEqual([
    'animationEnd.ts -> ../../util/dom/natives',
    'infiniteScroll.ts -> ../../util/dom/natives',
    'showTransition.ts -> ../../util/dom/natives',
    'transition.ts -> ../../util/dom/natives',
    'transition.ts -> ../../util/swipeController',
  ]);
});
