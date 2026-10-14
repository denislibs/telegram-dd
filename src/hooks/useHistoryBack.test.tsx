// Original file (not in telegram-tt): a record is closed when its component is disposed in the same tick `isActive`
// turns false (`<Show when={isOpen}><X isOpen={isOpen}/></Show>`), as tt's unmount cleanup did.
import { createSignal } from 'frameact';
import { render, Show } from 'frameact/dom';
import { expect, it, vi } from 'vitest';

import { container, useDomHarness } from '../lib/kit/testing/dom';
import { flushMicrotasks } from '../lib/kit/testing/micro';
import useHistoryBack from './useHistoryBack';

const { frame } = useDomHarness();
const win = window as unknown as { TEST_getHistoryCursor: () => number };

const settle = async () => {
  await flushMicrotasks();
  await frame();
  await flushMicrotasks();
  await frame();
  await flushMicrotasks();
};

function Panel(props: { isOpen: boolean }) {
  useHistoryBack({ isActive: () => props.isOpen, onBack: () => undefined });
  return <div />;
}

it('closes its history record when it is disposed together with isActive turning false', async () => {
  vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
  const [open, setOpen] = createSignal(false);
  const dispose = render(
    () => (
      <Show when={open()}>
        <Panel isOpen={open()} />
      </Show>
    ),
    container(),
  );
  await settle();

  setOpen(true);
  await settle();
  const opened = win.TEST_getHistoryCursor();
  expect(opened).toBeGreaterThanOrEqual(1);

  setOpen(false);
  await settle();
  expect(win.TEST_getHistoryCursor()).toBe(opened - 1);
  dispose();
});
