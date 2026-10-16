// @vitest-environment jsdom
import type { Editor, JSONContent } from '@tiptap/core';
import { marked } from 'marked';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildButtonAction } from '../../../../util/tiptap/richButton';
import { buildRichMessageFromTiptapJson } from '../../../ui/textInput/richText';
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

  // The markdown detection and rewriting regexes are quadratic on long lines (`[`, `[a](`, `[^`, `<a` repeated)
  it.each([
    ['[', '['.repeat(80_000), '['.repeat(80_000)],
    ['[a](', '[a]('.repeat(80_000), '[a]('.repeat(80_000)],
    // tiptap's own paste rules still make the `**b**` bold in a plain-text paste
    ['**b** then [^', `**b** ${'[^'.repeat(40_000)}`, `b ${'[^'.repeat(40_000)}`],
  ])(
    'pastes a long text/plain of %j quickly, as plain text',
    (_name, text, expectedText) => {
      const { editor } = createEditor();
      const start = performance.now();
      dispatchPaste(editor, { 'text/plain': text });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(200);
      expect(editor.state.doc.textContent).toBe(expectedText);
    },
    60_000,
  );

  it('pastes many long lines of `[^` quickly (the cap is per line as well)', () => {
    const { editor } = createEditor();
    const text = `**b**\n${Array.from({ length: 2 }, () => '[^'.repeat(3_900)).join('\n')}`;
    const start = performance.now();
    dispatchPaste(editor, { 'text/plain': text });
    expect(performance.now() - start).toBeLessThan(200);
    expect(editor.state.doc.textContent).toContain('[^'.repeat(3_900));
  }, 60_000);

  it('markdown paste below the length caps still formats', () => {
    const { editor } = createEditor();
    const line = `**bold** [ok](https://example.com/a) ${'x'.repeat(4000)}`;
    dispatchPaste(editor, { 'text/plain': [line, line, line].join('\n') });
    const found = collect(editor.getJSON(), { types: new Set(), marks: [], text: '' });
    expect(found.marks.map((mark) => mark.type).sort()).toEqual(['bold', 'bold', 'bold', 'link', 'link', 'link']);
  });

  // S2: the button node views are FOUNDATION STUBs (nothing is drawn), so a pasted button would be an invisible part of
  // the draft and of the sent message
  it('drops pasted rich buttons and keeps their text', () => {
    const { json, found } = paste(
      '<p>see you at 5</p><tg-button-row><tg-button type="url" url="https://evil.example/button">Claim prize</tg-button>' +
        '<tg-button type="url" url="javascript:alert(1)">Run</tg-button></tg-button-row>',
    );
    expect(found.types.has('buttonRow')).toBe(false);
    expect(found.types.has('richButton')).toBe(false);
    expect(found.text).toContain('see you at 5');
    expect(found.text).toContain('Claim prize');
    expect(JSON.stringify(json)).not.toMatch(/evil\.example|javascript:/);
  });

  it('drops rich buttons pasted as markdown (text/plain with HTML tags)', () => {
    for (const text of [
      '**x**\n<tg-button-row><tg-button type="url" url="https://evil.example/b">Claim</tg-button></tg-button-row>',
      '**x**\n<tg-button-row\n><tg-button\ntype="url"\nurl="javascript:alert(1)"\n>Claim</tg-button\n></tg-button-row\n>',
      '**x** ![a](tg://photo?id=1) <img src="x"><tg-button-row><tg-button type="url" url="https://evil.example/b">' +
        'Claim</tg-button></tg-button-row>',
      // Multi-line tags escape the single-line tag escaping; `<div` starts a markdown HTML block
      '**x**\n\n<div\n><tg-button-row\n><tg-button type="url"\nurl="https://evil.example/b"\n>Claim</tg-button\n>' +
        '</tg-button-row\n></div\n>\n\nafter',
      '**x** <tg-button-row\n><tg-button type="url"\nurl="https://evil.example/b"\n>Claim</tg-button\n></tg-button-row\n>',
    ]) {
      const { editor } = createEditor();
      dispatchPaste(editor, { 'text/plain': text });
      const json = editor.getJSON();
      const found = collect(json, { types: new Set(), marks: [], text: '' });
      expect(found.types.has('buttonRow')).toBe(false);
      expect(found.types.has('richButton')).toBe(false);
      const message = JSON.stringify(buildRichMessageFromTiptapJson(json));
      expect(message).not.toMatch(/"type":"button(Row)?"/);
      expect(message).not.toMatch(/"url":"javascript:/);
      expect(message).not.toMatch(/"action"/);
    }
  });

  it('never builds a rich message with a javascript: button, whatever the editor JSON (a draft) holds', () => {
    const row = (url: string) => ({
      type: 'buttonRow',
      content: [{ type: 'richButton', attrs: { buttonType: 'url', url }, content: [{ type: 'text', text: 'B' }] }],
    });
    for (const url of [
      'javascript:alert(1)',
      ' JaVaScRiPt:alert(1)',
      'data:text/html,x',
      'ftp://evil.example',
      '//evil.example',
    ]) {
      expect(buildButtonAction({ buttonType: 'url', url })).toBeUndefined();
      const message = buildRichMessageFromTiptapJson({ type: 'doc', content: [row(url)] });
      expect(JSON.stringify(message)).not.toMatch(/javascript:|data:text|ftp:|evil\.example/i);
    }
    expect(buildButtonAction({ buttonType: 'url', url: 'https://example.com/a' })).toEqual({
      type: 'url',
      url: 'https://example.com/a',
    });
    expect(buildButtonAction({ buttonType: 'url', url: 'tg://resolve?domain=x' })).toEqual({
      type: 'url',
      url: 'tg://resolve?domain=x',
    });
  });

  // S3: tiptap's default `isAllowedUri` keeps ftp:, sms:, cid:, relative and protocol-relative addresses
  it('keeps only link addresses of the allowed schemes, normalised like the link modal', () => {
    const rejected = [
      'ftp://evil.example/x',
      '//evil.example/rel',
      'sms:+100',
      'cid:x',
      'xmpp:a@b',
      'callto:1',
      '/relative',
      '#frag',
      '?q=1',
    ];
    const { json, found } = paste(
      `<p>${rejected.map((href, index) => `<a href="${href}">r${index}</a> `).join('')}` +
        '<a href="https://ok.example/zw">​</a><a href="https://ok.example/ws"> ⁠﻿</a>' +
        '<a href="https://example.com/a">a1</a> <a href="tg://resolve?domain=x">a2</a> ' +
        '<a href="mailto:a@example.com">a3</a> <a href="tel:+100">a4</a> <a href="example.com/b c">a5</a></p>',
    );
    const hrefs = found.marks.filter((mark) => mark.type === 'link').map((mark) => mark.attrs?.href);
    expect(hrefs).toEqual([
      'https://example.com/a',
      'tg://resolve?domain=x',
      'mailto:a@example.com',
      'tel:+100',
      'https://example.com/b%20c',
    ]);
    rejected.forEach((_href, index) => expect(found.text).toContain(`r${index}`));

    const message = JSON.stringify(buildRichMessageFromTiptapJson(json));
    expect(message).not.toMatch(/ftp:|evil\.example|sms:|cid:|xmpp:|callto:|"\/relative|"#frag|ok\.example/);
  });

  // S4: unvalidated custom emoji ids and dates broke the custom emoji batch loading and the send
  it('does not create custom emoji with a non-numeric id, nor dates outside the valid range', () => {
    const { json, found } = paste(
      '<p><span data-document-id="not-a-number">X</span><tg-emoji emoji-id="1e300">Y</tg-emoji>' +
        '<tg-emoji emoji-id="99999999999999999999">W</tg-emoji>' +
        '<tg-emoji emoji-id="5368324170671202286">Z</tg-emoji> ' +
        '<tg-time unix="1e300">D1</tg-time> <tg-time unix="not-a-number">D2</tg-time> <tg-time unix="1.5">D3</tg-time> ' +
        '<tg-time unix="1e300" format="d">F1</tg-time> <tg-time unix="-5" format="d">F2</tg-time> ' +
        '<tg-time unix="1700000000">ok</tg-time></p>',
    );
    const emojiIds: unknown[] = [];
    const dates: unknown[] = [];
    const walk = (node: JSONContent) => {
      if (node.type === 'customEmoji') emojiIds.push(node.attrs?.documentId);
      if (node.type === 'formattedDate') dates.push(node.attrs?.date);
      node.marks?.forEach((mark) => mark.type === 'date' && dates.push(mark.attrs?.date));
      node.content?.forEach(walk);
    };
    walk(json);
    expect(emojiIds).toEqual(['5368324170671202286']);
    expect(dates).toEqual([1700000000]);
    for (const text of ['X', 'Y', 'W', 'D1', 'D2', 'D3', 'F1', 'F2', 'ok']) expect(found.text).toContain(text);
    expect(() => buildRichMessageFromTiptapJson(json)).not.toThrow();
  });
});
