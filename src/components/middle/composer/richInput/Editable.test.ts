// Original test (not in telegram-tt): the list item and code block node views render through TeactNodeViewRenderer, run
// once, and follow the node attributes through the getter props.
// @vitest-environment jsdom
import type { Editor, JSONContent } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __createRichEditor as createRichEditor } from '../helpers/richEditor';

const editors: Editor[] = [];

function createEditor(content: JSONContent) {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = createRichEditor({
    element,
    content,
    getIsRichInputExpanded: () => false,
    getCanInsertMedia: () => true,
    onUpdate: () => undefined,
    onDateClick: () => undefined,
    onMediaEdit: () => undefined,
    onMediaFiles: () => undefined,
  });
  editors.push(editor);
  return { editor, element };
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 80));

describe('rich editor node views', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  });

  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy());
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('EditableListItem shows a checkbox for a task item and follows the attributes', async () => {
    const { editor, element } = createEditor({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          attrs: { checklist: true },
          content: [
            {
              type: 'listItem',
              attrs: { checkbox: true, checked: false },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'task' }] }],
            },
          ],
        },
      ],
    });
    await settle();
    expect(element.querySelectorAll('li input[type="checkbox"]').length).toBe(1);
    expect(element.querySelector('li')?.textContent).toContain('task');
    const checkbox = () => element.querySelector<HTMLInputElement>('li input[type="checkbox"]')!;
    expect(checkbox().checked).toBe(false);

    editor.commands.command(({ tr }) => {
      tr.setNodeMarkup(editor.state.doc.resolve(2).before(), undefined, { checkbox: true, checked: true });
      return true;
    });
    await settle();
    expect(checkbox().checked).toBe(true);
  });

  it('EditableCodeBlock moves the ProseMirror content element into its wrapper and shows the placeholder when empty', async () => {
    const { editor, element } = createEditor({
      type: 'doc',
      content: [{ type: 'codeBlock', attrs: { language: 'js' }, content: [{ type: 'text', text: 'let a;' }] }],
    });
    await settle();
    const code = element.querySelector('code');
    expect(code?.textContent).toBe('let a;');
    expect(code?.className).toContain('codeBlock');
    expect(element.querySelector('button[aria-label]')).toBeTruthy();
    // The editable content element is inside the node view, and keeps being the one ProseMirror renders into.
    editor.view.dispatch(editor.state.tr.insertText(' b', 1 + 'let a;'.length));
    await settle();
    expect(element.querySelector('code')).toBe(code);
    expect(element.querySelector('code')?.textContent).toBe('let a; b');
    // No placeholder while the block has text; it appears once the block is emptied
    const placeholder = () => element.querySelector<HTMLElement>('[aria-hidden="true"][contenteditable="false"]')!;
    expect(placeholder().style.display).toBe('none');
    editor.view.dispatch(editor.state.tr.delete(1, 1 + 'let a; b'.length));
    await settle();
    expect(placeholder().style.display).not.toBe('none');
  });

  // C1: the placeholder was the only frameact child of the wrapper that ProseMirror's content element is moved into;
  // removing it ran `wrapper.textContent = ''`, which also removed the <code> element.
  it('EditableCodeBlock keeps the ProseMirror content element when an empty block gets its first character', async () => {
    const { editor, element } = createEditor({
      type: 'doc',
      content: [{ type: 'codeBlock', attrs: { language: 'js' } }],
    });
    await settle();
    const code = element.querySelector('code')!;
    expect(code.isConnected).toBe(true);
    expect(element.querySelector('[aria-hidden="true"][contenteditable="false"]')).toBeTruthy();

    editor.view.dispatch(editor.state.tr.insertText('x', 1));
    await settle();
    expect(code.isConnected).toBe(true);
    expect(element.querySelector('code')).toBe(code);
    expect(code.textContent).toBe('x');
    // the placeholder is hidden (or gone) while the block has text
    const placeholder = element.querySelector<HTMLElement>('[aria-hidden="true"][contenteditable="false"]');
    expect(!placeholder || placeholder.hidden || placeholder.style.display === 'none').toBe(true);

    // and back and forth again
    editor.view.dispatch(editor.state.tr.delete(1, 2));
    await settle();
    expect(code.isConnected).toBe(true);
    editor.view.dispatch(editor.state.tr.insertText('y', 1));
    await settle();
    expect(code.isConnected).toBe(true);
    expect(code.textContent).toBe('y');
  });

  it('typing a code fence into the plain input shows the code that follows and keeps it in one block', async () => {
    const { editor, element } = createEditor({ type: 'doc', content: [{ type: 'paragraph' }] });
    await settle();
    const type = (text: string) => {
      for (const char of text) {
        const { from, to } = editor.state.selection;
        const handled = editor.view.someProp('handleTextInput', (handler) => handler(editor.view, from, to, char));
        if (!handled) editor.view.dispatch(editor.state.tr.insertText(char, from, to));
      }
    };
    type('``` ');
    await settle();
    expect(editor.getJSON().content?.[0]?.type).toBe('codeBlock');
    type('let x = 1');
    await settle();

    const code = element.querySelector('code');
    expect(code?.isConnected).toBe(true);
    expect(code?.textContent).toBe('let x = 1');
    // the text is in the one code block (tiptap may add a trailing paragraph after it)
    expect(editor.getJSON().content?.[0]).toEqual({
      type: 'codeBlock',
      attrs: expect.anything(),
      content: [{ type: 'text', text: 'let x = 1' }],
    });
  });
});
