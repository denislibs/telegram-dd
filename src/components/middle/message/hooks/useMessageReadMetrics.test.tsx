// Original test (not in telegram-tt): the lifecycle and the report of the read metrics of a message.
import { createSignal, flushSync } from 'frameact';
import { render } from 'frameact/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { container, useDomHarness } from '../../../../lib/kit/testing/dom';
import useMessageReadMetrics from './useMessageReadMetrics';

const actions = vi.hoisted(() => ({ scheduleMessageReadMetricsReport: vi.fn() }));

vi.mock('../../../../global', () => ({ getActions: () => actions }));
vi.mock('../../../../hooks/window/useBackgroundMode', () => ({ isBackgroundModeActive: () => false }));

const END_GRACE_WAIT_MS = 400;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type ObserverEntry = { target: Element; isIntersecting: boolean };

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  observed = new Set<Element>();

  constructor(
    public callback: (entries: ObserverEntry[]) => void,
    public options: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.instances.push(this);
  }

  observe = (element: Element) => this.observed.add(element);

  unobserve = (element: Element) => this.observed.delete(element);

  disconnect = () => this.observed.clear();
}

class FakeResizeObserver {
  observe = vi.fn();

  unobserve = vi.fn();

  disconnect = vi.fn();
}

describe('useMessageReadMetrics', () => {
  const harness = useDomHarness();

  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    actions.scheduleMessageReadMetricsReport.mockClear();
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function setup() {
    const scroll = container();
    const messageElement = document.createElement('div');
    scroll.append(messageElement);
    const [isEnabled, setIsEnabled] = createSignal(true);
    const [isActive, setIsActive] = createSignal(true);
    const dispose = render(() => {
      useMessageReadMetrics({
        messageRef: () => messageElement,
        containerRef: () => scroll,
        chatId: '1',
        messageId: 42,
        isEnabled,
        isMessageListActive: isActive,
      });
      return <div />;
    }, container());
    flushSync();
    return { scroll, messageElement, setIsEnabled, setIsActive, dispose };
  }

  it('observes the message while it is enabled, one tracker per scroll container', () => {
    const { messageElement, setIsEnabled, dispose } = setup();
    const observer = FakeIntersectionObserver.instances[0];
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    expect(observer.observed.has(messageElement)).toBe(true);

    setIsEnabled(false);
    flushSync();
    expect(observer.observed.has(messageElement)).toBe(false);

    setIsEnabled(true);
    flushSync();
    expect(FakeIntersectionObserver.instances.flatMap((instance) => [...instance.observed])).toContain(messageElement);
    dispose();
  });

  it('reports the time in view when the message leaves the viewport', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { messageElement, dispose } = setup();
    const observer = FakeIntersectionObserver.instances[0];

    observer.callback([{ target: messageElement, isIntersecting: true }]);
    vi.advanceTimersByTime(1000);
    observer.callback([{ target: messageElement, isIntersecting: false }]);
    expect(actions.scheduleMessageReadMetricsReport).not.toHaveBeenCalled(); // the end grace period (real timer)

    await sleep(END_GRACE_WAIT_MS);
    expect(actions.scheduleMessageReadMetricsReport).toHaveBeenCalledTimes(1);
    const { chatId, metrics } = actions.scheduleMessageReadMetricsReport.mock.calls[0][0];
    expect(chatId).toBe('1');
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toEqual(expect.objectContaining({ messageId: 42, timeInViewMs: 1000 }));
    dispose();
    await harness.frame();
  });

  it('does not report a view shorter than the minimum', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { messageElement, dispose } = setup();
    const observer = FakeIntersectionObserver.instances[0];

    observer.callback([{ target: messageElement, isIntersecting: true }]);
    vi.advanceTimersByTime(100);
    observer.callback([{ target: messageElement, isIntersecting: false }]);
    await sleep(END_GRACE_WAIT_MS);
    expect(actions.scheduleMessageReadMetricsReport).not.toHaveBeenCalled();
    dispose();
  });

  it('removing the message from the list finishes its view and releases the tracker', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { messageElement, dispose } = setup();
    const observer = FakeIntersectionObserver.instances[0];

    observer.callback([{ target: messageElement, isIntersecting: true }]);
    vi.advanceTimersByTime(800);
    dispose();
    expect(actions.scheduleMessageReadMetricsReport).toHaveBeenCalledTimes(1);
    expect(observer.observed.size).toBe(0);
  });
});
