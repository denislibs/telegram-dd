import { clearDelegatedEvents } from 'frameact/dom';
import { afterEach, beforeAll, beforeEach } from 'vitest';

import { frame as fireFrame } from './frame';
import { flushMicrotasks } from './micro';
import { installFakeRaf } from './raf';

/**
 * Per-file DOM harness: fake rAF (frames fire only through `frame()`), pending frames drained in
 * afterEach (fasterdom/fastRaf throttle state is module-global), body cleared.
 */
export function useDomHarness() {
  let raf: ReturnType<typeof installFakeRaf>;
  // A module imported by the file (util/windowSize through the swipe controller, ...) may book a frame on the REAL rAF at
  // import; until that frame ran, the scheduler would not ask the fake rAF installed below for another one.
  beforeAll(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
  beforeEach(() => {
    raf = installFakeRaf();
  });
  afterEach(async () => {
    for (let i = 0; i < 10 && raf.pending(); i++) {
      raf.frame();
      await flushMicrotasks();
    }
    raf.uninstall();
    clearDelegatedEvents();
    document.body.textContent = '';
  });
  return {
    frame: () => fireFrame(raf),
    pending: () => raf.pending(),
  };
}

/** An attached, empty container. */
export function container(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}
