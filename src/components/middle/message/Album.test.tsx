// Original test (not in telegram-tt): `Album` (the layout, the cap of the parts, the keyed rows, the stable layout memo) and
// `withSelectControl` (the select wrapper), over mocked `Photo` / `Video`, so the test is about the album.
import '../../../global/actions/all';

import { createSignal } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { enableStrict, setHandler } from 'frameact/stricterdom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlobal, setGlobal } from '../../../global';

import type { ApiChat, ApiMediaExtendedPreview, ApiMessage, ApiPhoto, ApiVideo } from '../../../api/types';
import type { GlobalState, TabState } from '../../../global/types';
import type { IAlbum } from '../../../types';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { getMediaHash } from '../../../global/helpers';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { addChats } from '../../../global/reducers/chats';
import { addActiveMediaDownload } from '../../../global/reducers/messages';
import { updateTabState } from '../../../global/reducers/tabs';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';
import { clampMediaDimensions } from '../../common/helpers/placeholder';
import { calculateAlbumLayout } from './helpers/calculateAlbumLayout';

import Album from './Album';

const { toggleMessageSelection } = vi.hoisted(() => ({ toggleMessageSelection: vi.fn() }));

vi.mock('../../../global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../global')>();
  return {
    ...actual,
    getActions: () =>
      new Proxy(actual.getActions(), {
        get: (target, key, receiver) =>
          key === 'toggleMessageSelection' ? toggleMessageSelection : Reflect.get(target, key, receiver),
      }),
  };
});

vi.mock('./helpers/calculateAlbumLayout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./helpers/calculateAlbumLayout')>();
  return { ...actual, calculateAlbumLayout: vi.fn(actual.calculateAlbumLayout) };
});

// The media components are tested with their own files: here they only show the props the album hands them.
vi.mock('./Photo', () => ({
  default: (props: Record<string, any>) => (
    <div
      class="mock-media mock-photo"
      id={props.id}
      data-photo={props.photo.id}
      data-can-auto-load={String(props.canAutoLoad)}
      data-appendix={String(props.shouldAffectAppendix)}
      data-own={String(props.isOwn)}
      data-protected={String(props.isProtected)}
      data-downloading={String(props.isDownloading)}
      data-upload={String(props.uploadProgress)}
      data-select-mode={String(props.isInSelectMode)}
      data-selected={String(props.isSelected)}
      data-has-click={String(Boolean(props.onClick))}
      data-theme={props.theme}
      data-layout={props.layout}
      onClick={(e) => props.onClick?.(props.clickArg, e)}
    />
  ),
}));

vi.mock('./Video', () => ({
  default: (props: Record<string, any>) => (
    <div
      class="mock-media mock-video"
      id={props.id}
      data-video={props.video.id}
      data-can-auto-play={String(props.canAutoPlay)}
      data-select-mode={String(props.isInSelectMode)}
      data-has-click={String(Boolean(props.onClick))}
      onClick={(e) => props.onClick?.(props.clickArg, e)}
    />
  ),
}));

const tabId = getCurrentTabId();
const CHAT_ID = '2000';
const PERCENT = (value: number) => `${value * 100}%`;

function photo(id: string, width: number, height: number): ApiPhoto {
  return {
    mediaType: 'photo',
    id,
    date: 1,
    sizes: [{ type: 'x', width, height }],
    blobUrl: `blob:${id}`,
  };
}

function video(id: string, width: number, height: number): ApiVideo {
  return { mediaType: 'video', id, mimeType: 'video/mp4', duration: 3, fileName: `${id}.mp4`, width, height };
}

function message(id: number, content: ApiMessage['content'], extra: Partial<ApiMessage> = {}): ApiMessage {
  return { id, chatId: CHAT_ID, date: 1_700_000_000 + id, isOutgoing: false, content, ...extra };
}

function photoMessage(id: number, width: number, height: number, extra?: Partial<ApiMessage>) {
  return message(id, { photo: photo(`p${id}`, width, height) }, extra);
}

function album(messages: ApiMessage[]): IAlbum {
  return { albumId: 'a', messages, mainMessage: messages[0], hasMultipleCaptions: false };
}

function paidAlbum(previews: ApiMediaExtendedPreview[]): IAlbum {
  const main = message(1, { paidMedia: { starsAmount: 5, extendedMedia: previews } });
  return { albumId: 'paid', messages: [main], mainMessage: main, isPaidMedia: true, hasMultipleCaptions: false };
}

function preview(width: number, height: number): ApiMediaExtendedPreview {
  return { mediaType: 'extendedMediaPreview', width, height };
}

function seed(tabPatch: Partial<TabState> = {}) {
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId, ...tabPatch };
  let global: GlobalState = { ...cloneDeep(INITIAL_GLOBAL_STATE), currentUserId: '1000', byTabId: { [tabId]: tab } };
  global = addChats(global, {
    [CHAT_ID]: { id: CHAT_ID, title: 'Chat', type: 'chatTypePrivate', unreadCount: 0 } as ApiChat,
  });
  setGlobal(global, { forceOutdated: true });
}

type Rect = { x: number; y: number; width: number; height: number };

function itemRects(root: HTMLElement): Rect[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.album-item')).map((el) => {
    const read = (name: string) => Number(new RegExp(`${name}: ([^;]+)%`).exec(el.getAttribute('style')!)?.[1]) / 100;
    return { x: read('left'), y: read('top'), width: read('width'), height: read('height') };
  });
}

function rootRatio(root: HTMLElement) {
  return Number(/--album-aspect-ratio: ([^;]+)/.exec(root.getAttribute('style')!)?.[1]);
}

function expectNoOverlap(rects: Rect[]) {
  const EPSILON = 1e-9;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const overlapsX = a.x < b.x + b.width - EPSILON && b.x < a.x + a.width - EPSILON;
      const overlapsY = a.y < b.y + b.height - EPSILON && b.y < a.y + a.height - EPSILON;
      expect(overlapsX && overlapsY, `items ${i} and ${j} overlap`).toBe(false);
    }
  }
}

function expectFiniteStyles(root: HTMLElement) {
  const styles = [root, ...root.querySelectorAll<HTMLElement>('.album-item')].map(
    (el) => el.getAttribute('style') ?? '',
  );
  for (const style of styles) expect(style).not.toMatch(/NaN|Infinity|e\+\d|e-\d/);
}

function layoutOf(messages: ApiMessage[]) {
  return calculateAlbumLayout(messages.map((item) => clampMediaDimensions(item.content.photo!.sizes[0]).aspectRatio));
}

describe('Album', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;
  const onMediaClick = vi.fn();
  const violations: string[] = [];
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    enableStrict();
    setHandler((...args: unknown[]) => violations.push(args.map(String).join(' ')));
  });

  beforeEach(() => {
    delegateEvents(['click']);
    onMediaClick.mockClear();
    toggleMessageSelection.mockClear();
    vi.mocked(calculateAlbumLayout).mockClear();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    seed();
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    expect(violations.filter((text) => !text.includes('of <body'))).toEqual([]);
    violations.length = 0;
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  const frames = async () => {
    await harness.frame();
    await harness.frame();
  };

  async function mount(source: () => IAlbum, extra: { isOwn?: boolean; hasCustomAppendix?: boolean } = {}) {
    const el = container();
    dispose = render(
      () => (
        <Album
          album={source()}
          observeIntersection={() => () => {}}
          isOwn={extra.isOwn ?? false}
          hasCustomAppendix={extra.hasCustomAppendix}
          isProtected
          onMediaClick={onMediaClick}
        />
      ),
      el,
    );
    await frames();
    return el.querySelector<HTMLElement>('.Album')!;
  }

  it.each([
    ['2 parts', [photoMessage(1, 1600, 900), photoMessage(2, 900, 1600)]],
    [
      '4 parts',
      [photoMessage(1, 1600, 900), photoMessage(2, 900, 1600), photoMessage(3, 1000, 1000), photoMessage(4, 1200, 600)],
    ],
  ])('lays out %s as calculateAlbumLayout does, without overlap', async (_name, messages) => {
    const root = await mount(() => album(messages));
    const expected = layoutOf(messages);

    expect(root.classList.contains('Album')).toBe(true);
    expect(rootRatio(root)).toBe(expected.aspectRatio);

    const rects = itemRects(root);
    expect(rects).toHaveLength(messages.length);
    rects.forEach((rect, index) => {
      const { rect: want } = expected.items[index];
      expect(rect.x).toBeCloseTo(want.x, 9);
      expect(rect.y).toBeCloseTo(want.y, 9);
      expect(rect.width).toBeCloseTo(want.width, 9);
      expect(rect.height).toBeCloseTo(want.height, 9);
    });
    // the style text is the layout's percentage
    expect(root.querySelector<HTMLElement>('.album-item')!.getAttribute('style')).toContain(
      `left: ${PERCENT(expected.items[0].rect.x)}`,
    );
    expectNoOverlap(rects);
    expectFiniteStyles(root);
    // the parts are the photos, in order
    expect(Array.from(root.querySelectorAll('.mock-photo')).map((el) => (el as HTMLElement).dataset.photo)).toEqual(
      messages.map((item) => item.content.photo!.id),
    );
  });

  it('hands the items their props: ids, flags, loading and the fill layout', async () => {
    const messages = [photoMessage(1, 1600, 900), photoMessage(2, 900, 1600)];
    const root = await mount(() => album(messages), { isOwn: true });
    const items = Array.from(root.querySelectorAll<HTMLElement>('.mock-photo'));

    expect(items.map((el) => el.id)).toEqual(['album-media-message-1', 'album-media-message-2']);
    expect(items.every((el) => el.dataset.protected === 'true')).toBe(true);
    expect(items.every((el) => el.dataset.own === 'true')).toBe(true);
    expect(items.every((el) => el.dataset.layout === 'fill')).toBe(true);
    expect(items.every((el) => el.dataset.theme === 'light' || el.dataset.theme === 'dark')).toBe(true);
    expect(items.every((el) => el.dataset.downloading === 'false')).toBe(true);
    // not in select mode: the wrapper has no control and the click goes through
    expect(root.querySelector('.message-select-control')).toBeNull();
    expect(root.querySelectorAll('.album-item-select-wrapper')).toHaveLength(2);
  });

  it('marks the appendix part: the last one for an own album, the bottom left one otherwise', async () => {
    const messages = [photoMessage(1, 1600, 900), photoMessage(2, 900, 1600), photoMessage(3, 1000, 1000)];
    const own = await mount(() => album(messages), { isOwn: true, hasCustomAppendix: true });
    expect(Array.from(own.querySelectorAll<HTMLElement>('.mock-photo')).map((el) => el.dataset.appendix)).toEqual([
      'false',
      'false',
      'true',
    ]);
    dispose!();
    dispose = undefined;
    document.body.textContent = '';

    const other = await mount(() => album(messages), { isOwn: false, hasCustomAppendix: true });
    const flags = Array.from(other.querySelectorAll<HTMLElement>('.mock-photo')).map((el) => el.dataset.appendix);
    expect(flags.filter((flag) => flag === 'true')).toHaveLength(1);
    const layout = layoutOf(messages);
    const bottomLeft = layout.items.findIndex(({ sides }) => sides & 8 && sides & 4);
    expect(flags[bottomLeft]).toBe('true');
  });

  it('renders a video part with the video component', async () => {
    const messages = [photoMessage(1, 1600, 900), message(2, { video: video('v2', 1280, 720) })];
    const root = await mount(() => album(messages));
    expect(root.querySelectorAll('.album-item')).toHaveLength(2);
    expect(root.querySelector('.mock-photo')).not.toBeNull();
    expect(root.querySelector<HTMLElement>('.mock-video')!.dataset.video).toBe('v2');
  });

  it('drops a part without a photo or a video before the layout', async () => {
    const messages = [
      photoMessage(1, 1600, 900),
      message(2, { text: { text: 'no media' } }),
      photoMessage(3, 900, 1600),
    ];
    const root = await mount(() => album(messages));
    expect(root.querySelectorAll('.album-item')).toHaveLength(2);
    expect(vi.mocked(calculateAlbumLayout)).toHaveBeenLastCalledWith([
      expect.closeTo(16 / 9, 9),
      expect.closeTo(9 / 16, 9),
    ]);
  });

  it('renders at most 10 parts of a hostile 100-part album', async () => {
    const messages = Array.from({ length: 100 }, (_, i) => photoMessage(i + 1, 1000 + i, 800));
    const root = await mount(() => album(messages));
    expect(root.querySelectorAll('.album-item')).toHaveLength(10);
    expect(root.querySelectorAll('.mock-photo')).toHaveLength(10);
    expect(vi.mocked(calculateAlbumLayout).mock.calls.every(([ratios]) => ratios.length <= 10)).toBe(true);
    expectFiniteStyles(root);
    expectNoOverlap(itemRects(root));
    // the 10 first ones
    expect((root.querySelectorAll('.mock-photo')[9] as HTMLElement).dataset.photo).toBe('p10');
  });

  it('caps the declared paid media as well', async () => {
    const root = await mount(() => paidAlbum(Array.from({ length: 100 }, () => preview(800, 600))));
    expect(root.querySelectorAll('.album-item')).toHaveLength(10);
  });

  it('keeps the DOM of the existing items when a part arrives later', async () => {
    const first = [photoMessage(1, 1600, 900), photoMessage(2, 900, 1600)];
    const [source, setSource] = createSignal(album(first));
    const root = await mount(source);
    const before = Array.from(root.querySelectorAll('.album-item'));
    const photos = Array.from(root.querySelectorAll('.mock-photo'));
    expect(before).toHaveLength(2);

    const next = [...first, photoMessage(3, 1000, 1000)];
    setSource(album(next));
    await frames();

    const after = Array.from(root.querySelectorAll('.album-item'));
    expect(after).toHaveLength(3);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(root.querySelectorAll('.mock-photo')[0]).toBe(photos[0]);
    expect(root.querySelectorAll('.mock-photo')[1]).toBe(photos[1]);
    // the layout moved the items
    const expected = layoutOf(next);
    itemRects(root).forEach((rect, index) => expect(rect.x).toBeCloseTo(expected.items[index].rect.x, 9));
    expectNoOverlap(itemRects(root));

    // and a removed part leaves the others in place
    setSource(album(first));
    await frames();
    const last = Array.from(root.querySelectorAll('.album-item'));
    expect(last).toHaveLength(2);
    expect(last[0]).toBe(before[0]);
    expect(last[1]).toBe(before[1]);
  });

  it('does not calculate the layout again for an album whose ratios did not change', async () => {
    const [source, setSource] = createSignal(album([photoMessage(1, 1600, 900), photoMessage(2, 900, 1600)]));
    const root = await mount(source);
    const before = Array.from(root.querySelectorAll('.album-item'));
    const calls = vi.mocked(calculateAlbumLayout).mock.calls.length;

    // the message objects are replaced (a view counter, a reaction): same ids, same sizes
    setSource(album([photoMessage(1, 1600, 900, { viewsCount: 5 }), photoMessage(2, 900, 1600, { viewsCount: 5 })]));
    await frames();

    expect(vi.mocked(calculateAlbumLayout).mock.calls.length).toBe(calls);
    expect(Array.from(root.querySelectorAll('.album-item'))).toEqual(before);
    Array.from(root.querySelectorAll('.album-item')).forEach((el, index) => expect(el).toBe(before[index]));
  });

  it('gives finite styles for hostile sizes', async () => {
    const hostile = [
      [Number.NaN, Number.NaN],
      [0, 0],
      [-5, 300],
      [1e9, 1],
      [1, 1e9],
      [Number.POSITIVE_INFINITY, 10],
    ];
    const messages = hostile.map(([width, height], index) => photoMessage(index + 1, width, height));
    const root = await mount(() => album(messages));

    expect(root.querySelectorAll('.album-item')).toHaveLength(hostile.length);
    expectFiniteStyles(root);
    const ratio = rootRatio(root);
    expect(Number.isFinite(ratio)).toBe(true);
    expect(ratio).toBeGreaterThan(0);
    const rects = itemRects(root);
    rects.forEach((rect) => Object.values(rect).forEach((value) => expect(Number.isFinite(value)).toBe(true)));
    expectNoOverlap(rects);
    expect(
      vi
        .mocked(calculateAlbumLayout)
        .mock.calls.at(-1)![0]
        .every((r) => r >= 0.1 && r <= 10),
    ).toBe(true);
  });

  it('renders an album without media as an empty square', async () => {
    const root = await mount(() => album([message(1, { text: { text: 'x' } })]));
    expect(root.querySelectorAll('.album-item')).toHaveLength(0);
    expect(rootRatio(root)).toBe(1);
  });

  it('clicks a part: the album reports the message id, a paid album the position', async () => {
    const root = await mount(() => album([photoMessage(7, 1600, 900), photoMessage(8, 900, 1600)]));
    (root.querySelectorAll('.mock-photo')[1] as HTMLElement).click();
    expect(onMediaClick).toHaveBeenCalledWith(8);
    dispose!();
    dispose = undefined;
    document.body.textContent = '';

    onMediaClick.mockClear();
    const paid = await mount(() => paidAlbum([preview(800, 600), preview(600, 800), preview(500, 500)]));
    const items = paid.querySelectorAll<HTMLElement>('.mock-photo');
    expect(items).toHaveLength(3);
    items[2].click();
    expect(onMediaClick).toHaveBeenCalledWith(1, 2);
  });

  it('reads the downloads of a part as a leaf', async () => {
    const messages = [photoMessage(1, 1600, 900), photoMessage(2, 900, 1600)];
    const root = await mount(() => album(messages));
    const [first, second] = Array.from(root.querySelectorAll<HTMLElement>('.mock-photo'));
    expect(first.dataset.downloading).toBe('false');

    const hash = getMediaHash(messages[1].content.photo!, 'download')!;
    setGlobal(addActiveMediaDownload(getGlobal(), hash, {} as never));
    await frames();
    expect(second.dataset.downloading).toBe('true');
    expect(first.dataset.downloading).toBe('false');
    expect(root.querySelectorAll('.mock-photo')[1]).toBe(second);
  });

  describe('the select control', () => {
    const messages = () => [photoMessage(1, 1600, 900), photoMessage(2, 900, 1600)];

    it('shows the control only in the selection mode and toggles the selection on a click', async () => {
      const root = await mount(() => album(messages()));
      expect(root.querySelector('.message-select-control')).toBeNull();

      setGlobal(updateTabState(getGlobal(), { selectedMessages: { chatId: CHAT_ID, messageIds: [] } }, tabId));
      await frames();

      const wrappers = root.querySelectorAll<HTMLElement>('.album-item-select-wrapper');
      expect(wrappers).toHaveLength(2);
      expect(root.querySelectorAll('.message-select-control')).toHaveLength(2);
      const photos = Array.from(root.querySelectorAll<HTMLElement>('.mock-photo'));
      // the wrapped component sees the mode and has no click handler
      expect(photos.every((el) => el.dataset.selectMode === 'true' && el.dataset.hasClick === 'false')).toBe(true);

      wrappers[1].click();
      expect(toggleMessageSelection).toHaveBeenCalledTimes(1);
      expect(toggleMessageSelection).toHaveBeenLastCalledWith({ messageId: 2, withShift: false });
      expect(onMediaClick).not.toHaveBeenCalled();

      photos[0].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
      expect(toggleMessageSelection).toHaveBeenLastCalledWith({ messageId: 1, withShift: true });
      expect(onMediaClick).not.toHaveBeenCalled();
    });

    it('shows the selected state and removes the control when the mode is left', async () => {
      seed({ selectedMessages: { chatId: CHAT_ID, messageIds: [2] } });
      const root = await mount(() => album(messages()));
      const wrappers = Array.from(root.querySelectorAll<HTMLElement>('.album-item-select-wrapper'));
      const photos = Array.from(root.querySelectorAll<HTMLElement>('.mock-photo'));

      expect(wrappers.map((el) => el.classList.contains('is-selected'))).toEqual([false, true]);
      expect(photos.map((el) => el.dataset.selected)).toEqual(['false', 'true']);
      expect(wrappers[1].querySelector('.message-select-control .message-select-control-icon')).not.toBeNull();
      expect(wrappers[0].querySelector('.message-select-control-icon')).toBeNull();

      setGlobal(updateTabState(getGlobal(), { selectedMessages: undefined }, tabId));
      await frames();

      expect(root.querySelector('.message-select-control')).toBeNull();
      expect(root.querySelector('.is-selected')).toBeNull();
      const same = Array.from(root.querySelectorAll<HTMLElement>('.album-item-select-wrapper'));
      expect(same[0]).toBe(wrappers[0]);
      expect(same[1]).toBe(wrappers[1]);
      expect(Array.from(root.querySelectorAll<HTMLElement>('.mock-photo'))).toEqual(photos);
      expect(photos.every((el) => el.dataset.selectMode === 'false' && el.dataset.hasClick === 'true')).toBe(true);

      // out of the mode a click opens the media and does not toggle
      photos[0].click();
      expect(onMediaClick).toHaveBeenCalledWith(1);
      expect(toggleMessageSelection).not.toHaveBeenCalled();
    });

    it('has no select control in a paid album', async () => {
      seed({ selectedMessages: { chatId: CHAT_ID, messageIds: [] } });
      const root = await mount(() => paidAlbum([preview(800, 600), preview(600, 800)]));
      expect(root.querySelectorAll('.album-item')).toHaveLength(2);
      expect(root.querySelector('.message-select-control')).toBeNull();
      const photos = Array.from(root.querySelectorAll<HTMLElement>('.mock-photo'));
      expect(photos.every((el) => el.dataset.selectMode === 'false' && el.dataset.hasClick === 'true')).toBe(true);
      photos[1].click();
      expect(onMediaClick).toHaveBeenCalledWith(1, 1);
      expect(toggleMessageSelection).not.toHaveBeenCalled();
    });
  });
});
