// Original test (not in telegram-tt): the link control of the floating formatter. Its container is `inert` until the
// link control opens, and the binding that removes `inert` runs in the mutate phase; a `focus()` before that is ignored
// by the browser, so the typed URL replaced the selected text (fidelity review H4).
// @vitest-environment jsdom
import type { Editor } from '@tiptap/core';
import { delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler } from 'frameact/stricterdom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { __createRichEditor as createRichEditor } from '../../middle/composer/helpers/richEditor';

import TextFormatter from './TextFormatter';

class ResizeObserverStub {
  observe = () => undefined;

  unobserve = () => undefined;

  disconnect = () => undefined;
}
globalThis.ResizeObserver ??= ResizeObserverStub;
// jsdom has no layout for ranges; ProseMirror asks for them when it scrolls the selection into view
const EMPTY_RECT = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => EMPTY_RECT;

const { frame } = useDomHarness();
const editors: Editor[] = [];
const disposers: (() => void)[] = [];

beforeEach(() => {
  delegateEvents(['click', 'mousedown', 'input', 'keydown']);
});

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  editors.splice(0).forEach((editor) => editor.destroy());
  vi.restoreAllMocks();
});

function setup() {
  const element = container();
  // As in MessageInput: ProseMirror owns the editor's DOM.
  element.setAttribute('data-stricterdom-ignore', '');
  const editor = createRichEditor({
    element,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'make this link' }] }] },
    getIsRichInputExpanded: () => false,
    getCanInsertMedia: () => true,
    onUpdate: () => undefined,
    onDateClick: () => undefined,
    onMediaEdit: () => undefined,
    onMediaFiles: () => undefined,
  });
  editors.push(editor);
  const host = container();
  const onClose = vi.fn();
  disposers.push(
    render(
      () => (
        <TextFormatter
          editor={editor}
          range={{ from: 11, to: 15 }}
          capabilities="full"
          onClose={onClose}
          onDismissalChange={() => undefined}
        />
      ),
      host,
    ),
  );
  return { editor, host, onClose };
}

/** Records, for every `focus()` of an input, whether it sat inside an inert subtree at that moment. */
function recordInputFocus() {
  const original = HTMLElement.prototype.focus;
  const log: { inert: boolean }[] = [];
  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function focus(this: HTMLElement, options) {
    if (this.tagName === 'INPUT') log.push({ inert: Boolean(this.closest('[inert]')) });
    original.call(this, options);
  });
  return log;
}

/** The formatter's buttons act on `mousedown` (Button's fast click). */
function clickLinkButton(host: HTMLElement) {
  const button = host.querySelector('.icon-link')!.closest('button')!;
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
}

it('focuses the link input only after its container stopped being inert', async () => {
  const { host } = setup();
  await frame();
  await frame();
  const input = host.querySelector<HTMLInputElement>('input[inputmode="url"]')!;
  expect(input.closest('[inert]')).not.toBeNull();

  const log = recordInputFocus();
  const violations: string[] = [];
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}]`));
  try {
    clickLinkButton(host);
    for (let i = 0; i < 3; i++) await frame();
  } finally {
    setHandler();
    disableStrict();
  }

  expect(violations).toEqual([]);
  expect(input.closest('[inert]')).toBeNull();
  expect(log).toEqual([{ inert: false }]);
  expect(document.activeElement).toBe(input);
});

it('Enter in the link input sets the link over the selected text and keeps the text', async () => {
  const { editor, host, onClose } = setup();
  await frame();
  clickLinkButton(host);
  for (let i = 0; i < 3; i++) await frame();

  const input = host.querySelector<HTMLInputElement>('input[inputmode="url"]')!;
  input.value = 'example.com';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(editor.state.doc.textContent).toBe('make this link');
  const linked: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.marks.some((mark) => mark.type.name === 'link')) linked.push(node.text ?? '');
  });
  expect(linked).toEqual(['link']);
});
