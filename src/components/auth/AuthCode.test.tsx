// AuthCode over the real InputText with the monkey replaced by a probe of its props: typing and backspacing set the tracking direction
// from the code BEFORE the edit (tt reads the closure value; a frameact signal is already the new one after its write).
import { flushSync } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { setGlobal } from '../../global';

import { container, useDomHarness } from '../../lib/kit/testing/dom';
import { flushMicrotasks } from '../../lib/kit/testing/micro';
import { INITIAL_GLOBAL_STATE } from '../../global/initialState';

import AuthCode from './AuthCode';

vi.mock('../common/TrackingMonkey', () => ({
  default: (props: object) => {
    (globalThis as unknown as { __monkey: object }).__monkey = props; // props are live getters
    return document.createElement('i');
  },
}));

const { frame } = useDomHarness();
const violations: string[] = [];
const host = () => suppressStrict(container);

beforeAll(() => {
  setGlobal(structuredClone(INITIAL_GLOBAL_STATE));
});
beforeEach(() => {
  violations.length = 0;
  delegateEvents(['click', 'input', 'keydown']);
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}]`));
});
afterEach(() => {
  setHandler();
  disableStrict();
  expect(violations).toEqual([]);
});

const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
};
const monkey = () =>
  (globalThis as unknown as { __monkey: { trackingDirection: number; isTracking: boolean; code: string } }).__monkey;

it('typing tracks forward, deleting a digit tracks backward, the code is cut to 5 digits', async () => {
  const el = host();
  const dispose = render(() => <AuthCode />, el);
  await flushMicrotasks();
  await frame();
  const input = el.querySelector('#sign-in-code') as HTMLInputElement;

  type(input, '12');
  expect(monkey().isTracking).toBe(true);
  expect(monkey().trackingDirection).toBe(1);
  expect(monkey().code).toBe('12');

  type(input, '1');
  expect(monkey().trackingDirection).toBe(-1);

  type(input, '1234567');
  expect(input.value).toBe('12345');
  expect(monkey().trackingDirection).toBe(1);

  type(input, '');
  expect(monkey().isTracking).toBe(false);
  dispose();
});
