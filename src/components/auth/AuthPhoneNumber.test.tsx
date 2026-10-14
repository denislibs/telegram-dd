// AuthPhoneNumber's phone field is controlled (InputText -> `use:value`): a keystroke the formatter drops is rolled
// back to the formatted number, and the formatted number (a write the user did not type) reaches the DOM.
import { flushSync } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { setGlobal } from '../../global';

import { installControlledInputListeners } from '../../lib/kit/controlledInputs';
import { container, useDomHarness } from '../../lib/kit/testing/dom';
import { flushMicrotasks } from '../../lib/kit/testing/micro';
import { INITIAL_GLOBAL_STATE } from '../../global/initialState';

import AuthPhoneNumber from './AuthPhoneNumber';

vi.mock('../../util/fonts', () => ({ default: () => undefined }));
vi.mock('../../util/files', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  preloadImage: () => Promise.resolve(),
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
  installControlledInputListeners();
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
  input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  flushSync();
};

it('the phone field follows the formatted number: a dropped keystroke is rolled back, an accepted one stays', async () => {
  const el = host();
  const dispose = render(() => <AuthPhoneNumber />, el);
  await flushMicrotasks();
  await frame();
  const input = el.querySelector('#sign-in-phone-number') as HTMLInputElement;
  expect(input).toBeTruthy();

  type(input, '1234');
  expect(input.value).toBe('123 4'); // the signal holds the formatted number; the field shows it

  type(input, '123 4x'); // the formatter drops 'x': the number is unchanged, so the DOM must go back to it
  expect(input.value).toBe('123 4');

  type(input, '123 45'); // accepted keystrokes still go through
  expect(input.value).toBe('123 45');
  dispose();
});
