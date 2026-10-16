// Original test (not in telegram-tt): a click on the search surface focuses the input from a mutation task, as tt did;
// `focus()` is a layout read, so it must not be reported by stricterdom (it runs under `forceMeasure`).
import { delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { setGlobal } from '../../../global';

import type { ApiEmojiGroup } from '../../../api/types';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';

import EmojiSearch from './EmojiSearch';

const { frame } = useDomHarness();
const violations: string[] = [];
let dispose: (() => void) | undefined;

class ResizeObserverStub {
  observe = () => undefined;

  unobserve = () => undefined;

  disconnect = () => undefined;
}
globalThis.ResizeObserver ??= ResizeObserverStub;

beforeAll(() => {
  const tabId = getCurrentTabId();
  setGlobal(
    { ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: { ...cloneDeep(INITIAL_TAB_STATE), id: tabId } } },
    { forceOutdated: true },
  );
});

beforeEach(() => {
  violations.length = 0;
  delegateEvents(['click']);
});

afterEach(() => {
  setHandler();
  disableStrict();
  dispose?.();
  dispose = undefined;
});

it('a click on the search surface focuses the input without a stricterdom violation', async () => {
  const host = suppressStrict(container);
  // The search surface is shown with the chips of the emoji groups
  const groups = [{ title: 'Love', iconEmojiId: '1', emoticons: ['❤'] }] as unknown as ApiEmojiGroup[];
  dispose = render(
    () => <EmojiSearch value="" groups={groups} onChange={() => undefined} onGroupSelect={() => undefined} />,
    host,
  );
  await frame();
  await frame();

  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}]`));
  const input = host.querySelector('input')!;
  // The innermost element that shows the placeholder text
  const surface = [...host.querySelectorAll<HTMLElement>('div')].findLast((div) => div.textContent === 'SearchEmoji')!;
  expect(surface).toBeDefined();
  surface.click();
  await frame();
  await frame();

  expect(document.activeElement).toBe(input);
  expect(violations).toEqual([]);
});
