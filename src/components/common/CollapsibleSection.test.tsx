// Original test (not in telegram-tt): CollapsibleSection starts collapsed with a zero height, expands and collapses on
// toggle, and reports the state through aria attributes.
import { createSignal } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { container, useDomHarness } from '../../lib/kit/testing/dom';

import CollapsibleSection from './CollapsibleSection';

const harness = useDomHarness();
const violations: string[] = [];

beforeEach(() => {
  violations.length = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  delegateEvents(['click', 'keydown']);
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}]`));
});

afterEach(() => {
  vi.useRealTimers();
  setHandler();
  disableStrict();
});

it('applies the collapsed height at mount, animates on toggle and keeps the aria state', async () => {
  const el = suppressStrict(container);
  const [isCollapsed, setIsCollapsed] = createSignal(true);
  const dispose = render(
    () => (
      <CollapsibleSection
        title="Results"
        isCollapsed={isCollapsed()}
        onToggle={() => setIsCollapsed((value) => !value)}
      >
        <p>content</p>
      </CollapsibleSection>
    ),
    el,
  );
  for (let i = 0; i < 3; i++) await harness.frame();

  const header = el.querySelector<HTMLElement>('[role="button"]')!;
  const content = el.querySelector<HTMLElement>('div[aria-hidden]')!;
  expect(content.style.height).toBe('0px');
  expect(header.getAttribute('aria-expanded')).toBe('false');
  expect(content.getAttribute('aria-hidden')).toBe('true');

  header.click();
  expect(isCollapsed()).toBe(false);
  for (let i = 0; i < 3; i++) await harness.frame();
  expect(header.getAttribute('aria-expanded')).toBe('true');
  expect(content.getAttribute('aria-hidden')).toBe('false');
  // The transition ends with the height released (the end arrives through the fallback timer in jsdom)
  vi.advanceTimersByTime(500);
  for (let i = 0; i < 3; i++) await harness.frame();
  expect(content.style.height).toBe('');

  header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  expect(isCollapsed()).toBe(true);
  for (let i = 0; i < 6; i++) await harness.frame();
  expect(content.style.height).toBe('0px');

  dispose();
  expect(violations).toEqual([]);
});
