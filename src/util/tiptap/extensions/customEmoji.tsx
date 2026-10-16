import { Node } from '@tiptap/core';
import { createMemo } from 'frameact';
import { Show } from 'frameact/dom';

import type { TeactNodeViewComponentProps } from '../TeactNodeViewRenderer';

import buildClassName from '../../buildClassName';
import isValidDocumentId from '../../emoji/isValidDocumentId';
import {
  buildRichMarkdownNodeInputRule,
  buildRichMarkdownTokenizer,
  escapeRichMarkdownLabel,
  parseRichMarkdownNode,
  type RichMarkdownLink,
} from '../richMarkdown';

import CustomEmoji from '../../../components/common/CustomEmoji';
import TeactNodeViewRenderer from '../TeactNodeViewRenderer';

import styles from '../styling.module.scss';

const CUSTOM_EMOJI_FALLBACK = '\u{FFFC}';

export type CustomEmojiNodeOptions = {
  sharedCanvasRef?: () => HTMLCanvasElement | undefined;
  sharedCanvasHqRef?: () => HTMLCanvasElement | undefined;
};

export const CustomEmojiNode = Node.create<CustomEmojiNodeOptions>({
  name: 'customEmoji',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  markdownTokenName: 'customEmoji',

  markdownTokenizer: buildRichMarkdownTokenizer('customEmoji', true, buildCustomEmojiMarkdownAttrs),

  parseMarkdown(token, helpers) {
    return parseRichMarkdownNode(token, helpers, true, 'customEmoji', buildCustomEmojiMarkdownAttrs);
  },

  addInputRules() {
    return [buildRichMarkdownNodeInputRule(this.type, buildCustomEmojiMarkdownAttrs)];
  },

  addOptions() {
    return {
      sharedCanvasRef: undefined,
      sharedCanvasHqRef: undefined,
    };
  },

  addAttributes() {
    return {
      documentId: {
        default: undefined,
        parseHTML: getHtmlDocumentId,
      },
      alt: {
        default: '',
        parseHTML: (element: HTMLElement) => (
          element.getAttribute('alt') || element.dataset.alt || element.textContent || ''
        ),
      },
      className: {
        default: undefined,
        parseHTML: (element: HTMLElement) => element.getAttribute('class') || undefined,
      },
      src: {
        default: undefined,
        parseHTML: (element: HTMLElement) => element.getAttribute('src') || undefined,
      },
      uniqueId: {
        default: undefined,
        parseHTML: (element: HTMLElement) => element.dataset.uniqueId,
      },
    };
  },

  // Deviation (security): tt creates a custom emoji node for any `data-document-id` / `emoji-id`, and a pasted
  // `not-a-number` failed the whole custom emoji batch it was loaded in (`BigInt`) and the send. Only a 64-bit decimal
  // id makes a node, as in the markdown path; otherwise the element is parsed as its content (its text stays).
  parseHTML() {
    const getAttrs = (element: HTMLElement) => (getHtmlDocumentId(element) ? {} : false);
    return [
      { tag: '[data-document-id]', getAttrs },
      { tag: 'tg-emoji[emoji-id]', getAttrs },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['tg-emoji', {
      'emoji-id': HTMLAttributes.documentId,
    }, HTMLAttributes.alt];
  },

  renderText({ node }) {
    return node.attrs.alt;
  },

  renderMarkdown(node) {
    return `![${escapeRichMarkdownLabel(node.attrs?.alt)}](tg://emoji?id=${node.attrs?.documentId})`;
  },

  addNodeView() {
    return TeactNodeViewRenderer(CustomEmojiView, {
      as: 'span',
      selectedOnTextSelection: true,
    });
  },
});

export function buildCustomEmojiMarkdownAttrs(markdown: RichMarkdownLink) {
  if (!markdown.isImage || markdown.url.protocol !== 'tg:' || markdown.url.host !== 'emoji') {
    return undefined;
  }

  const documentId = markdown.url.searchParams.get('id') || undefined;
  if (!isValidDocumentId(documentId)) {
    return undefined;
  }

  return {
    documentId,
    alt: markdown.label || CUSTOM_EMOJI_FALLBACK,
  };
}

function CustomEmojiView(props: TeactNodeViewComponentProps) {
  const documentId = createMemo(() => (
    typeof props.node.attrs.documentId === 'string' ? props.node.attrs.documentId : undefined
  ));

  const { sharedCanvasRef, sharedCanvasHqRef } = props.extension.options as CustomEmojiNodeOptions;

  return (
    <Show when={documentId()}>
      {(currentDocumentId) => (
        <CustomEmoji
          documentId={currentDocumentId()}
          className={buildClassName(styles.emoji, styles.customEmoji)}
          sharedCanvasRef={sharedCanvasRef}
          sharedCanvasHqRef={sharedCanvasHqRef}
          isSelectable
          withSharedAnimation
        />
      )}
    </Show>
  );
}

function getHtmlDocumentId(element: HTMLElement) {
  const documentId = element.dataset.documentId || element.getAttribute('emoji-id');
  return isValidDocumentId(documentId) ? documentId : undefined;
}
