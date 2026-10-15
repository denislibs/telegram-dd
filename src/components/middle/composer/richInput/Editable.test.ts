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
    expect(element.querySelector('[aria-hidden="true"][contenteditable="false"]')).toBeNull();
    editor.view.dispatch(editor.state.tr.delete(1, 1 + 'let a; b'.length));
    await settle();
    expect(element.querySelector('[aria-hidden="true"][contenteditable="false"]')).toBeTruthy();
  });
});
