// The codemod proof: Spinner, Loading, Link and RippleEffect were produced by `pnpm codemod` from telegram-tt without
// manual edits (docs/codemod.md). They must render, react and stay stricterdom-clean under jsdom.
import { flushSync } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { container, useDomHarness } from '../../lib/kit/testing/dom';
import { flushMicrotasks } from '../../lib/kit/testing/micro';

import Link from './Link';
import Loading from './Loading';
import RippleEffect from './RippleEffect';
import Spinner from './Spinner';

const { frame } = useDomHarness();
const violations: string[] = [];

/** An attached container; its own append is a test-time write, not the component's. */
const host = () => suppressStrict(container);

beforeEach(() => {
  violations.length = 0;
  // The compiled modules register their delegated events once, at load; the harness clears delegation after every test.
  delegateEvents(['click']);
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}]`));
});

afterEach(() => {
  vi.useRealTimers();
  setHandler();
  disableStrict();
  expect(violations).toEqual([]);
});

it('Spinner: defaults through mergeProps, class tokens from props', () => {
  const el = host();
  const dispose = render(() => <Spinner backgroundColor="dark" className="extra" />, el);
  const root = el.firstElementChild as HTMLDivElement;
  expect(root.classList.contains('Spinner')).toBe(true);
  expect(root.classList.contains('extra')).toBe(true);
  // `color` defaults to 'blue' (a CSS-module class) and backgroundColor adds the withBackground + darkBg classes
  expect(root.className).toMatch(/blue/);
  expect(root.className).toMatch(/withBackground/);
  expect(root.className).toMatch(/darkBg/);
  expect(root.querySelector('.Spinner__inner')).not.toBeNull();
  dispose();
});

it('Loading: an onClick prop makes it interactive and is delegated', () => {
  const el = host();
  const onClick = vi.fn();
  const dispose = render(() => <Loading onClick={onClick} />, el);
  const root = el.firstElementChild as HTMLDivElement;
  expect(root.classList.contains('interactive')).toBe(true);
  root.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(root.querySelector('.Spinner')).not.toBeNull();
  dispose();
});

it('Link: prevents the default navigation and forwards the click', () => {
  const el = host();
  const onClick = vi.fn();
  const dispose = render(
    () => (
      <Link isPrimary isRtl onClick={onClick}>
        hello
      </Link>
    ),
    el,
  );
  const link = el.firstElementChild as HTMLAnchorElement;
  expect(link.textContent).toBe('hello');
  expect(link.getAttribute('dir')).toBe('rtl');
  expect(link.classList.contains('Link')).toBe(true);
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(event);
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(event.defaultPrevented).toBe(true);
  dispose();
});

it('RippleEffect: a mousedown on the parent adds a wave (signal → <For>), the debounce clears it', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const el = host();
  const dispose = render(
    () => (
      <button type="button" class="Button">
        <RippleEffect />
      </button>
    ),
    el,
  );
  await flushMicrotasks();
  await frame(); // onMount: the listener on the parent
  const button = el.firstElementChild as HTMLButtonElement;
  const ripple = button.querySelector('.ripple-container')!;
  expect(ripple).not.toBeNull();
  expect(ripple.querySelectorAll('.ripple-wave')).toHaveLength(0);

  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
  flushSync();
  expect(ripple.querySelectorAll('.ripple-wave')).toHaveLength(1);
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 12, clientY: 12 }));
  flushSync();
  expect(ripple.querySelectorAll('.ripple-wave')).toHaveLength(2);

  vi.advanceTimersByTime(800);
  flushSync();
  expect(ripple.querySelectorAll('.ripple-wave')).toHaveLength(0);
  dispose();
});
