// RangeSlider's native <input type="range"> is controlled (`use:value`, as InputText's input is): an input the
// handler does not accept is rolled back, a programmatic change of the value prop reaches the DOM.
import { createSignal, flushSync } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { setGlobal } from '../../global';

import { container, useDomHarness } from '../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE } from '../../global/initialState';

import RangeSlider from './RangeSlider';

beforeAll(() => {
  setGlobal(structuredClone(INITIAL_GLOBAL_STATE));
});

useDomHarness();
const violations: string[] = [];
const host = () => suppressStrict(container);

beforeEach(() => {
  violations.length = 0;
  delegateEvents(['click', 'input']);
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}]`));
});
afterEach(() => {
  setHandler();
  disableStrict();
  expect(violations).toEqual([]);
});

const drag = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
};

it('an accepted input stays, a programmatic change of the value prop updates the DOM', () => {
  const el = host();
  const [value, setValue] = createSignal(20);
  const onChange = vi.fn((next: number) => setValue(next));
  const dispose = render(() => <RangeSlider min={0} max={100} step={10} value={value()} onChange={onChange} />, el);
  const input = el.querySelector('input')!;
  expect(input.value).toBe('20');

  drag(input, '60');
  expect(onChange).toHaveBeenLastCalledWith(60);
  expect(input.value).toBe('60');

  setValue(90);
  flushSync();
  expect(input.value).toBe('90');
  dispose();
});

it('an input the handler rejects is rolled back to the prop value', () => {
  const el = host();
  const [value] = createSignal(30);
  const onChange = vi.fn();
  const dispose = render(() => <RangeSlider min={0} max={100} value={value()} onChange={onChange} />, el);
  const input = el.querySelector('input')!;
  expect(input.value).toBe('30');

  drag(input, '70');
  expect(onChange).toHaveBeenCalledWith(70);
  expect(input.value).toBe('30');
  dispose();
});

it('the value is written after min / max / step, so it is not clamped by the default range', () => {
  const el = host();
  const dispose = render(() => <RangeSlider min={1} max={4} step={1} value={3} onChange={() => undefined} />, el);
  expect(el.querySelector('input')!.value).toBe('3');
  dispose();
});
