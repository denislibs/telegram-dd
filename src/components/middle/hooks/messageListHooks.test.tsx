// Original file (not in telegram-tt): the hooks of the message list that were rewritten for frameact.
import { createSignal, flushSync } from 'frameact';
import { render } from 'frameact/dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setGlobal } from '../../../global';

import { INITIAL_GLOBAL_STATE } from '../../../global/initialState';
import { useDebouncedSignal, useThrottledSignal } from '../../../hooks/useAsyncResolvers';
import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { flushMicrotasks } from '../../../lib/kit/testing/micro';
import { cloneDeep } from '../../../util/iteratees';
import usePinnedMessage from './usePinnedMessage';

useDomHarness();

beforeAll(() => {
  setGlobal(cloneDeep(INITIAL_GLOBAL_STATE), { forceOutdated: true });
});

afterEach(() => {
  vi.useRealTimers();
});

function mount<T>(setup: () => T): { result: T; dispose: () => void } {
  let result!: T;
  const dispose = render(() => {
    result = setup();
    return <div />;
  }, container());
  return { result, dispose };
}

describe('usePinnedMessage', () => {
  it('follows the first viewport message through the pinned ids (newest first) and clamps the index', async () => {
    const [chatId, setChatId] = createSignal<string | undefined>('1');
    const [pinnedIds, setPinnedIds] = createSignal<number[] | undefined>([50, 30, 10]);
    const { result, dispose } = mount(() => usePinnedMessage(chatId, () => 1, pinnedIds));
    flushSync();

    expect(result.getCurrentPinnedIndex()).toBe(0);

    result.handleIntersectPinnedMessage({ firstViewportId: 25 });
    expect(result.getCurrentPinnedIndex()).toBe(2); // the first pinned id older than the viewport top: 10

    result.handleIntersectPinnedMessage({ firstViewportId: 100 });
    expect(result.getCurrentPinnedIndex()).toBe(0);

    // the list shrinks under the index: it is clamped
    result.handleIntersectPinnedMessage({ firstViewportId: 25 });
    expect(result.getCurrentPinnedIndex()).toBe(2);
    setPinnedIds([50]);
    flushSync();
    await flushMicrotasks();
    expect(result.getCurrentPinnedIndex()).toBe(0);

    // an empty list does not loop (the effect follows the signal it writes)
    setPinnedIds([]);
    flushSync();
    await flushMicrotasks();
    expect(result.getCurrentPinnedIndex()).toBe(0);

    // the index is per chat key
    setPinnedIds([50, 30, 10]);
    setChatId('2');
    flushSync();
    expect(result.getCurrentPinnedIndex()).toBe(0);
    dispose();
  });

  it('a focus on a pinned message that is not loaded waits for the viewport to reach it', () => {
    const { result, dispose } = mount(() => usePinnedMessage('1', 1, [50, 30, 10]));
    flushSync();

    result.handleFocusPinnedMessage(50); // next pinned id: 30, which is not in the (empty) loaded lists
    expect(result.getLoadingPinnedId()).toBe(30);

    result.handleIntersectPinnedMessage({ shouldCancelWaiting: true });
    expect(result.getLoadingPinnedId()).toBeUndefined();
    dispose();
  });
});

describe('useDebouncedSignal / useThrottledSignal', () => {
  it('a debounced signal has the value at once, follows after the quiet period', async () => {
    vi.useFakeTimers();
    const [value, setValue] = createSignal(1);
    const { result, dispose } = mount(() => useDebouncedSignal(value, 200, true));
    flushSync();
    expect(result()).toBe(1);

    setValue(2);
    setValue(3);
    flushSync();
    await flushMicrotasks();
    expect(result()).toBe(1);
    vi.advanceTimersByTime(250);
    await flushMicrotasks();
    expect(result()).toBe(3);
    dispose();
  });

  it('a throttled signal follows at most once per period and ends on the last value', async () => {
    vi.useFakeTimers();
    const [value, setValue] = createSignal(0);
    const { result, dispose } = mount(() => useThrottledSignal(value, 100));
    flushSync();
    await flushMicrotasks();

    setValue(1);
    flushSync();
    await flushMicrotasks();
    setValue(2);
    setValue(3);
    flushSync();
    await flushMicrotasks();
    vi.advanceTimersByTime(150);
    await flushMicrotasks();
    expect(result()).toBe(3);
    dispose();
  });
});
