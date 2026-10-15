// Original test (not in telegram-tt): the native-emoji path of the emoji picker end to end (categories, recent emoji,
// search, selection) on the frameact runtime (jsdom), stricterdom enabled.
import { delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { addActionHandler, getGlobal, setGlobal } from '../../../global';

import type { ApiSticker, ApiStickerSet } from '../../../api/types';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { flushMicrotasks } from '../../../lib/kit/testing/micro';
import { INITIAL_GLOBAL_STATE } from '../../../global/initialState';
import { ensureEmojiData } from '../../../util/emoji/emojiSearch';
import { cloneDeep } from '../../../util/iteratees';

import EmojiPicker from './EmojiPicker';

const mocks = vi.hoisted(() => ({
  packSets: [] as unknown[],
  callApi: vi.fn(async (method: string): Promise<unknown> => {
    await Promise.resolve();
    if (method === 'searchEmojiStickerSets') return { sets: mocks.packSets };
    if (method === 'searchStickersGlobal') return { stickers: [] };
    return undefined;
  }),
}));
vi.mock('../../../api/gramjs', () => ({ callApi: mocks.callApi }));

addActionHandler('loadStickers', () => undefined);
addActionHandler('toggleStickerSet', () => undefined);

const harness = useDomHarness();
const violations: string[] = [];

beforeAll(async () => {
  setGlobal({ ...cloneDeep(INITIAL_GLOBAL_STATE), recentEmojis: ['smile'] }, { forceOutdated: true });
  await ensureEmojiData();
});

beforeEach(() => {
  violations.length = 0;
  // Every observed element is reported as visible at once
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        queueMicrotask(() =>
          this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as never),
        );
      }
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  delegateEvents(['click', 'input', 'mousedown', 'focusin']);
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}] ${error.stack ?? ''}`));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setHandler();
  disableStrict();
});

async function settle(ms = 0) {
  for (let i = 0; i < 3; i++) {
    await harness.frame();
  }
  vi.advanceTimersByTime(ms);
  await flushMicrotasks();
  for (let i = 0; i < 3; i++) {
    await harness.frame();
  }
}

async function mountPicker() {
  const selected: Array<[string, string]> = [];
  const el = suppressStrict(container);
  const dispose = render(
    () => (
      <EmojiPicker
        className="picker-tab"
        idPrefix="test"
        onEmojiSelect={(emoji, name) => selected.push([emoji, name])}
        onCustomEmojiSelect={() => undefined}
      />
    ),
    el,
  );
  await settle();
  expect(el.querySelector('.EmojiPicker')).toBeTruthy();
  expect(el.querySelector('.EmojiPicker-inner')).toBeNull();

  await settle(500);
  await ensureEmojiData();
  await settle(500);
  return { el, selected, dispose };
}

describe('EmojiPicker (native emoji)', () => {
  it('renders the categories after the open delay and selects an emoji', async () => {
    const { el, selected, dispose } = await mountPicker();
    expect(el.querySelector('.EmojiPicker-inner')).toBeTruthy();
    const sections = el.querySelectorAll('.symbol-set');
    expect(sections.length).toBeGreaterThan(5);
    expect(el.querySelector('#test-emoji-section-0 .symbol-set-name')?.textContent).toBeTruthy();

    const button = el.querySelector<HTMLElement>('#test-emoji-section-0 .EmojiButton');
    expect(button).toBeTruthy();
    button!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(selected).toHaveLength(1);
    expect(selected[0][1]).toBe('smile');

    dispose();
    expect(violations).toEqual([]);
  });

  it('searches native emoji by keyword and by name, and goes back to the categories', async () => {
    const { el, selected, dispose } = await mountPicker();
    const input = el.querySelector<HTMLInputElement>('.EmojiPicker-main input')!;
    expect(input).toBeTruthy();
    const type = async (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await settle(600);
      await settle(1200);
    };

    await type('heart');
    const titles = Array.from(
      el.querySelectorAll('.EmojiPicker-content-transition .Transition_slide-active .EmojiButton'),
    ).map((button) => button.getAttribute('title'));
    expect(titles.length).toBeGreaterThan(3);
    expect(titles.some((title) => title?.includes('heart'))).toBe(true);
    expect(el.querySelector('.EmojiPicker-main .Transition_slide-active .symbol-set')).toBeNull();

    el.querySelector<HTMLElement>(
      '.EmojiPicker-content-transition .Transition_slide-active .EmojiButton',
    )!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(selected).toHaveLength(1);

    await type('zzzzqqqq');
    expect(el.querySelector('.EmojiPicker-content-transition .Transition_slide-active .EmojiButton')).toBeNull();

    await type('');
    expect(
      el.querySelectorAll('.EmojiPicker-content-transition .Transition_slide-active .symbol-set').length,
    ).toBeGreaterThan(5);

    dispose();
    expect(violations).toEqual([]);
  });

  it('lists the custom emoji sets of the store after the native categories and selects a custom emoji', async () => {
    const stickerBase = { mediaType: 'sticker', isLottie: false, isVideo: false, isCustomEmoji: true, isFree: true };
    const stickers: ApiSticker[] = ['a', 'b', 'c'].map((suffix) => ({
      ...stickerBase,
      id: `custom-${suffix}`,
      emoji: '😀',
      stickerSetInfo: { id: '100', accessHash: '1' },
      thumbnail: { dataUri: 'data:image/png;base64,AAAA', width: 100, height: 100 },
    })) as ApiSticker[];
    const set: ApiStickerSet = {
      id: '100',
      accessHash: '1',
      title: 'My emoji set',
      shortName: 'my_set',
      isEmoji: true,
      installedDate: 1,
      count: stickers.length,
      stickers,
    };
    const global = getGlobal();
    setGlobal({
      ...global,
      stickers: { ...global.stickers, setsById: { '100': set } },
      customEmojis: { ...global.customEmojis, added: { setIds: ['100'] }, byId: { 'custom-a': stickers[0] } },
    });

    const customSelected: string[] = [];
    const el = suppressStrict(container);
    const dispose = render(
      () => (
        <EmojiPicker
          className="picker-tab"
          idPrefix="test"
          isTranslucent
          loadAndPlay
          onEmojiSelect={() => undefined}
          onCustomEmojiSelect={(sticker) => customSelected.push(sticker.id)}
        />
      ),
      el,
    );
    await settle(500);
    await ensureEmojiData();
    await settle(500);
    await settle(500);

    const titles = Array.from(el.querySelectorAll('.symbol-set .symbol-set-name')).map((name) => name.textContent);
    expect(titles[titles.length - 1]).toBe('My emoji set');
    // The recent native category is the first section, the custom set the last
    const customSection = el.querySelector<HTMLElement>(`#test-emoji-section-${titles.length - 1}`)!;
    expect(customSection).toBeTruthy();
    expect(customSection.querySelectorAll('.StickerButton')).toHaveLength(3);
    expect(customSection.querySelectorAll('canvas.shared-canvas').length).toBeGreaterThan(0);
    // The set has a cover in the header
    expect(el.querySelectorAll('.EmojiPicker-header-cover')).toHaveLength(1);

    customSection
      .querySelector<HTMLElement>('.StickerButton')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    customSection.querySelector<HTMLElement>('.StickerButton')!.click();
    expect(customSelected).toEqual(['custom-a']);

    dispose();
    expect(violations).toEqual([]);
  });

  it('shows the sticker packs found by the search and opens one with its add button', async () => {
    const sticker = {
      mediaType: 'sticker',
      id: 'found-1',
      emoji: '😀',
      isLottie: false,
      isVideo: false,
      isCustomEmoji: true,
      isFree: true,
      stickerSetInfo: { id: '200', accessHash: '1' },
      thumbnail: { dataUri: 'data:image/png;base64,AAAA', width: 100, height: 100 },
    };
    mocks.packSets = [
      {
        id: '200',
        accessHash: '1',
        title: 'Found pack',
        shortName: 'found',
        isEmoji: true,
        count: 1,
        stickers: [sticker],
        covers: [sticker],
      },
    ];
    const global = getGlobal();
    setGlobal({
      ...global,
      stickers: { ...global.stickers, setsById: {} },
      customEmojis: { ...global.customEmojis, added: {}, byId: {} },
    });

    const { el, dispose } = await mountPicker();
    const input = el.querySelector<HTMLInputElement>('.EmojiPicker-main input')!;
    input.value = 'smile';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(600);
    await settle(600);
    await settle(1200);

    const pack = el.querySelector<HTMLElement>('button[aria-label="Found pack"]');
    expect(pack).toBeTruthy();
    pack!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    await settle(600);
    await settle(1200);

    // The pack is opened: its stickers and the add button (the label is the "add" variant of the pack)
    const active = el.querySelector('.EmojiPicker-content-transition > .Transition_slide-active')!;
    expect(active.querySelectorAll('.StickerButton')).toHaveLength(1);
    const toggle = el.querySelector<HTMLElement>('.EmojiPicker-inner > button')!;
    expect(toggle).toBeTruthy();
    expect(toggle.textContent).toContain('StickerPackAddEmojiCount');
    // The back arrow leaves the pack
    el.querySelector<HTMLElement>('[aria-label="AccDescrGoBack"]')!.click();
    await settle(600);
    await settle(1200);
    expect(el.querySelector('.EmojiPicker-inner > button')).toBeNull();
    expect(el.querySelector('button[aria-label="Found pack"]')).toBeTruthy();

    dispose();
    expect(violations).toEqual([]);
  });
});
