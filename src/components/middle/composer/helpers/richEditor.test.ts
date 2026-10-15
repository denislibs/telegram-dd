// @vitest-environment jsdom
import type { Editor, JSONContent } from '@tiptap/core';
import { marked } from 'marked';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __createRichEditor as createRichEditor } from './richEditor';

const editors: Editor[] = [];

function createEditor(content: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }) {
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

describe('createRichEditor', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  });

  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy());
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('attaches ProseMirror to the given element and keeps the document in sync', () => {
    const { editor, element } = createEditor();
    // `{ mount: element }`: the element itself becomes the ProseMirror root (view.dom)
    expect(editor.view.dom).toBe(element);
    expect(element.classList.contains('ProseMirror')).toBe(true);

    editor.commands.insertContent('hello');
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    });
  });

  it('registers no markdown tokenizer in the shared `marked` instance (it would keep every editor alive)', () => {
    const count = () =>
      (marked.defaults.extensions?.block?.length ?? 0) + (marked.defaults.extensions?.inline?.length ?? 0);
    const before = count();
    createEditor();
    createEditor();
    expect(count()).toBe(before);
  });
});

describe('pasting untrusted HTML', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  });

  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy());
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  function collect(json: JSONContent, found: { types: Set<string>; marks: JSONContent[]; text: string }) {
    if (json.type) found.types.add(json.type);
    json.marks?.forEach((mark) => found.marks.push(mark));
    if (json.text) found.text += json.text;
    json.content?.forEach((child) => collect(child, found));
    return found;
  }

  // A paste event through the real ProseMirror pipeline (transformPastedHTML, the schema parser, handlePaste plugins);
  // jsdom has no ClipboardEvent / DataTransfer, so the payload is a plain object on a plain Event.
  function dispatchPaste(editor: Editor, data: Record<string, string>) {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (type: string) => data[type] || '', files: [], items: [], types: Object.keys(data) },
    });
    editor.view.dom.dispatchEvent(event);
  }

  function paste(html: string) {
    const { editor } = createEditor();
    dispatchPaste(editor, { 'text/html': html, 'text/plain': 'plain' });
    const json = editor.getJSON();
    return { json, found: collect(json, { types: new Set(), marks: [], text: '' }), editor };
  }

  it('drops script, img and event-handler markup', () => {
    const { json, found, editor } = paste(
      '<p onclick="alert(1)">a<script>alert(1)</script>b<img src="x" onerror="alert(2)">' +
        '<svg onload="alert(3)"></svg><iframe src="javascript:alert(4)"></iframe></p>',
    );

    const serialized = JSON.stringify(json);
    expect(found.types.has('script')).toBe(false);
    expect(found.types.has('image')).toBe(false);
    expect(serialized).not.toMatch(/onerror|onclick|onload/i);
    expect(serialized).not.toMatch(/<script|<img|<svg|<iframe/i);
    expect(editor.view.dom.querySelector('script, img, svg, iframe')).toBeNull();
    expect(editor.view.dom.innerHTML).not.toMatch(/onerror|onclick|onload/i);
  });

  it('pastes allowed markup (the pipeline is not vacuously empty)', () => {
    const { found } = paste('<p>ok <b>bold</b> <a href="https://example.com/x">link</a></p>');
    expect(found.text).toBe('ok bold link');
    expect(found.marks.map((mark) => mark.type).sort()).toEqual(['bold', 'link']);
    expect(found.marks.find((mark) => mark.type === 'link')?.attrs?.href).toBe('https://example.com/x');
  });

  it('does not create a link mark for javascript:, data: or vbscript: hrefs', () => {
    // Outcome with tt's pipeline: the link is dropped, the text stays.
    const { json, found } = paste(
      '<p><a href="javascript:alert(1)">a</a><a href=" JaVaScRiPt:alert(2)">b</a>' +
        '<a href="data:text/html,<script>alert(3)</script>">c</a><a href="vbscript:x">d</a></p>',
    );
    expect(found.marks.filter((mark) => mark.type === 'link')).toEqual([]);
    expect(found.text).toBe('abcd');
    expect(JSON.stringify(json)).not.toMatch(/javascript:|vbscript:|data:text/i);
  });

  it('markdown paste: formats **bold** and a https link, but makes no link mark for javascript:', () => {
    const { editor } = createEditor();
    dispatchPaste(editor, {
      'text/plain': '**bold** [ok](https://example.com/a) [bad](javascript:alert(1)) <script>x</script>',
    });
    const found = collect(editor.getJSON(), { types: new Set(), marks: [], text: '' });
    expect(found.types.has('script')).toBe(false);
    expect(found.marks.map((mark) => mark.type)).toContain('bold');
    const hrefs = found.marks.filter((mark) => mark.type === 'link').map((mark) => String(mark.attrs?.href));
    expect(hrefs).toEqual(['https://example.com/a']);
  });
});
