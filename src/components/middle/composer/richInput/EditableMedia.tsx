// FOUNDATION STUB: EditableMedia (telegram-tt src/components/middle/composer/richInput/EditableMedia.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
// Deviation: the stub keeps tt's document schema (node name, attributes, group, content, HTML rules, plain text), so
// that documents parse and serialize the same, but it has no node view: ProseMirror renders the node through
// `renderHTML` (a `figure` with an editable caption). The media itself (the upload, the collage) is not drawn.
import type { JSONContent } from '@tiptap/core';
import { Node as TiptapNode } from '@tiptap/core';

import type { TeactNodeViewComponentProps } from '../../../../util/tiptap';
import type { RichEditorMediaEditHandler, RichEditorMediaFilesHandler } from '../richEditorTypes';

import { getRichTextPlainText } from '../../../../global/helpers/richMessage';
import { MEDIA_NODE_NAME } from '../../../../util/tiptap/constants';
import {
  getRichEditorMediaAttrs,
  getRichMediaRef,
  resolveRichEditorMediaAttrs,
} from '../../../../util/tiptap/richMedia';

export function buildRichEditorMedia(
  onMediaEdit: RichEditorMediaEditHandler,
  onMediaFiles: RichEditorMediaFilesHandler,
) {
  return TiptapNode.create({
    name: MEDIA_NODE_NAME,
    group: 'block',
    content: 'inline*',
    defining: true,
    isolating: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        kind: { default: 'photo' },
        items: { default: [] },
        credit: { default: { type: 'empty' } },
      };
    },

    parseHTML() {
      return [
        {
          tag: '[data-rich-editor-media]',
          getAttrs: (element) => parseMediaElementAttrs(element),
        },
      ];
    },

    renderHTML() {
      return ['figure', { 'data-rich-editor-media': '', 'data-rich-media-stub': '' }, ['figcaption', 0]];
    },

    renderText({ node }) {
      const attrs = getRichEditorMediaAttrs(node.toJSON() as JSONContent);
      const caption = [node.textContent, attrs && getRichTextPlainText(attrs.credit)].filter(Boolean).join('\n');
      if (caption) return caption;

      return (
        attrs?.items.flatMap((item) => (item.media ? [getRichMediaRef(item.type, item.media.id!)] : [])).join('\n') ||
        ''
      );
    },

    addOptions() {
      return { onMediaEdit, onMediaFiles };
    },
  });
}

function parseMediaElementAttrs(element: HTMLElement) {
  return resolveRichEditorMediaAttrs(element.dataset.richEditorMediaId) || false;
}

// The node view component of tt: not used by the stub node (it has no node view), kept for the default export.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const EditableMedia = (_props: TeactNodeViewComponentProps) => undefined;

export default EditableMedia;
