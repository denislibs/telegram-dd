// Original test (not in telegram-tt): the HTML that `normalizeBotApiHtml` hands to ProseMirror's parser (pasted markup,
// read back from an inert template) carries no event handler, resource attribute or active element any more, so the
// second parse (ProseMirror's `readHTML`) creates none of them.
import { describe, expect, it } from 'vitest';

import { normalizeBotApiHtml, normalizeRenderedRichContentHtml } from './botApiHtml';

const HOSTILE_HTML =
  '<p onclick="alert(1)" style="position:fixed;inset:0;background:url(https://evil.example/bg.png)">a' +
  '<img src="https://evil.example/px.gif" srcset="https://evil.example/2x.gif 2x" onerror="alert(2)">' +
  '<script>alert(3)</script><style>@import "https://evil.example/s.css";</style>' +
  '<link rel="stylesheet" href="https://evil.example/l.css">' +
  '<meta http-equiv="refresh" content="0;url=https://evil.example">' +
  '<base href="https://evil.example/"><iframe src="https://evil.example/f"></iframe>' +
  '<object data="https://evil.example/o">fallback</object><embed src="https://evil.example/e">' +
  '<form action="https://evil.example/form">in form<button formaction="javascript:alert(4)">btn</button></form>' +
  '<svg><a xlink:href="javascript:alert(5)"><text>svg</text></a></svg>' +
  '<details ontoggle="alert(6)" open><summary>sum</summary>body</details>' +
  '<noscript><img src=x onerror=alert(7)></noscript>' +
  '<span style="font-weight:700;color:red;position:absolute">bold</span>' +
  '<b style="font-weight:normal">not bold</b><i style="font-style:italic">it</i>' +
  '<u style="text-decoration:underline">u</u></p>';

function parse(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

function expectClean(html: string) {
  const root = parse(html);
  expect(root.querySelector('script, style, link, meta, base, iframe, object, embed, form, noscript')).toBeNull();
  root.querySelectorAll('*').forEach((element) => {
    [...element.attributes].forEach(({ name, value }) => {
      expect(name.toLowerCase().startsWith('on')).toBe(false);
      expect(['srcset', 'formaction', 'xlink:href'].includes(name.toLowerCase())).toBe(false);
      if (name === 'style') expect(value).not.toMatch(/url\(|position|inset|color/i);
    });
  });
  expect(html).not.toMatch(/alert\(|evil\.example\/(s|l|bg|2x|f|o|e|form)\b/);
  return root;
}

describe('normalizeBotApiHtml', () => {
  it('strips event handlers, resource attributes and active elements before the read-back', () => {
    const html = normalizeBotApiHtml(HOSTILE_HTML);
    const root = expectClean(html);

    // Content stays (what the schema would keep)
    const text = root.textContent || '';
    ['a', 'fallback', 'in form', 'btn', 'svg', 'sum', 'body', 'bold', 'not bold', 'it', 'u'].forEach((part) =>
      expect(text).toContain(part),
    );
    // The declarations the schema's parse rules read survive (bold, italic, underline; `font-weight:normal` keeps the
    // Google Docs wrapper from becoming bold)
    expect(root.querySelector('span')?.getAttribute('style')).toMatch(/font-weight: ?700/);
    expect(root.querySelector('b')?.getAttribute('style')).toMatch(/font-weight: ?normal/);
    expect(root.querySelector('i')?.getAttribute('style')).toMatch(/font-style: ?italic/);
    expect(root.querySelector('u')?.getAttribute('style')).toMatch(/text-decoration: ?underline/);
  });

  it('does the same on the copy path', () => {
    expectClean(normalizeRenderedRichContentHtml(HOSTILE_HTML));
  });

  it('keeps the colour of a Bot API button (its `style` attribute is not CSS)', () => {
    const html = normalizeRenderedRichContentHtml(
      '<tg-button-row><tg-button type="url" url="https://example.com" style="danger">B</tg-button></tg-button-row>',
    );
    expect(parse(html).querySelector('tg-button')?.getAttribute('style')).toBe('danger');
  });
});
