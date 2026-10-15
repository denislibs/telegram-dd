// Original test (not in telegram-tt): the round video: its 240 px square, the click state machine (load toggle, play, the
// single-player rule), the progress ring with the numbers of the stream, the one-time (TTL) variant and the cleanup.
import { delegateEvents, render } from 'frameact/dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getActions, setGlobal } from '../../../global';

import type { ApiMessage, ApiVideo } from '../../../api/types';
import type { TabState } from '../../../global/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { stopCurrentAudio } from '../../../util/audioPlayback/playbackController';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';

import RoundVideo from './RoundVideo';

vi.mock('../../../util/mediaLoader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../util/mediaLoader')>()),
  // Nothing is fetched: a load that was asked for stays pending.
  fetch: vi.fn(() => new Promise(() => {})),
  getFromMemory: vi.fn(() => undefined),
  cancelProgress: vi.fn(),
  removeCallback: vi.fn(),
}));

vi.mock('../../../util/audioPlayback/playbackController', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../util/audioPlayback/playbackController')>()),
  stopCurrentAudio: vi.fn(),
}));

const tabId = getCurrentTabId();
const BLOB_URL = 'blob:http://localhost/round-1';

function buildVideo(extra?: Partial<ApiVideo>): ApiVideo {
  return {
    mediaType: 'video',
    id: '7',
    mimeType: 'video/mp4',
    duration: 12,
    fileName: 'round.mp4',
    size: 1000,
    width: 240,
    height: 240,
    isRound: true,
    blobUrl: BLOB_URL,
    ...extra,
  };
}

function buildMessage(video: ApiVideo = buildVideo(), extra?: Partial<ApiMessage>): ApiMessage {
  return { id: 1, chatId: '100', date: 1_700_000_000, isOutgoing: false, content: { video }, ...extra };
}

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
    set(isIntersecting: boolean) {
      callbacks.forEach((callback) => callback({ isIntersecting } as IntersectionObserverEntry));
    },
  };
}

/** The properties jsdom lacks on a media element, as the stream would report them. */
function defineMediaState(
  videoEl: HTMLVideoElement,
  state: { duration?: number; currentTime?: number; paused?: boolean },
) {
  Object.entries(state).forEach(([key, value]) => {
    Object.defineProperty(videoEl, key, { configurable: true, writable: true, value });
  });
}

/** The actions are registered by the global modules that this test does not load: it provides the ones the component calls. */
const actions = getActions() as unknown as Record<string, ReturnType<typeof vi.fn>>;
const ACTION_NAMES = ['cancelMediaDownload', 'openOneTimeMediaModal', 'transcribeAudio'];

describe('RoundVideo', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;
  let play: ReturnType<typeof vi.spyOn>;
  let pause: ReturnType<typeof vi.spyOn>;

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

    const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
    setGlobal({ ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: tab } }, { forceOutdated: true });
    // jsdom has no focused document, which the player takes for a background tab (autoplay is paused then).
    window.dispatchEvent(new Event('focus'));
  });

  beforeEach(() => {
    delegateEvents(['click', 'mousedown']);
    ACTION_NAMES.forEach((name) => {
      actions[name] = vi.fn();
    });
    play.mockClear();
    pause.mockClear();
    vi.mocked(stopCurrentAudio).mockClear();
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    ACTION_NAMES.forEach((name) => {
      delete actions[name];
    });
  });

  async function mount(props: Partial<Parameters<typeof RoundVideo>[0]> = {}) {
    const el = container();
    dispose = render(() => <RoundVideo message={buildMessage()} canAutoLoad {...props} />, el);
    await settle();
    return el;
  }

  async function settle() {
    await harness.frame();
    await harness.frame();
  }

  async function click(target: Element) {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
  }

  /** A mouse press of a `Button`: it reacts to the mouse down on a desktop, and the click follows it. */
  async function press(target: Element) {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    await click(target);
  }

  const getRoot = (el: Element) => el.firstElementChild as HTMLElement;
  const getVideoEl = (el: Element) => el.querySelector<HTMLVideoElement>('video');
  const getCircle = (el: Element) => el.querySelector<SVGCircleElement>('circle.progress-circle');

  it('renders the 240 px square with the video, the duration and the muted mark', async () => {
    const el = await mount({ className: 'extra' });

    const root = getRoot(el);
    expect(root.classList.contains('RoundVideo')).toBe(true);
    expect(root.classList.contains('media-inner')).toBe(true);
    expect(root.classList.contains('extra')).toBe(true);
    expect(root.classList.contains('non-interactive')).toBe(false);

    const videoEl = getVideoEl(el)!;
    expect(videoEl.getAttribute('src')).toBe(BLOB_URL);
    expect(videoEl.getAttribute('width')).toBe('240');
    expect(videoEl.getAttribute('height')).toBe('240');
    expect(videoEl.classList.contains('full-media')).toBe(true);
    expect(videoEl.muted).toBe(true);
    expect(videoEl.loop).toBe(true);
    expect(videoEl.children.length).toBe(0);

    const canvas = el.querySelector<HTMLElement>('canvas.thumbnail');
    expect(canvas?.getAttribute('style')).toContain('width: 240px; height: 240px');

    expect(el.querySelector('.message-media-duration')!.textContent).toBe('0:12');
    expect(el.querySelector('.message-media-duration .muted-icon')).not.toBeNull();
    // The blocks that a plain round video does not need are not there.
    expect(getCircle(el)).toBeNull();
    expect(el.querySelector('.media-spoiler')).toBeNull();
    expect(el.querySelector('.play-wrapper')).toBeNull();
    // The spinner stays until the player reports that it is ready (jsdom never does).
    expect(el.querySelector('.media-loading')).not.toBeNull();
    expect(el.querySelector('.icon-download')).toBeNull();
    expect(el.querySelector('.transcribe-button')).toBeNull();
    expect(root.outerHTML).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('shows the download icon without media, and a click toggles the load', async () => {
    const message = buildMessage(buildVideo({ blobUrl: undefined }));
    const el = await mount({ message, canAutoLoad: false });

    expect(getVideoEl(el)).toBeNull();
    expect(el.querySelector('.icon-download')).not.toBeNull();

    await click(getRoot(el));
    expect(el.querySelector('.icon-download')).toBeNull();
    expect(el.querySelector('.media-loading')).not.toBeNull();

    await click(getRoot(el));
    expect(el.querySelector('.icon-download')).not.toBeNull();
  });

  it('cancels the download on a click while it downloads', async () => {
    const message = buildMessage();
    const el = await mount({ message, isDownloading: true });

    await click(getRoot(el));

    expect(actions.cancelMediaDownload).toHaveBeenCalledTimes(1);
    expect(actions.cancelMediaDownload.mock.calls[0][0].media.id).toBe('7');
    expect(getCircle(el)).toBeNull();
  });

  it('starts playing with sound on a click, shows the ring and the time, and pauses on the next click', async () => {
    const el = await mount();
    const videoEl = getVideoEl(el)!;
    defineMediaState(videoEl, { duration: 10, currentTime: 0, paused: true });

    await click(getRoot(el));

    // The iOS workaround: pause, rewind, then play.
    expect(pause).toHaveBeenCalled();
    expect(videoEl.currentTime).toBe(0);
    expect(play.mock.contexts).toContain(videoEl);
    expect(stopCurrentAudio).toHaveBeenCalledTimes(1);
    expect(videoEl.muted).toBe(false);
    expect(videoEl.loop).toBe(false);
    expect(getCircle(el)).not.toBeNull();
    expect(el.querySelector('.message-media-duration')!.textContent).toBe('0:00');

    // A time update moves the time and the ring.
    defineMediaState(videoEl, { currentTime: 4, paused: false });
    videoEl.dispatchEvent(new Event('timeupdate'));
    await settle();
    expect(el.querySelector('.message-media-duration')!.textContent).toBe('0:04');
    expect(el.querySelector('.message-media-duration .muted-icon')).toBeNull();

    pause.mockClear();
    await click(getRoot(el));
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('plays again on a click while it is paused after it was started', async () => {
    const el = await mount();
    const videoEl = getVideoEl(el)!;
    defineMediaState(videoEl, { duration: 10, currentTime: 0, paused: true });
    await click(getRoot(el));

    play.mockClear();
    vi.mocked(stopCurrentAudio).mockClear();
    await click(getRoot(el));

    expect(play.mock.contexts).toContain(videoEl);
    expect(stopCurrentAudio).toHaveBeenCalledTimes(1);
  });

  it('stops the first round video when another one is started (one player at a time)', async () => {
    const first = await mount();
    const second = container();
    const disposeSecond = render(() => <RoundVideo message={buildMessage()} canAutoLoad />, second);
    await settle();
    const firstVideo = getVideoEl(first)!;
    const secondVideo = getVideoEl(second)!;
    defineMediaState(firstVideo, { duration: 10, currentTime: 0, paused: true });
    defineMediaState(secondVideo, { duration: 10, currentTime: 0, paused: true });

    await click(getRoot(first));
    expect(getCircle(first)).not.toBeNull();

    await click(getRoot(second));
    expect(getCircle(second)).not.toBeNull();
    expect(getCircle(first)).toBeNull();
    expect(firstVideo.muted).toBe(true);
    expect(firstVideo.loop).toBe(true);

    disposeSecond();
  });

  it('does not touch a destroyed round video when another one is started', async () => {
    const first = await mount();
    const firstVideo = getVideoEl(first)!;
    defineMediaState(firstVideo, { duration: 10, currentTime: 0, paused: true });
    await click(getRoot(first));
    expect(getCircle(first)).not.toBeNull();

    dispose?.();
    dispose = undefined;
    await settle();
    play.mockClear();

    const second = container();
    dispose = render(() => <RoundVideo message={buildMessage()} canAutoLoad />, second);
    await settle();
    const secondVideo = getVideoEl(second)!;
    defineMediaState(secondVideo, { duration: 10, currentTime: 0, paused: true });
    await click(getRoot(second));

    expect(play.mock.contexts).toContain(secondVideo);
    expect(play.mock.contexts).not.toContain(firstVideo);
  });

  it('keeps the ring finite for a stream with a hostile duration or position', async () => {
    const hostile = [
      { duration: Number.NaN, currentTime: 0 },
      { duration: 0, currentTime: 0 },
      { duration: Number.POSITIVE_INFINITY, currentTime: 5 },
      { duration: -3, currentTime: 2 },
      { duration: 10, currentTime: Number.NaN },
      { duration: 10, currentTime: Number.POSITIVE_INFINITY },
      { duration: 10, currentTime: 1e12 },
    ];
    for (const state of hostile) {
      const el = await mount();
      const videoEl = getVideoEl(el)!;
      defineMediaState(videoEl, { ...state, paused: true });

      await click(getRoot(el));
      videoEl.dispatchEvent(new Event('timeupdate'));
      await settle();

      const circle = getCircle(el)!;
      for (const name of ['stroke-dashoffset', 'stroke-dasharray', 'r', 'cx', 'cy']) {
        const value = Number(circle.getAttribute(name));
        expect(Number.isFinite(value)).toBe(true);
      }
      const offset = Number(circle.getAttribute('stroke-dashoffset'));
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThanOrEqual(Number(circle.getAttribute('stroke-dasharray')));
      expect(el.querySelector('.message-media-duration')!.textContent).toMatch(/^\d{1,2}:\d{2}(:\d{2})?$/);
      expect(getRoot(el).outerHTML).not.toMatch(/NaN|Infinity|undefined/);

      dispose?.();
      dispose = undefined;
      document.body.textContent = '';
    }
  });

  it('shows a finite duration for a hostile duration of the video', async () => {
    for (const duration of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -9, 0, 1e308]) {
      const el = await mount({ message: buildMessage(buildVideo({ duration })) });

      expect(el.querySelector('.message-media-duration')!.textContent).toMatch(/^\d{1,2}:\d{2}(:\d{2})?$/);

      dispose?.();
      dispose = undefined;
      document.body.textContent = '';
    }
  });

  it('plays only while it intersects, and pauses when it is scrolled away', async () => {
    const observer = createFakeObserver();
    const el = await mount({ observeIntersection: observer.observe });

    // Not intersecting: the media is not loaded (and a blob is there), but nothing plays.
    expect(play).not.toHaveBeenCalled();

    observer.set(true);
    await settle();
    expect(play.mock.contexts).toContain(getVideoEl(el));

    pause.mockClear();
    observer.set(false);
    await settle();
    expect(pause.mock.contexts).toContain(getVideoEl(el));
  });

  it('calls onStop when the activated video ends, and stops itself without it', async () => {
    const onStop = vi.fn();
    const el = await mount({ onStop });
    const videoEl = getVideoEl(el)!;
    defineMediaState(videoEl, { duration: 10, currentTime: 0, paused: true });

    videoEl.dispatchEvent(new Event('ended'));
    await settle();
    expect(onStop).not.toHaveBeenCalled();

    await click(getRoot(el));
    videoEl.dispatchEvent(new Event('ended'));
    await settle();
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('returns to the looping muted state when the activated video ends without onStop', async () => {
    const el = await mount();
    const videoEl = getVideoEl(el)!;
    defineMediaState(videoEl, { duration: 10, currentTime: 0, paused: true });
    await click(getRoot(el));
    expect(getCircle(el)).not.toBeNull();

    videoEl.dispatchEvent(new Event('ended'));
    await settle();

    expect(getCircle(el)).toBeNull();
    expect(videoEl.muted).toBe(true);
  });

  it('reports the read of an unread media when it is activated', async () => {
    const onReadMedia = vi.fn();
    const message = buildMessage(buildVideo(), { isMediaUnread: true });
    const el = await mount({ message, onReadMedia });
    const videoEl = getVideoEl(el)!;
    defineMediaState(videoEl, { duration: 10, currentTime: 0, paused: true });

    expect(el.querySelector('.message-media-duration')!.classList.contains('unread')).toBe(true);
    expect(onReadMedia).not.toHaveBeenCalled();

    await click(getRoot(el));
    expect(onReadMedia).toHaveBeenCalledTimes(1);
  });

  it('covers a view-once video with a spoiler and a play mark and opens the one-time modal instead of playing', async () => {
    const openOneTimeMediaModal = actions.openOneTimeMediaModal;
    const onReadMedia = vi.fn();
    const message = buildMessage(buildVideo(), { content: { video: buildVideo(), ttlSeconds: 0 } });
    // Without the load the spinner is not there, and the play mark is.
    const el = await mount({ message, onReadMedia, canAutoLoad: false });

    expect(el.querySelector('.media-spoiler')).not.toBeNull();
    expect(el.querySelector('.play-wrapper')).not.toBeNull();
    expect(el.querySelector('.play-wrapper .view-once-icon')).not.toBeNull();
    expect(el.querySelector('canvas.thumbnail')).toBeNull();
    expect(getVideoEl(el)!.hasAttribute('autoplay')).toBe(false);

    await click(getRoot(el));

    expect(openOneTimeMediaModal).toHaveBeenCalledTimes(1);
    expect(openOneTimeMediaModal.mock.calls[0][0].message.id).toBe(1);
    expect(onReadMedia).toHaveBeenCalledTimes(1);
    expect(getCircle(el)).toBeNull();
  });

  it('plays at once inside the one-time modal, without the badge, and ignores pointer events', async () => {
    const el = await mount({
      origin: 'oneTimeModal',
      message: buildMessage(buildVideo(), { content: { video: buildVideo(), ttlSeconds: 0 } }),
    });

    expect(getRoot(el).classList.contains('non-interactive')).toBe(true);
    expect(el.querySelector('.message-media-duration')).toBeNull();
    expect(el.querySelector('.media-spoiler')).toBeNull();
    expect(getCircle(el)).not.toBeNull();
    expect(play.mock.contexts).toContain(getVideoEl(el));
  });

  it('shows the transcribe button and hands the click to the transcription props', async () => {
    const transcribeAudio = actions.transcribeAudio;
    const onHideTranscription = vi.fn();
    const el = await mount({ canTranscribe: true });

    const button = el.querySelector<HTMLElement>('.transcribe-button')!;
    expect(button).not.toBeNull();
    expect(button.querySelector('.icon-transcribe')).not.toBeNull();
    expect(el.querySelector('.loading-svg')).toBeNull();

    await press(button);
    expect(transcribeAudio).toHaveBeenCalledWith({ chatId: '100', messageId: 1 });
    // The click on the button is not a click on the video.
    expect(getCircle(el)).toBeNull();
    expect(stopCurrentAudio).not.toHaveBeenCalled();

    dispose?.();
    dispose = undefined;
    document.body.textContent = '';

    const transcribed = await mount({
      canTranscribe: true,
      isTranscribed: true,
      isTranscriptionHidden: true,
      onHideTranscription,
    });
    expect(transcribed.querySelector('.transcribe-button .icon-down')).not.toBeNull();
    await press(transcribed.querySelector('.transcribe-button')!);
    expect(onHideTranscription).toHaveBeenCalledWith(false);
  });

  it('shows the loading mark while it transcribes and does not start another transcription', async () => {
    const transcribeAudio = actions.transcribeAudio;
    const el = await mount({ canTranscribe: true, isTranscribing: true });

    expect(el.querySelector('.transcribe-button .loading-svg')).not.toBeNull();
    await press(el.querySelector('.transcribe-button')!);
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it('observes the square and stops observing when it is destroyed', async () => {
    const observed = new Set<HTMLElement>();
    const observe: ObserveFn = (target) => {
      observed.add(target);
      return () => {
        observed.delete(target);
      };
    };
    await mount({ observeIntersection: observe });
    expect(observed.size).toBe(1);

    dispose?.();
    dispose = undefined;
    await settle();

    expect(observed.size).toBe(0);
  });

  it('does not write a console error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = await mount({ canTranscribe: true });
    const videoEl = getVideoEl(el)!;
    defineMediaState(videoEl, { duration: 10, currentTime: 2, paused: true });
    await click(getRoot(el));
    videoEl.dispatchEvent(new Event('timeupdate'));
    await settle();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
