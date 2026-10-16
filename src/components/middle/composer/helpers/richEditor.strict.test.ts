// Original test (not in telegram-tt): what stricterdom checks around ProseMirror (editor review L2). `muteStrictForProseMirror`
// mutes `updateState`, `scrollToSelection` and the MutationObserver's `flush`: ProseMirror reads layout in each of them
// (the scroll position, the selection rect, `getComputedStyle` on the first typed change), in whatever phase the change
// arrives in. A change typed into the editor is read by that observer right after a mutate phase and dispatched from
// `flush`, so every tiptap listener of a typed change and every plugin view run unchecked: a known blind spot until
// stricterdom can declare a third-party DOM owner (engine gap 11 of docs/reports/slice-composer.md). The listeners of a
// change our own code dispatches run after `updateState` and stay checked.
// @vitest-environment jsdom
import type { Editor } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { requestMutation } from 'frameact';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { container, useDomHarness } from '../../../../lib/kit/testing/dom';
import { flushMicrotasks } from '../../../../lib/kit/testing/micro';
import { __createRichEditor as createRichEditor } from './richEditor';

// jsdom has no layout for ranges; ProseMirror asks for them when it scrolls the selection into view
const EMPTY_RECT = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => EMPTY_RECT;

const { frame } = useDomHarness();
const violations: string[] = [];
let editor: Editor | undefined;

beforeEach(() => {
  violations.length = 0;
});

afterEach(() => {
  setHandler();
  disableStrict();
  editor?.destroy();
  editor = undefined;
});

async function setup() {
  const element = suppressStrict(container);
  // As in MessageInput: ProseMirror owns the editor's DOM
  element.setAttribute('data-stricterdom-ignore', '');
  editor = createRichEditor({
    element,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] },
    getIsRichInputExpanded: () => false,
    getCanInsertMedia: () => true,
    onUpdate: () => undefined,
    onDateClick: () => undefined,
    onMediaEdit: () => undefined,
    onMediaFiles: () => undefined,
  });
  await frame();
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}]`));
  return editor;
}

/** A change of the editor's text by the browser (typing), made in a mutate phase as a frame's last DOM write would be. */
async function typeIntoDom(target: Editor, text: string) {
  requestMutation(() => {
    target.view.dom.querySelector('p')!.firstChild!.nodeValue = text;
  });
  await frame();
  await flushMicrotasks();
  await frame();
}

it('typing reports nothing from ProseMirror itself', async () => {
  const target = await setup();
  await typeIntoDom(target, 'hi there');

  expect(target.getText()).toBe('hi there');
  expect(violations).toEqual([]);
});

it('a layout read in a tiptap listener of a typed change is NOT reported (it runs inside the muted `flush`)', async () => {
  const target = await setup();
  let reads = 0;
  target.on('transaction', () => {
    reads++;
    document.body.getBoundingClientRect();
  });
  await typeIntoDom(target, 'hi there');

  expect(reads).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

it('a layout read in a tiptap listener of a command dispatched in the mutate phase is reported', async () => {
  const target = await setup();
  target.on('transaction', () => {
    document.body.getBoundingClientRect();
  });
  requestMutation(() => {
    target.commands.insertContent('!');
  });
  await frame();

  expect(target.getText()).toBe('hi!');
  expect(violations).toEqual(['measure getBoundingClientRect [mutate]']);
});

it('a layout read in a ProseMirror plugin view is NOT reported (it runs inside the muted `updateState`)', async () => {
  const target = await setup();
  let reads = 0;
  target.registerPlugin(
    new Plugin({
      view: () => ({
        update: () => {
          reads++;
          document.body.getBoundingClientRect();
        },
      }),
    }),
  );
  await typeIntoDom(target, 'hi there');

  expect(reads).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});
