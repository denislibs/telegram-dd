// Original test (not in telegram-tt): `useMediaWithLoadProgress` against the real `mediaLoader` with a stubbed `callApi`: progress
// events, `noLoad` that cancels a running load, the minimum delay, a hash that changes in flight, the streaming URL.
import { createSignal, flushSync } from 'frameact';
import { render } from 'frameact/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiMediaFormat } from '../api/types';

import { container } from '../lib/kit/testing/dom';
import { flushMicrotasks } from '../lib/kit/testing/micro';
import * as mediaLoader from '../util/mediaLoader';
import useMediaWithLoadProgress from './useMediaWithLoadProgress';

const api = vi.hoisted(() => ({ callApi: vi.fn(), cancelApiProgress: vi.fn() }));

vi.mock('../api/gramjs', () => api);
vi.mock('../util/cacheApi', () => ({
  Type: { Blob: 0, Text: 1 },
  fetch: vi.fn(() => Promise.resolve(undefined)),
  save: vi.fn(() => Promise.resolve(true)),
  remove: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('./data/useSelector', () => ({ default: () => () => true }));

type Pending = { url: string; onProgress: (progress: number) => void; resolve: (value: unknown) => void };
let pending: Pending[] = [];
let counter = 0;

beforeEach(() => {
  pending = [];
  api.callApi.mockImplementation(
    (_name: string, params: { url: string }, onProgress: (progress: number) => void) =>
      new Promise((resolve) => {
        pending.push({ url: params.url, onProgress, resolve });
      }),
  );
  api.cancelApiProgress.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  mediaLoader.clearMemoryCache();
});

// a hash no other test used: the loader keeps what it loaded for the session
const hashOf = (name: string) => `${name}-${++counter}`;

function mount(
  hash: () => string | undefined,
  noLoad: () => boolean,
  options: { format?: ApiMediaFormat; delay?: number } = {},
) {
  let result!: ReturnType<typeof useMediaWithLoadProgress>;
  const dispose = render(() => {
    result = useMediaWithLoadProgress(hash, noLoad, options.format, options.delay);
    return <div />;
  }, container());
  flushSync();
  return { result, dispose };
}

async function settle() {
  flushSync();
  await flushMicrotasks();
  flushSync();
}

const answer = (index: number, data = 'blob:loaded') =>
  pending[index].resolve({ dataBlob: data, mimeType: 'image/jpeg' });

describe('useMediaWithLoadProgress', () => {
  it('does not load while noLoad is set and loads when it is cleared', async () => {
    const hash = hashOf('photo');
    const [noLoad, setNoLoad] = createSignal(true);
    const { result, dispose } = mount(() => hash, noLoad);

    expect(pending).toHaveLength(0);
    expect(result.mediaData()).toBeUndefined();
    expect(result.loadProgress()).toBe(0);

    setNoLoad(false);
    await settle();
    expect(pending).toHaveLength(1);

    answer(0);
    await flushMicrotasks();
    flushSync();
    expect(result.mediaData()).toBe('blob:loaded');
    dispose();
  });

  it('reports the progress of the load (throttled)', async () => {
    vi.useFakeTimers();
    const hash = hashOf('photo');
    const { result, dispose } = mount(
      () => hash,
      () => false,
    );
    await vi.advanceTimersByTimeAsync(0);
    await settle();
    expect(pending).toHaveLength(1);

    pending[0].onProgress(0.4);
    await vi.advanceTimersByTimeAsync(600);
    pending[0].onProgress(0.8);
    await vi.advanceTimersByTimeAsync(600);
    flushSync();
    expect(result.loadProgress()).toBeGreaterThan(0.3);
    dispose();
  });

  it('cancels the running load and resets the progress when noLoad is set again', async () => {
    const hash = hashOf('photo');
    const [noLoad, setNoLoad] = createSignal(false);
    const { result, dispose } = mount(() => hash, noLoad);
    await settle();
    expect(pending).toHaveLength(1);

    setNoLoad(true);
    await settle();
    expect(api.cancelApiProgress).toHaveBeenCalled();
    expect(result.loadProgress()).toBe(0);
    dispose();
  });

  it('starts a new load when the hash changes in flight', async () => {
    const [hash, setHash] = createSignal(hashOf('first'));
    const { result, dispose } = mount(hash, () => false);
    await settle();
    expect(pending).toHaveLength(1);

    const second = hashOf('second');
    setHash(second);
    await settle();
    expect(pending).toHaveLength(2);
    expect(pending[1].url).toBe(second);

    answer(0, 'blob:first');
    answer(1, 'blob:second');
    await flushMicrotasks();
    flushSync();
    expect(result.mediaData()).toBe('blob:second');
    dispose();
  });

  it('keeps the data back until the delay has passed', async () => {
    vi.useFakeTimers();
    const hash = hashOf('photo');
    const { result, dispose } = mount(
      () => hash,
      () => false,
      { delay: 1000 },
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    answer(0);
    await vi.advanceTimersByTimeAsync(10);
    flushSync();
    // the loader has the data, but the hook re-reads it only after the delay
    expect(mediaLoader.getFromMemory(hash)).toBe('blob:loaded');
    await vi.advanceTimersByTimeAsync(1100);
    flushSync();
    expect(result.mediaData()).toBe('blob:loaded');
    dispose();
  });

  it('takes a hash that is already in memory without a request', async () => {
    const hash = hashOf('cached');
    void mediaLoader.fetch(hash, ApiMediaFormat.BlobUrl);
    await flushMicrotasks();
    answer(0);
    await flushMicrotasks();
    {
      pending = [];
      const { result, dispose } = mount(
        () => hash,
        () => false,
      );
      expect(result.mediaData()).toBe('blob:loaded');
      expect(result.loadProgress()).toBe(1);
      expect(pending).toHaveLength(0);
      dispose();
    }
  });

  it('removes its progress callback when the hash changes', async () => {
    const spy = vi.spyOn(mediaLoader, 'removeCallback');
    const [hash, setHash] = createSignal<string | undefined>(hashOf('photo'));
    const first = hash();
    const { dispose } = mount(hash, () => false);
    flushSync();

    setHash(undefined);
    await settle();
    expect(spy).toHaveBeenCalledWith(first, expect.any(String));
    dispose();
    spy.mockRestore();
  });
});
