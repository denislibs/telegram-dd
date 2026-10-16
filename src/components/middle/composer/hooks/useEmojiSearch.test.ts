// Original test (not in telegram-tt): the search logic of `useEmojiSearch` (native emoji by keyword/name, the search
// intent of the server query, groups) and of the small hooks the emoji picker adds around it
// (`useTransitionActiveKey`, `useAsyncRendering`).
import { createRoot, createSignal, flushSync } from 'frameact';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setGlobal } from '../../../../global';

import { flushMicrotasks } from '../../../../lib/kit/testing/micro';
import { INITIAL_GLOBAL_STATE } from '../../../../global/initialState';
import { ensureEmojiData } from '../../../../util/emoji/emojiSearch';
import { cloneDeep } from '../../../../util/iteratees';
import useEmojiSearch from './useEmojiSearch';

import { useTransitionActiveKey } from '../../../../hooks/animations/useTransitionActiveKey';
import useAsyncRendering from '../../../right/hooks/useAsyncRendering';

const mocks = vi.hoisted(() => ({
  callApi: vi.fn(async (method: string): Promise<unknown> => {
    await Promise.resolve();
    if (method === 'searchEmojiStickerSets') return { sets: [] };
    if (method === 'searchStickersGlobal') return { stickers: [], nextOffset: undefined };
    if (method === 'searchCustomEmojiByEmoticons') return { documentIds: [] };
    return undefined;
  }),
}));
vi.mock('../../../../api/gramjs', () => ({ callApi: mocks.callApi }));

let emojis: Record<string, Emoji>;

beforeAll(async () => {
  setGlobal(cloneDeep(INITIAL_GLOBAL_STATE), { forceOutdated: true });
  emojis = (await ensureEmojiData()).emojis;
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  mocks.callApi.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useEmojiSearch', () => {
  it('matches native emoji by name and by keyword, and asks the server for the last query of a throttle window', async () => {
    await createRoot(async (dispose) => {
      const [keywords] = createSignal<Record<string, string[]>>({ love: ['❤️'] });
      const search = useEmojiSearch({
        allEmojis: () => emojis,
        baseEmojiKeywords: keywords,
        noQueryCustomResults: true,
      });
      flushSync();
      expect(search.hasQuery()).toBe(false);
      expect(search.nativeResults()).toBeUndefined();

      search.setQuery('  Heart ');
      flushSync();
      expect(search.hasQuery()).toBe(true);
      expect(search.isSearchActive()).toBe(true);
      const byName = search.nativeResults()!;
      expect(byName.length).toBeGreaterThan(1);
      expect(byName.length).toBeLessThanOrEqual(40);
      expect(byName.some((emoji) => emoji.names.some((name) => name.startsWith('heart')))).toBe(true);
      // `noQueryCustomResults`: a text query has no custom emoji of its own
      expect(search.customResults()).toBeUndefined();

      search.setQuery('love');
      flushSync();
      expect(search.nativeResults()!.map((emoji) => emoji.native)).toContain('❤️');

      vi.advanceTimersByTime(600);
      await flushMicrotasks();
      flushSync();
      expect(mocks.callApi).toHaveBeenCalledWith('searchEmojiStickerSets', { query: 'love' });
      // the first query was superseded inside the throttle window
      expect(mocks.callApi.mock.calls.filter(([method]) => method === 'searchEmojiStickerSets')).toHaveLength(1);
      expect(search.queryResults()?.key).toBe('love');

      search.setQuery('');
      flushSync();
      expect(search.hasQuery()).toBe(false);
      expect(search.queryResults()).toBeUndefined();
      expect(search.nativeResults()).toBeUndefined();
      dispose();
    });
  });

  it('shows the emoji of a group once its custom emoji are loaded, and a text query drops the group', async () => {
    await createRoot(async (dispose) => {
      const search = useEmojiSearch({ allEmojis: () => emojis });
      flushSync();
      const group = { title: 'Smileys', iconEmojiId: '1', emoticons: ['😀', '😃'] };

      search.selectGroup(group);
      flushSync();
      expect(search.activeGroup()).toBe(group);
      // The group is displayed only after its custom emoji ids are in
      expect(search.displayGroup()).toBeUndefined();
      await flushMicrotasks();
      flushSync();
      expect(mocks.callApi).toHaveBeenCalledWith('searchCustomEmojiByEmoticons', { emoticons: group.emoticons });
      expect(search.displayGroup()).toBe(group);
      expect(search.nativeResults()!.map((emoji) => emoji.native)).toEqual(['😀', '😃']);

      search.setQuery('smile');
      flushSync();
      expect(search.activeGroup()).toBeUndefined();
      expect(search.displayGroup()).toBeUndefined();
      dispose();
    });
  });
});

describe('useTransitionActiveKey', () => {
  it('bumps the key when a dependency changes and holds it for equal values', () => {
    createRoot((dispose) => {
      const [a, setA] = createSignal(1);
      const [b, setB] = createSignal('x');
      const key = useTransitionActiveKey(() => [a(), b()]);

      const first = key();
      setA(2);
      expect(key()).toBe(first + 1);
      setB('x');
      expect(key()).toBe(first + 1);
      setB('y');
      expect(key()).toBe(first + 2);
      dispose();
    });
  });

  it('does not bump the key with `noAnimation`', () => {
    createRoot((dispose) => {
      const [a, setA] = createSignal(1);
      const key = useTransitionActiveKey(() => [a()], true);
      const first = key();
      setA(2);
      expect(key()).toBe(first);
      dispose();
    });
  });
});

describe('useAsyncRendering', () => {
  it('is false until the delay passed, and again after the dependencies changed', () => {
    createRoot((dispose) => {
      const [dependency, setDependency] = createSignal(1);
      const shouldRender = useAsyncRendering(() => [dependency()], 200);
      expect(shouldRender()).toBe(false);
      flushSync();
      vi.advanceTimersByTime(199);
      expect(shouldRender()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(shouldRender()).toBe(true);

      setDependency(2);
      flushSync();
      expect(shouldRender()).toBe(false);
      vi.advanceTimersByTime(200);
      expect(shouldRender()).toBe(true);
      dispose();
    });
  });

  it('renders at once without a delay', () => {
    createRoot((dispose) => {
      const shouldRender = useAsyncRendering([]);
      flushSync();
      expect(shouldRender()).toBe(true);
      dispose();
    });
  });
});
