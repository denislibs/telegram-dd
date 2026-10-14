// DOM clobbering at the `document` level: `Document` has [LegacyOverrideBuiltIns], so `<img name="createTextNode">`
// shadows `document.createTextNode` in a browser. jsdom does not implement named properties; the test defines the
// same own, non-writable shadow on `document` and checks the kit (<Transition>, <ShowTransition>, <InfiniteScroll>)
// goes through the prototype natives. (Cut from frameact's test/dom/clobbering-document.test.ts, a3c2d7d.)
import { createSignal } from 'frameact';
import { createComponent, For, insert, render } from 'frameact/dom';
import { afterEach, expect, it } from 'vitest';

import { container, useDomHarness } from './testing/dom';
import { InfiniteScroll } from './infiniteScroll';
import { ShowTransition } from './showTransition';
import { Transition, type TransitionSlide } from './transition';

const { frame } = useDomHarness();
const ForC = For as (props: any) => unknown;

const mk = (tag: string): HTMLElement => Document.prototype.createElement.call(document, tag); // (the test itself must not use the shadowed methods)
const shadowed: string[] = [];
function shadow(name: string, value: unknown = mk('img')): void {
  Object.defineProperty(document, name, { value, writable: false, enumerable: false, configurable: true });
  shadowed.push(name);
}
afterEach(() => {
  for (const name of shadowed.splice(0)) delete (document as any)[name];
});

it('kit: <Transition>, <ShowTransition> and <InfiniteScroll> render and update with createElement, createTextNode and body shadowed', async () => {
  const host = container();
  shadow('createElement');
  shadow('createTextNode');
  shadow('body');
  const [key, setKey] = createSignal(0);
  const [open, setOpen] = createSignal(true);
  const [rows, setRows] = createSignal([1, 2]);
  const dispose = render(
    () => [
      createComponent(Transition, {
        get activeKey() {
          return key();
        },
        name: 'slide',
        children: (slide: TransitionSlide) => `slide ${slide.key}`,
      }),
      createComponent(ShowTransition, {
        get isOpen() {
          return open();
        },
        children: 'shown',
      }),
      createComponent(InfiniteScroll, {
        get items() {
          return rows();
        },
        get children() {
          return createComponent(ForC, {
            get each() {
              return rows();
            },
            children: (n: number) => {
              const li = mk('li');
              li.className = 'ListItem';
              insert(li, () => `row ${n}`);
              return li;
            },
          });
        },
      }),
    ],
    host,
  );
  expect(host.querySelector('.Transition_slide-active')!.textContent).toBe('slide 0');
  const shown = host.querySelector('.opacity-transition')!;
  expect(shown.textContent).toBe('shown');
  expect(shown.classList.contains('open')).toBe(true);
  expect(Array.from(host.querySelectorAll('.ListItem')).map((li) => li.textContent)).toEqual(['row 1', 'row 2']);
  await frame(); // InfiniteScroll's first measure (preload check) and ShowTransition's first frame
  // Updates create new nodes with the shadows in place: a new slide (element + text), a new row, the close classes.
  setKey(1);
  setRows([1, 2, 3]);
  setOpen(false);
  await frame();
  expect(host.querySelector('.Transition_slide-to')!.textContent).toBe('slide 1');
  expect(host.querySelectorAll('.Transition_slide').length).toBe(2);
  expect(host.querySelectorAll('.ListItem').length).toBe(3);
  expect(shown.classList.contains('closing')).toBe(true);
  dispose();
});
