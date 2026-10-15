// Original test (not in telegram-tt): Blockquote and useCollapsibleLines on the frameact runtime (jsdom has no layout: the
// line count and heights are faked on the prototypes).
import { createSignal } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';

import Blockquote from './Blockquote';

const harness = useDomHarness();
const violations: string[] = [];
const disposers: (() => void)[] = [];
const restore: (() => void)[] = [];

const LINE_HEIGHT = 20;

/** `lines` lines of 20px for every element: `scrollHeight` and the computed `line-height`. */
function fakeLines(lines: number) {
  const proto = HTMLElement.prototype;
  const original = Object.getOwnPropertyDescriptor(proto, 'scrollHeight');
  Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => lines * LINE_HEIGHT });
  const originalComputed = window.getComputedStyle;
  window.getComputedStyle = (element: Element) => {
    const style = originalComputed.call(window, element);
    return new Proxy(style, {
      get: (target, key) => {
        if (key === 'lineHeight') return `${LINE_HEIGHT}px`;
        const value = Reflect.get(target, key) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };
  restore.push(() => {
    if (original) Object.defineProperty(proto, 'scrollHeight', original);
    else delete (proto as unknown as Record<string, unknown>).scrollHeight;
    window.getComputedStyle = originalComputed;
  });
}

beforeEach(() => {
  violations.length = 0;
  delegateEvents(['click']);
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
  await harness.frame();
  return el;
}

describe('Blockquote', () => {
  it('renders the content of a quote that cannot collapse as it is', async () => {
    fakeLines(10);
    const el = await mount(() => <Blockquote>text</Blockquote>);

    const quote = el.querySelector('blockquote')!;
    expect(quote.getAttribute('data-entity-type')).toBe('MessageEntityBlockquote');
    expect(quote.textContent).toBe('text');
    expect(quote.hasAttribute('data-collapsed')).toBe(false);
    expect(quote.style.maxHeight).toBe('');
    expect(el.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('collapses a long quote to four lines, with a toggle that expands and collapses it', async () => {
    fakeLines(10);
    const el = await mount(() => <Blockquote canBeCollapsible>long quote</Blockquote>);

    const quote = el.querySelector('blockquote')!;
    expect(quote.hasAttribute('data-collapsed')).toBe(true);
    expect(quote.style.maxHeight).toBe(`${4 * LINE_HEIGHT}px`);
    // Not editable while collapsed (it matters in the composer), and no attribute at all when expanded
    expect(quote.getAttribute('contenteditable')).toBe('false');
    const toggle = el.querySelector<HTMLElement>('[aria-hidden="true"]')!;
    expect(toggle).not.toBeNull();

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await harness.frame();
    expect(quote.hasAttribute('data-collapsed')).toBe(false);
    expect(quote.style.maxHeight).toBe(`${10 * LINE_HEIGHT}px`);
    expect(quote.hasAttribute('contenteditable')).toBe(false);

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await harness.frame();
    expect(quote.hasAttribute('data-collapsed')).toBe(true);
    expect(quote.style.maxHeight).toBe(`${4 * LINE_HEIGHT}px`);
  });

  it('expands with a click on the collapsed quote itself, unless toggling is disabled', async () => {
    fakeLines(10);
    const el = await mount(() => <Blockquote canBeCollapsible>long quote</Blockquote>);
    const quote = el.querySelector('blockquote')!;

    quote.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await harness.frame();
    expect(quote.hasAttribute('data-collapsed')).toBe(false);

    const disabled = await mount(() => (
      <Blockquote canBeCollapsible isToggleDisabled>
        long quote
      </Blockquote>
    ));
    const disabledQuote = disabled.querySelector('blockquote')!;
    disabledQuote.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await harness.frame();
    expect(disabledQuote.hasAttribute('data-collapsed')).toBe(true);
  });

  it('does not collapse a short quote', async () => {
    fakeLines(3);
    const el = await mount(() => <Blockquote canBeCollapsible>short quote</Blockquote>);

    const quote = el.querySelector('blockquote')!;
    expect(quote.hasAttribute('data-collapsed')).toBe(false);
    expect(el.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('is controlled by isCollapsed and reports the changes', async () => {
    fakeLines(10);
    const [isCollapsed, setIsCollapsed] = createSignal(true);
    const onCollapseChange = vi.fn();
    const el = await mount(() => (
      <Blockquote canBeCollapsible isCollapsed={isCollapsed()} onCollapseChange={onCollapseChange}>
        long quote
      </Blockquote>
    ));
    const quote = el.querySelector('blockquote')!;
    expect(quote.hasAttribute('data-collapsed')).toBe(true);

    el.querySelector<HTMLElement>('[aria-hidden="true"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await harness.frame();
    // The parent decides: nothing changed, the change was reported
    expect(onCollapseChange).toHaveBeenCalledWith(false);
    expect(quote.hasAttribute('data-collapsed')).toBe(true);

    setIsCollapsed(false);
    await harness.frame();
    await harness.frame();
    expect(quote.hasAttribute('data-collapsed')).toBe(false);
  });

  it('follows canBeCollapsible: a quote that can collapse later gets the toggle (expanded, as in tt)', async () => {
    fakeLines(10);
    const [canBeCollapsible, setCanBeCollapsible] = createSignal(false);
    const el = await mount(() => <Blockquote canBeCollapsible={canBeCollapsible()}>long quote</Blockquote>);
    const quote = el.querySelector('blockquote')!;
    expect(quote.hasAttribute('data-collapsed')).toBe(false);
    expect(el.querySelector('[aria-hidden="true"]')).toBeNull();

    setCanBeCollapsible(true);
    await harness.frame();
    await harness.frame();
    await harness.frame();
    expect(el.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(quote.hasAttribute('data-collapsed')).toBe(false);

    el.querySelector<HTMLElement>('[aria-hidden="true"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await harness.frame();
    expect(quote.hasAttribute('data-collapsed')).toBe(true);
    expect(quote.style.maxHeight).toBe(`${4 * LINE_HEIGHT}px`);
  });
});
