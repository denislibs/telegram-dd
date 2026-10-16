// Original test (not in telegram-tt): the photo of a message shows only the blocks its state needs, runs the click state machine
// (spoiler -> reveal -> open, load toggle, upload cancel), keeps a revealed spoiler across message updates, writes the
// custom appendix of the message and bounds the numbers of the server.
import { createSignal } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlobal, setGlobal } from '../../../global';

import type { ApiPhoto } from '../../../api/types';
import type { GlobalState, TabState } from '../../../global/types';
import type { ThemeKey } from '../../../types';

import { CUSTOM_APPENDIX_ATTRIBUTE } from '../../../config';
import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';
import {
  PLACEHOLDER_MAX_ASPECT_RATIO,
  PLACEHOLDER_MAX_MEDIA_PX,
  PLACEHOLDER_MIN_ASPECT_RATIO,
} from '../../common/helpers/placeholder';

import Photo from './Photo';

const actions = vi.hoisted(() => {
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};
  const proxy = new Proxy(calls, {
    get(target, name: string) {
      return (target[name] ??= vi.fn());
    },
  });
  return { calls, proxy };
});

const appendix = vi.hoisted(() => ({ getCustomAppendixBg: vi.fn() }));
const loader = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('../../../global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../global')>()),
  getActions: () => actions.proxy,
}));
vi.mock('./helpers/getCustomAppendixBg', () => ({ default: appendix.getCustomAppendixBg }));
// A fetch that never resolves: nothing is loaded, nothing touches the network.
vi.mock('../../../util/mediaLoader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../util/mediaLoader')>()),
  fetch: loader.fetch,
}));
// The spinner draws on a 2d canvas, which jsdom does not have.
vi.mock('../../ui/ProgressSpinner', () => ({
  default: (props: { progress?: number; onClick?: (e: MouseEvent) => void }) => {
    const el = document.createElement('div');
    el.className = 'ProgressSpinner';
    el.addEventListener('click', (e) => props.onClick?.(e));
    return el;
  },
}));

const tabId = getCurrentTabId();
const BLOB_URL = 'blob:http://localhost/photo-1';

function buildPhoto(extra?: Partial<ApiPhoto>): ApiPhoto {
  return {
    mediaType: 'photo',
    id: '1',
    date: 1,
    sizes: [{ type: 'x', width: 800, height: 600 }],
    blobUrl: BLOB_URL,
    ...extra,
  };
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

describe('Photo', () => {
  const harness = useDomHarness();
  const disposers: Array<() => void> = [];
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    // jsdom has no modal dialog (the confirmation of a sensitive photo is one).
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.open = false;
    };
    const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
    const global: GlobalState = { ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: tab } };
    setGlobal(global, { forceOutdated: true });
  });

  beforeEach(() => {
    delegateEvents(['click', 'mousedown', 'contextmenu']);
    appendix.getCustomAppendixBg.mockReset();
    loader.fetch.mockReset();
    loader.fetch.mockImplementation(() => new Promise(() => undefined));
    consoleError = vi.spyOn(console, 'error');
  });

  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose();
    // No error of the framework (phase violations, effects) in any test.
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
    for (const mock of Object.values(actions.calls)) mock.mockClear();
  });

  async function settle() {
    await harness.frame();
    await harness.frame();
  }

  async function mount(jsx: () => any, into: HTMLElement = container()) {
    disposers.push(render(jsx, into));
    await settle();
    return into;
  }

  function frameOf(el: HTMLElement) {
    return el.querySelector<HTMLElement>('.media-inner')!;
  }

  function isSpoilerCovering(el: HTMLElement) {
    return Boolean(el.querySelector('.media-spoiler.open'));
  }

  it('a loaded photo renders the frame, the blurred background and the image, and nothing else', async () => {
    const el = await mount(() => <Photo photo={buildPhoto()} theme="light" />);

    const frame = frameOf(el);
    expect(frame.className).toMatch(/frame/);
    expect(frame.className).toMatch(/intrinsic/);
    expect(frame.classList.contains('interactive')).toBe(true);
    expect(frame.getAttribute('style')).toContain('--media-width: 800px');
    expect(frame.getAttribute('style')).toContain(`--media-aspect-ratio: ${800 / 600}`);

    const image = el.querySelector<HTMLImageElement>('img.full-media')!;
    expect(image.getAttribute('src')).toBe(BLOB_URL);
    expect(image.getAttribute('alt')).toBe('');
    expect(image.getAttribute('draggable')).toBe('true');
    expect(frame.querySelector('canvas.blurred-bg')).not.toBeNull();

    // nothing for the states the photo is not in
    expect(el.querySelector('.media-spoiler')).toBeNull();
    expect(el.querySelector('.media-loading, .ProgressSpinner')).toBeNull();
    expect(el.querySelector('.message-transfer-progress')).toBeNull();
    expect(el.querySelector('.protector')).toBeNull();
    expect(el.querySelector('canvas.thumbnail:not(.blurred-bg)')).toBeNull();
    expect(frame.querySelectorAll('*').length).toBe(2);
    expect(loader.fetch).not.toHaveBeenCalled();
  });

  it('a protected photo cannot be dragged and has the protector', async () => {
    const el = await mount(() => <Photo photo={buildPhoto()} theme="light" isProtected />);

    expect(el.querySelector('img.full-media')!.getAttribute('draggable')).toBe('false');
    expect(el.querySelector('.protector')).not.toBeNull();
  });

  it('an interactive photo calls onClick with its clickArg; a non-interactive one has no interactive class', async () => {
    const onClick = vi.fn();
    const el = await mount(() => (
      <Photo photo={buildPhoto()} theme="light" clickArg={42} onClick={onClick} nonInteractive />
    ));

    expect(frameOf(el).classList.contains('interactive')).toBe(false);
    frameOf(el).click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0]).toBe(42);
  });

  it('a spoiler covers the photo until a click and the second click opens it', async () => {
    const onClick = vi.fn();
    const el = await mount(() => (
      <Photo photo={buildPhoto({ isSpoiler: true })} theme="light" clickArg="a" onClick={onClick} />
    ));
    expect(isSpoilerCovering(el)).toBe(true);

    frameOf(el).click();
    await settle();
    expect(onClick).not.toHaveBeenCalled();
    expect(isSpoilerCovering(el)).toBe(false);

    frameOf(el).click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0]).toBe('a');
  });

  it('noSpoilerReveal passes the click through and leaves the spoiler', async () => {
    const onClick = vi.fn();
    const el = await mount(() => (
      <Photo photo={buildPhoto({ isSpoiler: true })} theme="light" clickArg="a" onClick={onClick} noSpoilerReveal />
    ));

    frameOf(el).click();
    await settle();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(isSpoilerCovering(el)).toBe(true);
  });

  it('a revealed spoiler stays revealed when the photo object of the message is replaced', async () => {
    const [photo, setPhoto] = createSignal(buildPhoto({ isSpoiler: true }));
    const el = await mount(() => <Photo photo={photo()} theme="light" />);

    frameOf(el).click();
    await settle();
    expect(isSpoilerCovering(el)).toBe(false);

    // the message is updated (views, reactions): a new object, the same spoiler flag
    setPhoto({ ...photo(), date: 2 });
    await settle();
    setPhoto({ ...photo(), sizes: [{ type: 'x', width: 800, height: 600 }] });
    await settle();
    expect(isSpoilerCovering(el)).toBe(false);
  });

  it('the spoiler follows a change of the spoiler flag itself', async () => {
    const [photo, setPhoto] = createSignal(buildPhoto());
    const el = await mount(() => <Photo photo={photo()} theme="light" />);
    expect(el.querySelector('.media-spoiler')).toBeNull();

    setPhoto(buildPhoto({ isSpoiler: true }));
    await settle();
    expect(isSpoilerCovering(el)).toBe(true);
  });

  it('a sensitive photo is covered; a click opens the confirmation and does not open the photo', async () => {
    const onClick = vi.fn();
    const el = await mount(() => <Photo photo={buildPhoto()} theme="light" isMediaNsfw onClick={onClick} />);
    expect(isSpoilerCovering(el)).toBe(true);

    frameOf(el).click();
    await settle();
    expect(onClick).not.toHaveBeenCalled();
    expect(isSpoilerCovering(el)).toBe(true);
    expect(actions.calls.openAgeVerificationModal).not.toHaveBeenCalled();
    expect(document.body.querySelector('dialog')).not.toBeNull();
  });

  it('a sensitive photo asks for the age verification when the app config needs it', async () => {
    const global = getGlobal();
    setGlobal(
      { ...global, appConfig: { ...global.appConfig, needAgeVideoVerification: true } },
      { forceOutdated: true },
    );
    try {
      const onClick = vi.fn();
      const el = await mount(() => <Photo photo={buildPhoto()} theme="light" isMediaNsfw onClick={onClick} />);

      frameOf(el).click();
      await settle();
      expect(actions.calls.openAgeVerificationModal).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();
    } finally {
      setGlobal(global, { forceOutdated: true });
    }
  });

  it('an upload shows the percentage; a click on the spinner cancels it and does not open the photo', async () => {
    const onClick = vi.fn();
    const onCancelUpload = vi.fn();
    const el = await mount(() => (
      <Photo
        photo={buildPhoto()}
        theme="light"
        clickArg="u"
        uploadProgress={0.4}
        onClick={onClick}
        onCancelUpload={onCancelUpload}
      />
    ));

    expect(el.querySelector('.message-transfer-progress')!.textContent).toBe('40%');
    expect(frameOf(el).classList.contains('interactive')).toBe(false);

    // a click on the photo itself does nothing while it uploads
    frameOf(el).click();
    expect(onClick).not.toHaveBeenCalled();
    expect(onCancelUpload).not.toHaveBeenCalled();

    el.querySelector<HTMLElement>('.ProgressSpinner')!.click();
    expect(onCancelUpload).toHaveBeenCalledTimes(1);
    expect(onCancelUpload.mock.calls[0][0]).toBe('u');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('an upload that starts after the photo was created is cancelled by the same click', async () => {
    const [progress, setProgress] = createSignal<number | undefined>(undefined);
    const onClick = vi.fn();
    const onCancelUpload = vi.fn();
    const el = await mount(() => (
      <Photo
        photo={buildPhoto()}
        theme="light"
        uploadProgress={progress()}
        onClick={onClick}
        onCancelUpload={onCancelUpload}
      />
    ));

    setProgress(0.1);
    await settle();
    frameOf(el).click();
    expect(onClick).not.toHaveBeenCalled();

    el.querySelector<HTMLElement>('.ProgressSpinner')!.click();
    expect(onCancelUpload).toHaveBeenCalledTimes(1);

    setProgress(undefined);
    await settle();
    frameOf(el).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('the upload progress is bounded to 0..100%', async () => {
    const [progress, setProgress] = createSignal<number | undefined>(1e9);
    const el = await mount(() => <Photo photo={buildPhoto()} theme="light" uploadProgress={progress()} />);
    const badge = () => el.querySelector('.message-transfer-progress')!.textContent;

    expect(badge()).toBe('100%');
    for (const value of [-5, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      setProgress(value);
      await settle();
      expect(badge()).toBe('0%');
    }
  });

  it('an unloaded photo shows the thumb and the download button; a click starts the load and a second one stops it', async () => {
    const el = await mount(() => (
      <Photo photo={buildPhoto({ blobUrl: undefined })} theme="light" canAutoLoad={false} />
    ));

    expect(el.querySelector('img.full-media')).toBeNull();
    expect(el.querySelector('canvas.thumbnail:not(.blurred-bg)')).not.toBeNull();
    expect(el.querySelector('.icon-download')).not.toBeNull();
    expect(loader.fetch).not.toHaveBeenCalled();

    frameOf(el).click();
    await settle();
    expect(loader.fetch).toHaveBeenCalled();
    // the spinner takes the place of the download button once its close transition is over
    await wait(400);
    await settle();
    expect(el.querySelector('.icon-download')).toBeNull();
    expect(el.querySelector('.media-loading')).not.toBeNull();

    frameOf(el).click();
    await settle();
    expect(el.querySelector('.icon-download')).not.toBeNull();
    expect(el.querySelector('.media-loading')).toBeNull();
  });

  it('a pictogram has no inline size, no blurred background and is square', async () => {
    const el = await mount(() => <Photo photo={buildPhoto()} theme="light" size="pictogram" />);

    const frame = frameOf(el);
    expect(frame.className).toMatch(/pictogram/);
    expect(frame.classList.contains('square-image')).toBe(true);
    expect(frame.getAttribute('style') ?? '').not.toContain('--media-width');
    expect(frame.querySelector('canvas.blurred-bg')).toBeNull();
  });

  it('the fill layout, the class name and the id are kept; a square photo is marked', async () => {
    const el = await mount(() => (
      <Photo
        photo={buildPhoto({ sizes: [{ type: 'x', width: 300, height: 300 }] })}
        theme="light"
        layout="fill"
        className="extra"
        id="p1"
      />
    ));

    const frame = frameOf(el);
    expect(frame.id).toBe('p1');
    expect(frame.className).toMatch(/fill/);
    expect(frame.classList.contains('extra')).toBe(true);
    expect(frame.classList.contains('square-image')).toBe(true);
    expect(frame.querySelector('canvas.blurred-bg')).toBeNull();
  });

  it('hostile dimensions give finite, bounded custom properties', async () => {
    const hostile = [
      [Number.NaN, 5],
      [0, 0],
      [-5, -5],
      [1e9, 1],
      [1, 1e9],
      [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
      [1e308, 1e-300],
    ];
    for (const [width, height] of hostile) {
      const withSizes = await mount(() => (
        <Photo photo={buildPhoto({ sizes: [{ type: 'x', width, height }], thumbnail: undefined })} theme="light" />
      ));
      const withThumbnail = await mount(() => (
        <Photo photo={buildPhoto({ sizes: [], thumbnail: { width, height } })} theme="light" />
      ));

      for (const root of [withSizes, withThumbnail]) {
        const style = frameOf(root).getAttribute('style')!;
        expect(style).not.toMatch(/NaN|Infinity|e\+\d|e-\d/);
        const mediaWidth = Number(/--media-width: ([\d.]+)px/.exec(style)![1]);
        const ratio = Number(/--media-aspect-ratio: ([\d.]+)/.exec(style)![1]);
        expect(mediaWidth).toBeGreaterThan(0);
        expect(mediaWidth).toBeLessThanOrEqual(PLACEHOLDER_MAX_MEDIA_PX);
        expect(ratio).toBeGreaterThanOrEqual(PLACEHOLDER_MIN_ASPECT_RATIO);
        expect(ratio).toBeLessThanOrEqual(PLACEHOLDER_MAX_ASPECT_RATIO);
      }
    }
  });

  describe('custom appendix', () => {
    function buildMessageContent() {
      const message = document.createElement('div');
      message.className = 'Message';
      message.dataset.messageId = '17';
      const content = document.createElement('div');
      content.className = 'message-content';
      message.appendChild(content);
      document.body.appendChild(message);
      return content;
    }

    it('is set on the message content when the photo affects it and removed when it stops', async () => {
      appendix.getCustomAppendixBg.mockResolvedValue('rgb(1,2,3)');
      const content = buildMessageContent();
      const [shouldAffectAppendix, setShouldAffectAppendix] = createSignal(true);

      await mount(
        () => <Photo photo={buildPhoto()} theme="light" isOwn shouldAffectAppendix={shouldAffectAppendix()} />,
        content,
      );
      await wait(0);
      await settle();

      expect(appendix.getCustomAppendixBg).toHaveBeenCalledWith(BLOB_URL, true, 17, undefined, 'light');
      expect(content.hasAttribute(CUSTOM_APPENDIX_ATTRIBUTE)).toBe(true);
      expect(content.style.getPropertyValue('--appendix-bg')).toBe('rgb(1,2,3)');

      setShouldAffectAppendix(false);
      await settle();
      expect(content.hasAttribute(CUSTOM_APPENDIX_ATTRIBUTE)).toBe(false);
    });

    it('is left alone when the photo never affected it', async () => {
      const content = buildMessageContent();
      await mount(() => <Photo photo={buildPhoto()} theme="light" />, content);
      await settle();

      expect(appendix.getCustomAppendixBg).not.toHaveBeenCalled();
      expect(content.hasAttribute(CUSTOM_APPENDIX_ATTRIBUTE)).toBe(false);
      expect(content.classList.contains('has-appendix-thumb')).toBe(false);
    });

    it('marks the thumb appendix while the photo is not loaded', async () => {
      const content = buildMessageContent();
      await mount(
        () => <Photo photo={buildPhoto({ blobUrl: undefined })} theme="light" shouldAffectAppendix />,
        content,
      );
      await settle();

      expect(content.classList.contains('has-appendix-thumb')).toBe(true);
      expect(appendix.getCustomAppendixBg).not.toHaveBeenCalled();
    });

    it('drops the result of an older request when the dependencies changed meanwhile', async () => {
      const resolvers: Array<(value: string) => void> = [];
      appendix.getCustomAppendixBg.mockImplementation(() => new Promise<string>((resolve) => resolvers.push(resolve)));
      const content = buildMessageContent();
      const [theme, setTheme] = createSignal<ThemeKey>('light');

      await mount(() => <Photo photo={buildPhoto()} theme={theme()} shouldAffectAppendix />, content);
      await settle();
      setTheme('dark');
      await settle();
      expect(resolvers).toHaveLength(2);

      // the newer request resolves first, the older one afterwards
      resolvers[1]('rgb(0,0,2)');
      await wait(0);
      await settle();
      resolvers[0]('rgb(0,0,1)');
      await wait(0);
      await settle();

      expect(content.style.getPropertyValue('--appendix-bg')).toBe('rgb(0,0,2)');
    });

    it('survives a failing worker', async () => {
      appendix.getCustomAppendixBg.mockRejectedValue(new Error('cannot decode'));
      const content = buildMessageContent();

      await mount(() => <Photo photo={buildPhoto()} theme="light" shouldAffectAppendix />, content);
      await wait(0);
      await settle();

      expect(content.hasAttribute(CUSTOM_APPENDIX_ATTRIBUTE)).toBe(false);
    });
  });
});
