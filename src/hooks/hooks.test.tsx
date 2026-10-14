// Original file (not in telegram-tt): the accessor contract of the ported hooks (porting guide §4.2).
import { createSignal, flushSync } from 'frameact';
import { render } from 'frameact/dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { container, useDomHarness } from '../lib/kit/testing/dom';
import { flushMicrotasks } from '../lib/kit/testing/micro';
import useInterval from './schedulers/useInterval';
import useTimeout from './schedulers/useTimeout';
import useColorFilter from './stickers/useColorFilter';
import useAsync from './useAsync';
import useThrottledCallback from './useThrottledCallback';

const { frame } = useDomHarness();

beforeEach(() => {
  document.querySelectorAll('.svg-definitions').forEach((node) => node.remove());
});

afterEach(() => {
  vi.useRealTimers();
});

it('useAsync: re-runs when an accessor dependency changes and drops the stale result', async () => {
  const [id, setId] = createSignal(1);
  const resolvers: Record<number, (value: string) => void> = {};
  let result!: () => string | undefined;
  const dispose = render(() => {
    ({ result } = useAsync(
      () => new Promise<string>((resolve) => (resolvers[id()] = resolve)),
      () => [id()],
    ));
    return <div />;
  }, container());
  flushSync();
  expect(Object.keys(resolvers)).toEqual(['1']);

  setId(2);
  flushSync();
  expect(Object.keys(resolvers)).toEqual(['1', '2']);

  resolvers[1]('stale');
  await flushMicrotasks();
  expect(result()).toBeUndefined();
  resolvers[2]('fresh');
  await flushMicrotasks();
  expect(result()).toBe('fresh');
  dispose();
});

it('useTimeout and useInterval follow an accessor delay', () => {
  vi.useFakeTimers();
  const [delay, setDelay] = createSignal<number | undefined>(undefined);
  const onTimeout = vi.fn();
  const onInterval = vi.fn();
  const dispose = render(() => {
    useTimeout(onTimeout, delay);
    useInterval(onInterval, delay, true);
    return <div />;
  }, container());
  flushSync();
  vi.advanceTimersByTime(1000);
  expect(onTimeout).not.toHaveBeenCalled();
  expect(onInterval).not.toHaveBeenCalled();

  setDelay(100);
  flushSync();
  vi.advanceTimersByTime(350);
  expect(onTimeout).toHaveBeenCalledTimes(1);
  expect(onInterval).toHaveBeenCalledTimes(3);

  setDelay(undefined);
  flushSync();
  vi.advanceTimersByTime(1000);
  expect(onInterval).toHaveBeenCalledTimes(3);
  dispose();
});

it('useThrottledCallback: one stable throttled function', () => {
  vi.useFakeTimers();
  const fn = vi.fn();
  let throttled!: () => void;
  const dispose = render(() => {
    throttled = useThrottledCallback(fn, [], 100);
    return <div />;
  }, container());
  throttled();
  throttled();
  expect(fn).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(150);
  expect(fn).toHaveBeenCalledTimes(2);
  dispose();
});

it('useColorFilter: one svg definition per color, released with the owner', async () => {
  const [color, setColor] = createSignal<string | undefined>('#ff0000');
  let style!: () => string | undefined;
  const dispose = render(() => {
    style = useColorFilter(color);
    return <div style={style()} />;
  }, container());
  flushSync();
  frame();
  await flushMicrotasks();
  expect(style()).toBe('filter: url(#color-filter-ff0000);');
  expect(document.getElementById('color-filter-ff0000')?.tagName.toLowerCase()).toBe('filter');

  setColor('#00ff00');
  flushSync();
  expect(style()).toBe('filter: url(#color-filter-00ff00);');
  frame();
  await flushMicrotasks();
  expect(document.getElementById('color-filter-ff0000')).toBeNull();
  expect(document.getElementById('color-filter-00ff00')).not.toBeNull();

  dispose();
  frame();
  await flushMicrotasks();
  expect(document.getElementById('color-filter-00ff00')).toBeNull();
});
