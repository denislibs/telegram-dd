// TextTimer: tt re-rendered on a force update; here a tick signal re-reads the server time.
import { createSignal } from 'frameact';
import { render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { setGlobal } from '../../global';

import { container, useDomHarness } from '../../lib/kit/testing/dom';
import { flushMicrotasks } from '../../lib/kit/testing/micro';
import { INITIAL_GLOBAL_STATE } from '../../global/initialState';

import TextTimer from './TextTimer';

beforeAll(() => {
  setGlobal(structuredClone(INITIAL_GLOBAL_STATE));
});

const { frame } = useDomHarness();
const violations: string[] = [];

beforeEach(() => {
  violations.length = 0;
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}]`));
});

afterEach(() => {
  vi.useRealTimers();
  setHandler();
  disableStrict();
  expect(violations).toEqual([]);
});

it('TextTimer: counts down, calls onEnd once at zero and hides itself unless asked to show zero', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  const nowSeconds = Math.floor(Date.now() / 1000);
  const el = suppressStrict(container);
  const onEnd = vi.fn();
  const [endsAt, setEndsAt] = createSignal(nowSeconds + 3);
  const dispose = render(() => <TextTimer className="t" endsAt={endsAt()} onEnd={onEnd} />, el);
  await flushMicrotasks();
  await frame();
  expect(el.querySelector('.t')!.textContent).toBe('0:03');

  vi.advanceTimersByTime(1100);
  await flushMicrotasks();
  await frame();
  // AnimatedCounter keeps the previous digit while it animates
  expect(el.querySelector('.t')!.textContent).toMatch(/^0:02/);
  expect(onEnd).not.toHaveBeenCalled();

  vi.advanceTimersByTime(2000);
  await flushMicrotasks();
  await frame();
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(el.querySelector('.t')).toBeNull();

  // a new deadline brings it back
  setEndsAt(Math.floor(Date.now() / 1000) + 3600 + 5);
  await flushMicrotasks();
  await frame();
  expect(el.querySelector('.t')!.textContent).toBe('1:00:05');
  dispose();
});

it('TextTimer: shows zero on end when asked to, and the rounded mode switches to a countdown text', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  const nowSeconds = Math.floor(Date.now() / 1000);
  const el = suppressStrict(container);
  const dispose = render(
    () => (
      <>
        <TextTimer className="zero" endsAt={nowSeconds - 5} shouldShowZeroOnEnd />
        <TextTimer className="rounded" endsAt={nowSeconds + 3 * 24 * 3600} mode="rounded" />
      </>
    ),
    el,
  );
  await flushMicrotasks();
  await frame();
  expect(el.querySelector('.zero')!.textContent).toBe('0:00');
  expect(el.querySelector('.rounded')!.textContent).not.toMatch(/^\d+:\d\d$/);
  dispose();
});
