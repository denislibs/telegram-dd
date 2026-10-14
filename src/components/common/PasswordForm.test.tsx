// PasswordForm: values tt re-read on every render (the focus delay of the layout, the submit handler of the parent) follow
// their source here too.
import { createSignal, flushSync } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { setGlobal } from '../../global';

import { container, useDomHarness } from '../../lib/kit/testing/dom';
import { flushMicrotasks } from '../../lib/kit/testing/micro';
import { INITIAL_GLOBAL_STATE } from '../../global/initialState';

import PasswordForm from './PasswordForm';

const layout = vi.hoisted(() => ({
  isMobile: undefined as unknown as { get: () => boolean; set: (v: boolean) => void },
}));
vi.mock('../../hooks/useAppLayout', async () => {
  const { createSignal: signal } = await import('frameact');
  const [isMobile, setIsMobile] = signal(false);
  layout.isMobile = { get: isMobile, set: setIsMobile };
  return {
    default: () => ({
      isMobile,
      isTablet: () => false,
      isLandscape: () => false,
      isDesktop: () => true,
      isTouchScreen: () => false,
    }),
  };
});

const { frame } = useDomHarness();
const violations: string[] = [];
const host = () => suppressStrict(container);

beforeAll(() => {
  setGlobal(structuredClone(INITIAL_GLOBAL_STATE));
});
beforeEach(() => {
  violations.length = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  delegateEvents(['click', 'input']);
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}]`));
});
afterEach(() => {
  vi.useRealTimers();
  setHandler();
  disableStrict();
  expect(violations).toEqual([]);
});

const noop = () => undefined;

it('the focus delay follows the layout: 400 ms on desktop, 550 ms once the layout turns mobile', async () => {
  layout.isMobile.set(false);
  const el = host();
  const dispose = render(() => <PasswordForm onClearError={noop} onChangePasswordVisibility={noop} />, el);
  await flushMicrotasks();
  await frame();
  const input = el.querySelector('input.form-control') as HTMLInputElement;
  const focus = vi.spyOn(input, 'focus');

  vi.advanceTimersByTime(300);
  layout.isMobile.set(true); // the timer restarts with the new delay
  flushSync();
  vi.advanceTimersByTime(300);
  await frame();
  expect(focus).not.toHaveBeenCalled(); // a delay read once (400 ms) would have fired by now

  vi.advanceTimersByTime(300);
  await frame();
  expect(focus).toHaveBeenCalled();
  dispose();
});

it('a submit handler that the parent adds later is used (tt re-bound the form handler on every render)', async () => {
  const el = host();
  const [onSubmit, setOnSubmit] = createSignal<((password: string) => void) | undefined>(undefined);
  const dispose = render(
    () => <PasswordForm onClearError={noop} onChangePasswordVisibility={noop} onSubmit={onSubmit()} />,
    el,
  );
  await flushMicrotasks();
  await frame();
  const submitted = vi.fn();
  setOnSubmit(() => submitted);
  flushSync();

  const input = el.querySelector('input.form-control') as HTMLInputElement;
  input.value = 'correct horse';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  const form = el.querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  expect(submitted).toHaveBeenCalledWith('correct horse');
  dispose();
});
