// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import StarterKitExtension from '@tiptap/starter-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RichEditorTextReplacements } from './richEditorTextReplacements';

const mocks = vi.hoisted(() => ({ shouldReplaceTextShortcuts: true }));

vi.mock('../../../../global', () => ({ getGlobal: () => ({}) }));
vi.mock('../../../../global/selectors/sharedState', () => ({
  selectSharedSettings: () => ({ shouldReplaceTextShortcuts: mocks.shouldReplaceTextShortcuts }),
}));

const editors: Editor[] = [];

// Types one character at a time through ProseMirror's `handleTextInput`, which is what runs the tiptap input rules.
function type(editor: Editor, text: string) {
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp('handleTextInput', (handler) =>
      handler(editor.view, from, to, char, () => editor.state.tr),
    );
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(char, from, to));
  }
}

function createEditor() {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKitExtension, RichEditorTextReplacements],
    content: '<p></p>',
  });
  editors.push(editor);
  return editor;
}

describe('RichEditorTextReplacements', () => {
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy());
    mocks.shouldReplaceTextShortcuts = true;
  });

  it.each([
    ['a--', 'a—'],
    ['<<', '«'],
    ['>>', '»'],
    [':shrug:', '¯\\_(ツ)_/¯'],
  ])('replaces %s', (typed, expected) => {
    const editor = createEditor();
    type(editor, typed);
    expect(editor.getText()).toBe(expected);
  });

  it('does nothing when the setting is off', () => {
    mocks.shouldReplaceTextShortcuts = false;
    const editor = createEditor();
    type(editor, 'a--');
    expect(editor.getText()).toBe('a--');
  });
});
