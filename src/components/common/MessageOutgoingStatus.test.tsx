// Original test (not in telegram-tt): the outgoing status is a plain icon in the DOM of a `Transition` until it changes, then the
// real `Transition` takes over and shows the new status.
import { createSignal, flushSync } from 'frameact';
import { render } from 'frameact/dom';
import { describe, expect, it } from 'vitest';

import type { ApiMessageOutgoingStatus } from '../../api/types';

import { container, useDomHarness } from '../../lib/kit/testing/dom';

import MessageOutgoingStatus from './MessageOutgoingStatus';

describe('MessageOutgoingStatus', () => {
  const harness = useDomHarness();

  const frames = async () => {
    for (let i = 0; i < 4; i++) await harness.frame();
  };

  it('renders the icon of the status in the wrapper and the slide of a Transition', async () => {
    const el = container();
    const dispose = render(() => <MessageOutgoingStatus status="succeeded" />, el);
    await frames();

    expect(el.innerHTML).toBe(
      '<div class="MessageOutgoingStatus"><div class="Transition"><div class="Transition_slide Transition_slide-active">' +
        '<i class="icon icon-check" aria-hidden="true"></i></div></div></div>',
    );
    dispose();
  });

  // (the kit's Transition animates by transitionend, which jsdom never sends: one change per component here)
  it.each([
    ['succeeded', '.icon-check'],
    ['read', '.icon-message-read'],
    ['failed', '.MessageOutgoingStatus--failed .icon-message-failed'],
  ] as const)('shows the status %s that the message gets later', async (next, selector) => {
    const [status, setStatus] = createSignal<ApiMessageOutgoingStatus>('pending');
    const el = container();
    const dispose = render(() => <MessageOutgoingStatus status={status()} />, el);
    await frames();
    expect(el.querySelector('.icon-message-pending')).not.toBeNull();

    setStatus(next);
    flushSync();
    await frames();
    expect(el.querySelector(selector)).not.toBeNull();
    dispose();
  });

  it('renders a failed message with its wrapper at once', async () => {
    const el = container();
    const dispose = render(() => <MessageOutgoingStatus status="failed" />, el);
    await frames();
    expect(
      el.querySelector('.Transition_slide-active .MessageOutgoingStatus--failed .icon-message-failed'),
    ).not.toBeNull();
    dispose();
  });
});
