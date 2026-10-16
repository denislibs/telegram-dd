import { Markdown } from '@tiptap/markdown';
import { Plugin } from '@tiptap/pm/state';

import { normalizeBotApiHtml } from '../../../../util/tiptap/botApiHtml';
import { buildCustomEmojiMarkdownAttrs } from '../../../../util/tiptap/extensions/customEmoji';
import { buildFormattedDateMarkdownAttrs } from '../../../../util/tiptap/extensions/date';
import { buildMentionMarkdownAttrs } from '../../../../util/tiptap/extensions/mention';
import { replaceButtonNodesWithText } from '../../../../util/tiptap/richButton';
import {
  isRichMarkdownWebLink,
  parseRichMarkdownLink,
  RE_RICH_MARKDOWN_INLINE_MATH,
  RE_RICH_MARKDOWN_LINKS,
} from '../../../../util/tiptap/richMarkdown';
import { parseRichMediaRef } from '../../../../util/tiptap/richMedia';

const RE_RICH_MARKDOWN_BLOCK = /^(?:#{1,6}\s|>\s?|```|\$\$|---\s*$)/m;
const RE_RICH_MARKDOWN_INLINE = /(?:\*\*|__|~~|==|\|\|)[^\n]+|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_/;
const RE_MARKDOWN_FOOTNOTE = /\[\^[^\]\n]+\](?::[^\n]*)?/g;
const RE_HTML_TAG = /<\/?[a-z][^>\n]*>/gi;
const RE_RICH_MEDIA_HTML = /<(?:figure|tg-collage|tg-slideshow|tg-document|img|video|audio)\b/i;
const RE_NORMALIZED_MEDIA_HTML = /<div\s+data-rich-editor-media(?:="")?[^>]*>[\s\S]*?<\/div>/gi;
const RE_MARKDOWN_MEDIA = /!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"((?:\\.|[^"\\])*)")?\)/g;
const RE_MARKDOWN_ESCAPE = /\\([\x20-\x7E])/g;
const MEDIA_PLACEHOLDER_PREFIX = 'TG_RICH_MEDIA_PLACEHOLDER_';
// Deviation (security): the detection and rewriting regexes below (`RE_RICH_MARKDOWN_LINKS`, `RE_MARKDOWN_FOOTNOTE`,
// `RE_HTML_TAG`, `RE_MARKDOWN_MEDIA`) and the markdown link tokenizers rescan the rest of a line from every `[`,
// `[^`, `<a`, so a pasted line of 80 000 `[` froze the main thread for seconds (quadratic in the line length; tt is
// the same). A text longer than 16 KiB, or with a line longer than the 4096-character message limit, is pasted as
// plain text by ProseMirror's own paste. With both caps the worst case measured in jsdom is about 300 ms (a single
// 16 KiB line of `[^` took 1.35 s, 80 000 `[` 12 s).
export const MAX_MARKDOWN_PASTE_LENGTH = 16 * 1024;
export const MAX_MARKDOWN_PASTE_LINE_LENGTH = 4096;

export const RichEditorMarkdown = Markdown.extend({
  addProseMirrorPlugins() {
    const { editor } = this;

    return [
      new Plugin({
        props: {
          handlePaste: (_view, event) => {
            const markdown = event.clipboardData?.getData('text/plain');
            const { $from } = editor.state.selection;
            if (
              !markdown ||
              markdown.length > MAX_MARKDOWN_PASTE_LENGTH ||
              hasLineLongerThan(markdown, MAX_MARKDOWN_PASTE_LINE_LENGTH) ||
              event.clipboardData?.getData('text/html') ||
              $from.parent.type.spec.code ||
              $from.marks().some(({ type }) => type.spec.code) ||
              (!RE_RICH_MARKDOWN_BLOCK.test(markdown) &&
                !RE_RICH_MARKDOWN_INLINE.test(markdown) &&
                !RE_RICH_MARKDOWN_INLINE_MATH.test(markdown) &&
                markdown.search(RE_RICH_MARKDOWN_LINKS) < 0 &&
                !RE_RICH_MEDIA_HTML.test(markdown))
            ) {
              return false;
            }

            const value = preserveUnsupportedMarkdown(markdown);
            // Deviation (security): a markdown HTML block or a multi-line tag can still carry `<tg-button-row>`, which
            // the composer cannot show yet: buttons become text here as on an HTML paste (`replaceButtonHtmlWithText`)
            return editor.commands.insertContent(
              editor.markdown ? replaceButtonNodesWithText(editor.markdown.parse(value)) : value,
              { contentType: 'markdown' },
            );
          },
        },
      }),
    ];
  },
});

function hasLineLongerThan(text: string, maxLength: number) {
  let lineStart = 0;
  while (lineStart <= text.length) {
    const lineEnd = text.indexOf('\n', lineStart);
    if ((lineEnd < 0 ? text.length : lineEnd) - lineStart > maxLength) return true;
    if (lineEnd < 0) return false;
    lineStart = lineEnd + 1;
  }
  return false;
}

function preserveUnsupportedMarkdown(markdown: string) {
  const mediaHtml: string[] = [];
  const markdownWithMediaHtml = markdown.replace(RE_MARKDOWN_MEDIA, buildMarkdownMediaHtml);
  const hasMediaHtml = RE_RICH_MEDIA_HTML.test(markdownWithMediaHtml);
  // Deviation (security): pasted rich buttons become text (`replaceButtonHtmlWithText`)
  const normalizedMarkdown = hasMediaHtml
    ? normalizeBotApiHtml(markdownWithMediaHtml, { shouldReplaceButtons: true })
    : markdownWithMediaHtml;
  const placeholderPrefix = findAvailableMediaPlaceholderPrefix(normalizedMarkdown);
  const placeholderPattern = new RegExp(`${placeholderPrefix}(\\d+)_`, 'g');
  const protectedMarkdown = hasMediaHtml
    ? normalizedMarkdown.replace(RE_NORMALIZED_MEDIA_HTML, (value) => {
        const index = mediaHtml.push(value) - 1;
        return `${placeholderPrefix}${index}_`;
      })
    : normalizedMarkdown;
  return protectedMarkdown
    .replace(RE_RICH_MARKDOWN_LINKS, preserveSupportedMarkdownLink)
    .replace(RE_MARKDOWN_FOOTNOTE, escapeMarkdownOpeningBracket)
    .replace(RE_HTML_TAG, (tag) => `\\${tag}`)
    .replace(placeholderPattern, (value, index: string) => mediaHtml[Number(index)] ?? value);
}

function findAvailableMediaPlaceholderPrefix(value: string) {
  let index = 0;
  let prefix = `${MEDIA_PLACEHOLDER_PREFIX}${index}_`;
  while (value.includes(prefix)) {
    index += 1;
    prefix = `${MEDIA_PLACEHOLDER_PREFIX}${index}_`;
  }
  return prefix;
}

function buildMarkdownMediaHtml(_value: string, rawAlt: string, source: string, rawCaption?: string) {
  const alt = unescapeMarkdown(rawAlt);
  const caption = rawCaption ? unescapeMarkdown(rawCaption) : '';
  const ref = parseRichMediaRef(source);
  if (!ref) return [alt, caption].filter(Boolean).join('\n');

  const element = document.createElement(
    ref.type === 'document' ? 'tg-document' : ref.type === 'photo' ? 'img' : ref.type,
  );
  element.setAttribute('src', source);
  element.setAttribute('alt', alt);
  if (!caption) return element.outerHTML;

  const figure = document.createElement('figure');
  const figcaption = document.createElement('figcaption');
  figcaption.dataset.tgSharedCaption = '';
  figcaption.textContent = caption;
  figure.append(element, figcaption);
  return figure.outerHTML;
}

function unescapeMarkdown(value: string) {
  return value.replace(RE_MARKDOWN_ESCAPE, '$1');
}

function preserveSupportedMarkdownLink(value: string) {
  const markdown = parseRichMarkdownLink(value);
  const isSupported =
    markdown &&
    (isRichMarkdownWebLink(markdown) ||
      Boolean(buildCustomEmojiMarkdownAttrs(markdown)) ||
      Boolean(buildFormattedDateMarkdownAttrs(markdown)) ||
      Boolean(buildMentionMarkdownAttrs(markdown)));

  return isSupported ? value : escapeMarkdownOpeningBracket(value);
}

function escapeMarkdownOpeningBracket(value: string) {
  return value.replace('[', '\\[');
}
