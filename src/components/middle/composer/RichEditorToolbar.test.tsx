// RichEditorToolbar: the availability follows the `editor` prop (it can arrive after the toolbar is created) and the
// editor's transactions, and unsubscribes from the editor it leaves.
import type { Editor } from '@tiptap/core';
import { createSignal } from 'frameact';
import { render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { setGlobal } from '../../../global';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { flushMicrotasks } from '../../../lib/kit/testing/micro';
import { INITIAL_GLOBAL_STATE } from '../../../global/initialState';

import RichEditorToolbar from './RichEditorToolbar';

beforeAll(() => {
  setGlobal(structuredClone(INITIAL_GLOBAL_STATE));
});

const { frame } = useDomHarness();
const violations: string[] = [];

beforeEach(() => {
  violations.length = 0;
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}]`));
});

afterEach(() => {
  setHandler();
  disableStrict();
  expect(violations).toEqual([]);
});

function createFakeEditor(canLink: () => boolean) {
  const listeners = new Set<() => void>();
  const everythingIsPossible = new Proxy(
    {},
    {
      get: (_, name) => (name === 'setLink' ? () => canLink() : () => false),
    },
  );
  const node = { isTextblock: false, canReplaceWith: () => false };
  const editor = {
    isDestroyed: false,
    on: vi.fn((_: string, listener: () => void) => listeners.add(listener)),
    off: vi.fn((_: string, listener: () => void) => listeners.delete(listener)),
    can: () => everythingIsPossible,
    isActive: () => false,
    schema: { nodes: {} },
    state: {
      selection: {
        empty: true,
        from: 0,
        to: 0,
        $from: { depth: 0, node: () => node, index: () => 0 },
        $to: {},
      },
    },
  };
  return { editor: editor as unknown as Editor, fake: editor, emit: () => listeners.forEach((listener) => listener()) };
}

it('RichEditorToolbar: follows an editor that arrives later, its transactions, and leaves the old one', async () => {
  const el = suppressStrict(container);
  const [editor, setEditor] = createSignal<Editor | undefined>(undefined);
  const [isEnabled, setIsEnabled] = createSignal(true);
  let linkAllowed = false;
  const first = createFakeEditor(() => linkAllowed);
  const second = createFakeEditor(() => true);
  const dispose = render(() => <RichEditorToolbar editor={editor()} isEnabled={isEnabled()} />, el);
  await flushMicrotasks();
  await frame();

  const buttons = () => Array.from(el.querySelectorAll('.rich-editor-toolbar > button')) as HTMLButtonElement[];
  const viewport = el.querySelector('.rich-editor-toolbar-viewport')!;
  expect(viewport.getAttribute('aria-hidden')).toBe('false');
  // the direct buttons are: AI, table, link, code block, formula (the two menus are wrapped in their own divs)
  expect(buttons().length).toBe(5);
  // no editor: every command button but the AI one is disabled
  expect(
    buttons()
      .slice(1)
      .every((button) => button.disabled),
  ).toBe(true);

  setEditor(first.editor);
  await flushMicrotasks();
  await frame();
  await flushMicrotasks();
  expect(first.fake.on).toHaveBeenCalledWith('transaction', expect.any(Function));
  const link = buttons()[2];
  expect(link.disabled).toBe(true);

  // a transaction recomputes the availability (in a microtask)
  linkAllowed = true;
  first.emit();
  await flushMicrotasks();
  await frame();
  expect(link.disabled).toBe(false);

  // another editor: the first one is left
  setEditor(second.editor);
  await flushMicrotasks();
  await frame();
  expect(first.fake.off).toHaveBeenCalledTimes(1);
  expect(second.fake.on).toHaveBeenCalledWith('transaction', expect.any(Function));

  // disabled: unsubscribes, empty availability, the viewport is hidden
  setIsEnabled(false);
  await flushMicrotasks();
  await frame();
  expect(second.fake.off).toHaveBeenCalledTimes(1);
  expect(buttons()[2].disabled).toBe(true);
  expect(viewport.getAttribute('aria-hidden')).toBe('true');
  dispose();
});
