// Original test (not in telegram-tt): the components the rich-text renderer needs (CodeBlock, FormattedDate,
// TonAddressLink) and the hook useSchedule, on the frameact runtime (jsdom).
import { createSignal, flushSync } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { addActionHandler, setGlobal } from '../../global';

import { ApiMessageEntityTypes } from '../../api/types';

import { container, useDomHarness } from '../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../global/initialState';
import { getCurrentTabId } from '../../util/establishMultitabRole';
import { cloneDeep } from '../../util/iteratees';

import useSchedule from '../../hooks/useSchedule';

import Skeleton from '../ui/placeholder/Skeleton';
import CodeBlock from './code/CodeBlock';
import FormattedDate from './FormattedDate';
import TonAddressLink from './TonAddressLink';

const mocks = vi.hoisted(() => ({
  copied: [] as string[],
  calendarProps: [] as Record<string, unknown>[],
}));
vi.mock('../../util/clipboard', () => ({
  copyTextToClipboard: (text: string) => {
    mocks.copied.push(text);
  },
}));
vi.mock('./CalendarModal.async', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.calendarProps.push(props);
    return undefined;
  },
}));

const harness = useDomHarness();
const violations: string[] = [];
const disposers: (() => void)[] = [];
const restore: (() => void)[] = [];

const tabId = getCurrentTabId();
// The handler of tt (global/actions/ui/initial.ts) is not loaded: the part of the components is the payload they send
const notifications: unknown[] = [];
addActionHandler('showNotification', (global, actions, payload) => {
  notifications.push(payload.message);
});

beforeAll(() => {
  setGlobal(
    { ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: { ...cloneDeep(INITIAL_TAB_STATE), id: tabId } } },
    { forceOutdated: true },
  );
});

beforeEach(() => {
  violations.length = 0;
  mocks.copied.length = 0;
  mocks.calendarProps.length = 0;
  notifications.length = 0;
  delegateEvents(['click', 'contextmenu', 'mousedown', 'mouseup']);
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}]`));
});

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  restore.splice(0).forEach((undo) => undo());
  setHandler();
  disableStrict();
  vi.useRealTimers();
  expect(violations).toEqual([]);
});

async function mount(element: () => unknown) {
  const el = suppressStrict(container);
  disposers.push(render(element, el));
  await harness.frame();
  await harness.frame();
  return el;
}

const click = (target: Element) => {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  flushSync();
};

/** The element of the code block is wide enough for twice its lines: the word wrap button is needed. */
function fakeWrappingLines() {
  const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 100 });
  const getComputedStyle = window.getComputedStyle;
  window.getComputedStyle = (() => ({ lineHeight: '20px' })) as unknown as typeof window.getComputedStyle;
  restore.push(() => {
    if (clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight);
    window.getComputedStyle = getComputedStyle;
  });
}

describe('CodeBlock', () => {
  it('shows the text, the language title and the copy button, which copies the text', async () => {
    const el = await mount(() => <CodeBlock text={'a < b && c'} language="python" />);

    expect(el.querySelector('.code-title')!.textContent).toBe('Python');
    expect(el.querySelector('pre')!.getAttribute('data-language')).toBe('python');
    expect(el.querySelector('pre')!.textContent).toContain('a < b && c');
    expect(el.querySelector('.CodeBlock')).not.toBeNull();

    click(el.querySelector('.icon-copy')!.parentElement!);
    expect(mocks.copied).toEqual(['a < b && c']);
    expect(notifications).toEqual([expect.stringMatching(/TextCopied|copied/i)]);
  });

  it('has no title without a language and no copy button when protected', async () => {
    const el = await mount(() => <CodeBlock text="x" noCopy />);

    expect(el.querySelector('.code-title')).toBeNull();
    expect(el.querySelector('.icon-copy')).toBeNull();
  });

  it('follows the text and the language', async () => {
    const [text, setText] = createSignal('first');
    const [language, setLanguage] = createSignal<string | undefined>(undefined);
    const el = await mount(() => <CodeBlock text={text()} language={language()} />);
    expect(el.querySelector('pre')!.textContent).toContain('first');

    setText('second');
    setLanguage('rust');
    await harness.frame();
    expect(el.querySelector('pre')!.textContent).toContain('second');
    expect(el.querySelector('.code-title')!.textContent).toBe('Rust');

    setLanguage(undefined);
    await harness.frame();
    expect(el.querySelector('.code-title')).toBeNull();
  });

  it('offers the word wrap toggle when the lines wrap, and the toggle switches it off and on', async () => {
    fakeWrappingLines();
    const el = await mount(() => <CodeBlock text="a very long line of code" />);
    await harness.frame();

    const pre = el.querySelector('pre')!;
    expect(pre.classList.contains('no-word-wrap')).toBe(false);
    const wrap = el.querySelector<HTMLElement>('[title="Word Wrap"]')!;
    expect(wrap).not.toBeNull();
    const wrapOn = Array.from(wrap.classList).find((name) => name.includes('wrapOn'));
    expect(wrapOn).toBeDefined();

    click(wrap);
    expect(pre.classList.contains('no-word-wrap')).toBe(true);
    expect(wrap.classList.contains(wrapOn!)).toBe(false);

    click(wrap);
    expect(pre.classList.contains('no-word-wrap')).toBe(false);
    expect(wrap.classList.contains(wrapOn!)).toBe(true);
  });

  it('shows no word wrap toggle when the lines do not wrap', async () => {
    const el = await mount(() => <CodeBlock text="short" />);
    await harness.frame();

    expect(el.querySelector('[title="Word Wrap"]')).toBeNull();
  });
});

describe('FormattedDate', () => {
  const date = Date.UTC(2024, 4, 1, 12) / 1000;
  const entity = { type: ApiMessageEntityTypes.FormattedDate, offset: 0, length: 4, date, shortDate: true } as const;

  it('shows the formatted date in a link with the unix time, the format and the canonical date', async () => {
    const el = await mount(() => <FormattedDate entity={entity}>fallback</FormattedDate>);

    const link = el.querySelector('a')!;
    expect(link.getAttribute('data-unix')).toBe(String(date));
    expect(link.getAttribute('data-format')).toBe('d');
    expect(link.getAttribute('title')).toContain('2024');
    expect(link.textContent).not.toBe('fallback');
    expect(link.textContent.length).toBeGreaterThan(0);
  });

  it('shows the children when the entity has no format', async () => {
    const el = await mount(() => <FormattedDate entity={{ ...entity, shortDate: undefined }}>fallback</FormattedDate>);

    expect(el.querySelector('a')!.textContent).toBe('fallback');
    expect(el.querySelector('a')!.getAttribute('data-format')).toBe('');
  });

  it('is only the text in a preview', async () => {
    const el = await mount(() => (
      <FormattedDate entity={entity} asPreview>
        fallback
      </FormattedDate>
    ));

    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent.length).toBeGreaterThan(0);
  });

  it('opens a menu with a copy item on a context click, which copies the canonical date', async () => {
    const el = await mount(() => <FormattedDate entity={entity}>fallback</FormattedDate>);

    el.querySelector('a')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    flushSync();
    await harness.frame();
    await harness.frame();

    const item = document.querySelector<HTMLElement>('.MenuItem .icon-copy')?.parentElement;
    expect(item).toBeDefined();
    click(item!);
    expect(mocks.copied).toEqual([expect.stringContaining('2024')]);
    expect(notifications).toHaveLength(1);
  });

  it('ticks a relative date and does not tick a plain one', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    await mount(() => <FormattedDate entity={entity}>x</FormattedDate>);
    expect(setIntervalSpy).not.toHaveBeenCalled();

    const soon = Math.floor(Date.now() / 1000) + 30;
    await mount(() => <FormattedDate entity={{ ...entity, date: soon, relative: true }}>x</FormattedDate>);
    flushSync();
    expect(setIntervalSpy.mock.calls.map(([, delay]) => delay)).toContain(1000);
    expect(setIntervalSpy.mock.calls.every(([, delay]) => typeof delay === 'number' && delay > 0)).toBe(true);
  });
});

describe('TonAddressLink', () => {
  it('is a link with the text, which has a menu with the copy item (not in a protected chat)', async () => {
    const el = await mount(() => <TonAddressLink address="not-an-address">shown</TonAddressLink>);

    const link = el.querySelector('a')!;
    expect(link.textContent).toBe('shown');
    expect(link.getAttribute('data-entity-type')).toBe('MessageEntityTonAddress');

    link.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    flushSync();
    await harness.frame();
    await harness.frame();

    const item = document.querySelector<HTMLElement>('.MenuItem .icon-copy')?.parentElement;
    expect(item).toBeDefined();
    click(item!);
    expect(mocks.copied).toEqual(['not-an-address']);
  });

  it('has no menu in a protected chat for an address the wallet cannot take', async () => {
    const el = await mount(() => (
      <TonAddressLink address="not-an-address" noCopy>
        shown
      </TonAddressLink>
    ));

    el.querySelector('a')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    flushSync();
    await harness.frame();

    expect(document.querySelector('.MenuItem')).toBeNull();
  });
});

describe('useSchedule', () => {
  function Host(props: { canScheduleUntilOnline: boolean; openAt?: number; onReady: (r: unknown) => void }) {
    const [requestCalendar, calendar] = useSchedule(
      () => props.canScheduleUntilOnline,
      undefined,
      () => props.openAt,
    );
    props.onReady(requestCalendar);
    return <div>{calendar}</div>;
  }

  it('opens the calendar on request and gives the chosen time to the callback, once', async () => {
    let request: ((cb: (scheduledAt: number, repeatPeriod?: number) => void) => void) | undefined;
    await mount(() => <Host canScheduleUntilOnline={false} onReady={(r) => (request = r as typeof request)} />);

    const last = () => mocks.calendarProps[mocks.calendarProps.length - 1];
    expect(last().isOpen).toBe(false);

    const callback = vi.fn();
    request!(callback);
    flushSync();
    expect(last().isOpen).toBe(true);

    (last().onSubmit as (date: Date) => void)(new Date(Date.now() + 3_600_000));
    flushSync();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toBeGreaterThan(Date.now() / 1000);
    expect(last().isOpen).toBe(false);
  });

  it('offers "send when online" only when it can, and follows the open time', async () => {
    const [canSchedule, setCanSchedule] = createSignal(false);
    const [openAt, setOpenAt] = createSignal<number | undefined>(undefined);
    await mount(() => <Host canScheduleUntilOnline={canSchedule()} openAt={openAt()} onReady={() => {}} />);

    const last = () => mocks.calendarProps[mocks.calendarProps.length - 1];
    expect(last().secondButtonLabel).toBeUndefined();
    expect(last().onSecondButtonClick).toBeUndefined();

    setCanSchedule(true);
    flushSync();
    expect(last().secondButtonLabel).toBeDefined();
    expect(last().onSecondButtonClick).toBeInstanceOf(Function);

    const at = Math.floor(Date.UTC(2030, 0, 1, 10, 30, 45) / 1000);
    setOpenAt(at);
    flushSync();
    const selected = new Date(last().selectedAt as number);
    expect(selected.getSeconds()).toBe(0);
    expect(Math.abs(selected.getTime() / 1000 - at)).toBeLessThan(60);
  });
});

describe('Skeleton', () => {
  it('has the class of its variant and animation and the size as style', async () => {
    const el = await mount(() => <Skeleton variant="round" animation="wave" width={32} height={24} className="mine" />);

    const skeleton = el.querySelector<HTMLElement>('.Skeleton')!;
    expect(skeleton.className.split(' ')).toEqual(expect.arrayContaining(['Skeleton', 'round', 'wave', 'mine']));
    expect(skeleton.style.width).toBe('32px');
    expect(skeleton.style.height).toBe('24px');
    expect(skeleton.textContent).toBe('');
  });

  it('defaults to a rectangle without animation, and keeps the aspect ratio on request', async () => {
    const el = await mount(() => <Skeleton width={30} height={10} forceAspectRatio inline />);

    const skeleton = el.querySelector<HTMLElement>('.Skeleton')!;
    expect(skeleton.classList.contains('rectangular')).toBe(true);
    expect(skeleton.classList.contains('none')).toBe(true);
    expect(skeleton.classList.contains('inline')).toBe(true);
    expect(skeleton.style.height).toBe('');
    expect(skeleton.style.aspectRatio).toBe('30/10');
    expect(skeleton.textContent).toBe('\u00A0');
  });
});
