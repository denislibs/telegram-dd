// Original test (not in telegram-tt): which blocks the video message renders in which state, the click state machine
// (load toggle, play, spoiler reveal, upload cancel), the playing gate of the intersection observer and the numbers of the server.
import { delegateEvents, render } from 'frameact/dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getActions, setGlobal } from '../../../global';

import type { ApiMediaExtendedPreview, ApiVideo } from '../../../api/types';
import type { TabState } from '../../../global/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';

import Video from './Video';

vi.mock('../../../util/mediaLoader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../util/mediaLoader')>()),
  // Nothing is fetched: a load that was asked for stays pending.
  fetch: vi.fn(() => new Promise(() => {})),
  getFromMemory: vi.fn(() => undefined),
  cancelProgress: vi.fn(),
  removeCallback: vi.fn(),
}));

const tabId = getCurrentTabId();
const BLOB_URL = 'blob:http://localhost/video-1';

function buildVideo(extra?: Partial<ApiVideo>): ApiVideo {
  return {
    mediaType: 'video',
    id: '2',
    mimeType: 'video/mp4',
    duration: 5,
    fileName: 'a.mp4',
    size: 1000,
    width: 640,
    height: 360,
    blobUrl: BLOB_URL,
    ...extra,
  };
}

/** An `ObserveFn` that is driven by the test: `set(true)` reports an intersection to everything that observes. */
function createFakeObserver() {
  const callbacks = new Map<HTMLElement, (entry: IntersectionObserverEntry) => void>();
  const observe: ObserveFn = (target, callback) => {
    if (callback) callbacks.set(target, callback);
    return () => {
      callbacks.delete(target);
    };
  };

  return {
    observe,
    observedCount: () => callbacks.size,
    set(isIntersecting: boolean) {
      callbacks.forEach((callback) => callback({ isIntersecting } as IntersectionObserverEntry));
    },
  };
}

function expectNoBadNumbers(root: Element) {
  const text = root.outerHTML;
  expect(text).not.toMatch(/NaN|Infinity|undefined/);
}

/** The actions are registered by the global modules that this test does not load: it provides the ones the component calls. */
const actions = getActions() as unknown as Record<string, ReturnType<typeof vi.fn>>;
const ACTION_NAMES = ['cancelMediaDownload', 'updateContentSettings', 'openAgeVerificationModal'];

describe('Video', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;
  let play: ReturnType<typeof vi.spyOn>;
  let pause: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
    setGlobal({ ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: tab } }, { forceOutdated: true });
  });

  // jsdom has no media playback and no canvas: the spies stay for the whole file (the harness drains frames after each test).
  beforeAll(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect() {},
      beginPath() {},
      arc() {},
      stroke() {},
    } as unknown as CanvasRenderingContext2D);
  });

  // jsdom has no focused document, which the player takes for a background tab (autoplay is paused then).
  beforeAll(() => {
    window.dispatchEvent(new Event('focus'));
  });

  beforeEach(() => {
    delegateEvents(['click']);
    ACTION_NAMES.forEach((name) => {
      actions[name] = vi.fn();
    });
    play.mockClear();
    pause.mockClear();
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    ACTION_NAMES.forEach((name) => {
      delete actions[name];
    });
  });

  async function mount(props: Partial<Parameters<typeof Video<string>>[0]> = {}) {
    const el = container();
    dispose = render(() => <Video<string> video={buildVideo()} clickArg="arg" {...props} />, el);
    await harness.frame();
    await harness.frame();
    return el;
  }

  async function click(target: Element) {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await harness.frame();
    await harness.frame();
  }

  const getVideoEl = (el: Element) => el.querySelector<HTMLVideoElement>('video');
  const getBadge = (el: Element) => el.querySelector('.message-media-duration, .message-transfer-progress');

  it('renders a plain loaded video as a frame with a video and a duration badge, without the rarely needed blocks', async () => {
    const el = await mount({ canAutoPlay: true });

    const frame = el.firstElementChild as HTMLElement;
    expect(frame.classList.contains('media-inner')).toBe(true);
    expect(frame.classList.contains('dark')).toBe(true);
    expect(frame.classList.contains('interactive')).toBe(true);
    expect(frame.getAttribute('style')).toContain('--media-width: 640px');
    expect(frame.getAttribute('style')).toContain(`--media-aspect-ratio: ${640 / 360}`);

    const videoEl = getVideoEl(el)!;
    expect(videoEl).not.toBeNull();
    expect(videoEl.getAttribute('src')).toBe(BLOB_URL);
    expect(videoEl.classList.contains('full-media')).toBe(true);
    expect(videoEl.getAttribute('draggable')).toBe('true');
    expect(videoEl.muted).toBe(true);
    expect(videoEl.loop).toBe(true);
    expect(videoEl.children.length).toBe(0);

    expect(getBadge(el)!.textContent).toBe('0:05');
    expect(el.querySelector('.media-spoiler')).toBeNull();
    expect(el.querySelector('.media-loading')).toBeNull();
    expect(el.querySelector('.icon-download')).toBeNull();
    expect(el.querySelector('.icon-play')).toBeNull();
    expect(el.querySelector('.protector')).toBeNull();
    expect(el.querySelector('.message-transfer-progress')).toBeNull();
    expect(el.querySelector('.message-media-last-progress')).toBeNull();
    expectNoBadNumbers(el);
  });

  it('marks a protected video and does not let it be dragged', async () => {
    const el = await mount({ isProtected: true });

    expect(el.querySelector('.protector')).not.toBeNull();
    expect(getVideoEl(el)!.getAttribute('draggable')).toBe('false');
  });

  it('shows GIF instead of the duration for a gif', async () => {
    const el = await mount({ video: buildVideo({ isGif: true }) });

    expect(getBadge(el)!.textContent).toBe('GIF');
  });

  it('plays an autoplay video only while it intersects for playing and pauses it when it is scrolled away', async () => {
    const loading = createFakeObserver();
    const playing = createFakeObserver();
    const el = await mount({
      canAutoPlay: true,
      observeIntersectionForLoading: loading.observe,
      observeIntersectionForPlaying: playing.observe,
    });

    // Nothing intersects yet: the video element is not created and nothing plays.
    expect(getVideoEl(el)).toBeNull();
    expect(play).not.toHaveBeenCalled();

    loading.set(true);
    await harness.frame();
    // Intersecting for loading is not enough to play.
    expect(play).not.toHaveBeenCalled();

    playing.set(true);
    await harness.frame();
    await harness.frame();
    expect(getVideoEl(el)).not.toBeNull();
    expect(play).toHaveBeenCalled();

    // Scrolled away: the video stays (it was intersected once) but pauses.
    pause.mockClear();
    playing.set(false);
    await harness.frame();
    await harness.frame();
    expect(getVideoEl(el)).not.toBeNull();
    expect(pause).toHaveBeenCalled();

    // Scrolled back: plays again.
    play.mockClear();
    playing.set(true);
    await harness.frame();
    await harness.frame();
    expect(play).toHaveBeenCalled();
  });

  it('does not play when the playing observer reports nothing, whatever the loading observer says', async () => {
    const loading = createFakeObserver();
    const playing = createFakeObserver();
    const el = await mount({
      canAutoPlay: true,
      observeIntersectionForLoading: loading.observe,
      observeIntersectionForPlaying: playing.observe,
    });

    loading.set(true);
    playing.set(false);
    await harness.frame();
    await harness.frame();

    expect(play).not.toHaveBeenCalled();
    expect(getVideoEl(el)).toBeNull();
  });

  it('shows the play button when it must not autoplay, and a click starts it and goes to the click handler', async () => {
    const onClick = vi.fn();
    const el = await mount({ canAutoPlay: false, onClick });

    const playButton = el.querySelector('.icon-play')!;
    expect(playButton).not.toBeNull();
    expect(play).not.toHaveBeenCalled();

    await click(el.firstElementChild!);

    expect(play).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0]).toBe('arg');
    // The button closes (it stays while its transition runs).
    expect(playButton.classList.contains('closing')).toBe(true);
  });

  it('covers a spoiler video until a click, which reveals it without opening it', async () => {
    const onClick = vi.fn();
    const el = await mount({ video: buildVideo({ isSpoiler: true }), canAutoPlay: true, onClick });

    const spoiler = el.querySelector('.media-spoiler')!;
    expect(spoiler).not.toBeNull();
    expect(spoiler.classList.contains('open')).toBe(true);
    // A spoiler video does not autoplay.
    expect(play).not.toHaveBeenCalled();

    await click(el.firstElementChild!);
    expect(onClick).not.toHaveBeenCalled();
    expect(spoiler.classList.contains('closing')).toBe(true);

    await click(el.firstElementChild!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps a revealed spoiler revealed when the video object is replaced', async () => {
    const { createSignal } = await import('frameact');
    const [video, setVideo] = createSignal(buildVideo({ isSpoiler: true }));
    const onClick = vi.fn();
    const el = container();
    dispose = render(() => <Video<string> video={video()} clickArg="arg" onClick={onClick} />, el);
    await harness.frame();
    await harness.frame();

    await click(el.firstElementChild!);
    expect(onClick).not.toHaveBeenCalled();

    // A views / reactions update replaces the object; the reveal is a state of the component.
    setVideo({ ...buildVideo({ isSpoiler: true }) });
    await harness.frame();
    await harness.frame();

    await click(el.firstElementChild!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('opens a spoiler without a reveal right away when the spoiler is not to be revealed in place', async () => {
    const onClick = vi.fn();
    const el = await mount({ video: buildVideo({ isSpoiler: true }), noSpoilerReveal: true, onClick });

    await click(el.firstElementChild!);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows the download icon when the load is not allowed, and a click toggles the load', async () => {
    const el = await mount({ video: buildVideo({ blobUrl: undefined }), canAutoLoad: false });

    expect(el.querySelector('.icon-download')).not.toBeNull();
    expect(getVideoEl(el)).toBeNull();
    expect(el.querySelector('.media-loading')).toBeNull();

    await click(el.firstElementChild!);
    expect(el.querySelector('.icon-download')).toBeNull();
    expect(el.querySelector('.media-loading')).not.toBeNull();
    expect(el.querySelector('.message-transfer-progress')).not.toBeNull();
    expect(el.querySelector('.message-transfer-progress')!.textContent).toBe('...');

    await click(el.firstElementChild!);
    expect(el.querySelector('.icon-download')).not.toBeNull();
  });

  it('shows the upload progress in percent and cancels the upload on a click', async () => {
    const onCancelUpload = vi.fn();
    const onClick = vi.fn();
    const el = await mount({ uploadProgress: 0.42, onCancelUpload, onClick });

    const badge = el.querySelector('.message-transfer-progress')!;
    expect(badge.textContent).toBe('42%');
    expect(el.firstElementChild!.classList.contains('interactive')).toBe(false);
    expect(el.querySelector('.media-loading')).not.toBeNull();

    await click(el.querySelector('.ProgressSpinner')!);

    expect(onCancelUpload).toHaveBeenCalledTimes(1);
    expect(onCancelUpload).toHaveBeenCalledWith('arg');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not open the video from the frame while it uploads', async () => {
    const onCancelUpload = vi.fn();
    const onClick = vi.fn();
    const el = await mount({ uploadProgress: 0.1, onCancelUpload, onClick });

    await click(el.firstElementChild!);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('cancels the download on a click while it downloads', async () => {
    const onClick = vi.fn();
    const el = await mount({ isDownloading: true, onClick });

    expect(el.querySelector('.message-transfer-progress')).not.toBeNull();
    await click(el.firstElementChild!);

    expect(onClick).not.toHaveBeenCalled();
    expect(actions.cancelMediaDownload).toHaveBeenCalledTimes(1);
    expect(actions.cancelMediaDownload.mock.calls[0][0].media.id).toBe('2');
  });

  it('gives the click handler the click argument and the event of a plain video', async () => {
    const onClick = vi.fn();
    const el = await mount({ onClick });

    await click(el.firstElementChild!);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0]).toBe('arg');
    expect(onClick.mock.calls[0][1]).toBeInstanceOf(Event);
  });

  it('follows the playback in the badge: the time left, never negative', async () => {
    const el = await mount();
    const videoEl = getVideoEl(el)!;

    Object.defineProperty(videoEl, 'currentTime', { configurable: true, value: 3 });
    Object.defineProperty(videoEl, 'duration', { configurable: true, value: 5 });
    videoEl.dispatchEvent(new Event('timeupdate'));
    await harness.frame();
    await harness.frame();
    expect(getBadge(el)!.textContent).toBe('0:03');

    Object.defineProperty(videoEl, 'currentTime', { configurable: true, value: 100 });
    videoEl.dispatchEvent(new Event('timeupdate'));
    await harness.frame();
    await harness.frame();
    expect(getBadge(el)!.textContent).toBe('0:00');
  });

  it('marks the last playback position with a percentage of the duration', async () => {
    const el = await mount({ lastPlaybackTimestamp: 2 });

    const marker = el.querySelector<HTMLElement>('.message-media-last-progress')!;
    expect(marker.getAttribute('style')).toContain('--_progress: 40%');
  });

  it('keeps every number finite for a hostile duration, last position and size', async () => {
    const hostileDurations = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -5, 0, 1e308];
    for (const duration of hostileDurations) {
      for (const lastPlaybackTimestamp of [3, Number.NaN, -1, Number.POSITIVE_INFINITY]) {
        const el = await mount({ video: buildVideo({ duration }), lastPlaybackTimestamp });
        expectNoBadNumbers(el);
        expect(getBadge(el)!.textContent).toMatch(/^\d{1,2}:\d{2}(:\d{2})?$/);
        const marker = el.querySelector<HTMLElement>('.message-media-last-progress');
        if (marker) {
          const percent = Number(/--_progress: (-?[\d.]+)%/.exec(marker.getAttribute('style')!)?.[1]);
          expect(percent).toBeGreaterThanOrEqual(0);
          expect(percent).toBeLessThanOrEqual(100);
        }
        dispose?.();
        dispose = undefined;
        document.body.textContent = '';
      }
    }

    const sizes = [
      [Number.NaN, 5],
      [1e308, 1e-300],
      [-1, -1],
      [0, 0],
      [Number.POSITIVE_INFINITY, 10],
    ];
    for (const [width, height] of sizes) {
      const el = await mount({ video: buildVideo({ width, height }) });
      const style = (el.firstElementChild as HTMLElement).getAttribute('style')!;
      expect(style).not.toMatch(/NaN|Infinity|e\+|e-/);
      const mediaWidth = Number(/--media-width: ([\d.]+)px/.exec(style)?.[1]);
      expect(mediaWidth).toBeGreaterThan(0);
      expect(mediaWidth).toBeLessThanOrEqual(8192);
      dispose?.();
      dispose = undefined;
      document.body.textContent = '';
    }
  });

  it('keeps the upload percentage finite for a hostile progress', async () => {
    for (const uploadProgress of [Number.NaN, Number.POSITIVE_INFINITY, -3, 7]) {
      const el = await mount({ uploadProgress });
      const text = el.querySelector('.message-transfer-progress')?.textContent ?? '';
      expect(text).toMatch(/^\d{1,3}%$/);
      expect(Number.parseInt(text, 10)).toBeLessThanOrEqual(100);
      dispose?.();
      dispose = undefined;
      document.body.textContent = '';
    }
  });

  it('renders a paid media preview behind a spoiler, without a video, a download or a load', async () => {
    const preview: ApiMediaExtendedPreview = {
      mediaType: 'extendedMediaPreview',
      width: 400,
      height: 200,
      duration: 7,
    };
    const el = await mount({ video: preview, canAutoLoad: true });

    expect(el.querySelector('.media-spoiler')).not.toBeNull();
    expect(getVideoEl(el)).toBeNull();
    expect(el.querySelector('.icon-download')).toBeNull();
    expect(getBadge(el)!.textContent).toBe('0:07');
    expect((el.firstElementChild as HTMLElement).getAttribute('style')).toContain('--media-width: 400px');
  });

  it('draws the blurred background only for the intrinsic layout', async () => {
    const intrinsic = await mount();
    expect(intrinsic.querySelector('canvas.blurred-bg')).not.toBeNull();
    dispose?.();
    dispose = undefined;
    document.body.textContent = '';

    const fill = await mount({ layout: 'fill' });
    expect(fill.querySelector('canvas.blurred-bg')).toBeNull();
    expect(fill.firstElementChild!.className).toMatch(/fill/);
  });

  it('observes the frame for loading and for playing, and stops observing when it is destroyed', async () => {
    const loading = createFakeObserver();
    const playing = createFakeObserver();
    await mount({ observeIntersectionForLoading: loading.observe, observeIntersectionForPlaying: playing.observe });

    expect(loading.observedCount()).toBe(1);
    expect(playing.observedCount()).toBe(1);

    dispose?.();
    dispose = undefined;
    await harness.frame();

    expect(loading.observedCount()).toBe(0);
    expect(playing.observedCount()).toBe(0);
  });

  it('does not write a console error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = await mount({ canAutoPlay: true, uploadProgress: 0.5 });
    await click(el.firstElementChild!);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
