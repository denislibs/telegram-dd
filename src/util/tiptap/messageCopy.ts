import {
  generateJSON,
  getSchema,
  type JSONContent as TiptapJsonContent,
} from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';

import type { ClipboardTextContent } from '../../types/messageCopy';

import { __buildRichEditorSchemaExtensions } from '../../components/middle/composer/helpers/richEditor';
import { ensureProtocol, isValidProtocol } from '../browser/url';
import {
  buildBotApiHtmlSerializer,
  extendBotApiMarkdownHtml,
  normalizeRenderedRichContentHtml,
  serializeTiptapPlainText,
} from './botApiHtml';
import { encodeMarkdownLinkDestination, SAFE_LINK_PROTOCOLS } from './safeLink';

const MESSAGE_COPY_EXTENSIONS = __buildRichEditorSchemaExtensions();
const MESSAGE_COPY_SCHEMA = getSchema(MESSAGE_COPY_EXTENSIONS);
const MESSAGE_COPY_HTML_SERIALIZER = buildBotApiHtmlSerializer(MESSAGE_COPY_SCHEMA);
const MESSAGE_COPY_MARKDOWN_MANAGER = new MarkdownManager({
  extensions: extendBotApiMarkdownHtml(
    MESSAGE_COPY_EXTENSIONS,
    MESSAGE_COPY_SCHEMA,
    MESSAGE_COPY_HTML_SERIALIZER,
  ),
});

export function parseMessageCopyHtml(html: string) {
  return normalizeMessageCopyJson(generateJSON(
    normalizeRenderedRichContentHtml(html),
    MESSAGE_COPY_EXTENSIONS,
  ));
}

export function serializeMessageCopyTiptapJson(doc: TiptapJsonContent): ClipboardTextContent {
  const normalizedDoc = normalizeMessageCopyJson(doc);
  const proseMirrorDoc = ProseMirrorNode.fromJSON(MESSAGE_COPY_SCHEMA, normalizedDoc);
  const container = document.createElement('div');
  MESSAGE_COPY_HTML_SERIALIZER.serializeFragment(proseMirrorDoc.content, {}, container);

  return {
    plainText: serializeTiptapPlainText(proseMirrorDoc.content),
    html: container.innerHTML,
    // Deviation (security): see `encodeMarkdownLinkDestination`
    markdown: MESSAGE_COPY_MARKDOWN_MANAGER.serialize(encodeMarkdownLinks(normalizedDoc)),
  };
}

// Deviation (security): the entity URL of a text link comes from the sender and tt copies it as it is, so
// `<a href="javascript:...">` reached the clipboard HTML and `[text](javascript:...)` the markdown. The message view
// shows such a link as `ensureProtocol(url)`; the copy does the same and drops the link (keeping its text) when the
// result is not an address of an allowed scheme.
const SAFE_COPY_LINK_PROTOCOLS = SAFE_LINK_PROTOCOLS;

function sanitizeCopyLinkMarks(marks: TiptapJsonContent['marks']): TiptapJsonContent['marks'] {
  return marks?.flatMap((mark) => {
    if (mark.type !== 'link') return [mark];

    const href = typeof mark.attrs?.href === 'string' ? ensureProtocol(mark.attrs.href.trim()) : undefined;
    return href && isValidProtocol(href, SAFE_COPY_LINK_PROTOCOLS) ? [{ ...mark, attrs: { ...mark.attrs, href } }] : [];
  });
}

function normalizeMessageCopyJson(node: TiptapJsonContent): TiptapJsonContent {
  if (node.type === 'emoji') {
    return {
      type: 'text',
      text: String(node.attrs?.emoji || node.attrs?.alt || '\u{FFFC}'),
      marks: sanitizeCopyLinkMarks(node.marks),
    };
  }

  return {
    ...node,
    ...(node.marks && { marks: sanitizeCopyLinkMarks(node.marks) }),
    content: node.content?.map(normalizeMessageCopyJson),
  };
}

function encodeMarkdownLinks(node: TiptapJsonContent): TiptapJsonContent {
  return {
    ...node,
    ...(node.marks && {
      marks: node.marks.map((mark) =>
        mark.type === 'link' && typeof mark.attrs?.href === 'string'
          ? { ...mark, attrs: { ...mark.attrs, href: encodeMarkdownLinkDestination(mark.attrs.href) } }
          : mark,
      ),
    }),
    ...(node.content && { content: node.content.map(encodeMarkdownLinks) }),
  };
}
