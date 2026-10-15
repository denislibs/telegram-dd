import { createMemo } from 'frameact';

import { InputRule, mergeAttributes, Node as TiptapNode, wrappingInputRule } from '@tiptap/core';

import { NodeViewContent, type TeactNodeViewComponentProps, TeactNodeViewRenderer } from '../../../../util/tiptap';
import { BLOCKQUOTE_COLLAPSED_ATTR, CAPTION_NODE_NAME } from '../../../../util/tiptap/constants';
import {
  handleRichEditorQuoteArrow,
  handleRichEditorQuoteBackspace,
  handleRichEditorQuoteEnter,
  isSelectionInsideRichEditorQuote,
  type RichEditorQuoteHtmlAttributes,
  unsetRichEditorQuote,
} from './richEditorQuote';

import Blockquote from '../../../common/quote/Blockquote';

type RichEditorBlockquoteOptions = {
  HTMLAttributes: RichEditorQuoteHtmlAttributes;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockQuote: {
      setBlockquote: () => ReturnType;
      toggleBlockquote: () => ReturnType;
      unsetBlockquote: () => ReturnType;
    };
  }
}

const BLOCKQUOTE_INPUT_REGEX = /^\s*>\s$/;

function RichEditorBlockquoteView(props: TeactNodeViewComponentProps) {
  const className = createMemo(() =>
    typeof props.HTMLAttributes.class === 'string' ? props.HTMLAttributes.class : undefined,
  );
  let canCollapse = true;
  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  props.node.forEach((child) => {
    if (child.type.name !== 'paragraph' && child.type.name !== CAPTION_NODE_NAME) canCollapse = false;
  });
  const isCollapsed = createMemo(() => Boolean(props.node.attrs[BLOCKQUOTE_COLLAPSED_ATTR]));
  const hasEmptyCaption = createMemo(
    () => props.node.lastChild?.type.name === CAPTION_NODE_NAME && !props.node.lastChild.content.size,
  );

  const handleCollapseChange = (isNextCollapsed: boolean) => {
    props.updateAttributes({ [BLOCKQUOTE_COLLAPSED_ATTR]: isNextCollapsed });
  };

  return (
    <Blockquote
      className={className()}
      canBeCollapsible={canCollapse}
      noInitialCollapse={!isCollapsed()}
      recalculationKey={props.node}
      ignoredLines={hasEmptyCaption() ? 1 : undefined}
      isCollapsed={isCollapsed()}
      onCollapseChange={handleCollapseChange}
    >
      <NodeViewContent />
    </Blockquote>
  );
}

export function buildRichEditorBlockquote(getIsRichInputExpanded: () => boolean) {
  return TiptapNode.create<RichEditorBlockquoteOptions>({
    name: 'blockquote',
    group: 'block',
    content: `block+ ${CAPTION_NODE_NAME}?`,
    defining: true,
    isolating: true,

    addOptions() {
      return { HTMLAttributes: {} };
    },

    addAttributes() {
      return {
        [BLOCKQUOTE_COLLAPSED_ATTR]: {
          default: false,
          parseHTML: (element) => element.hasAttribute('data-collapsed') || element.hasAttribute('expandable'),
          renderHTML: (attributes) => (attributes[BLOCKQUOTE_COLLAPSED_ATTR] ? { 'data-collapsed': 'true' } : {}),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'blockquote' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ['blockquote', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
    },

    renderMarkdown(node, helpers) {
      if (!node.content) return '';

      return node.content
        .map((child, index) => {
          const content = helpers.renderChild?.(child, index) || helpers.renderChildren([child]);
          return content
            .split('\n')
            .map((line) => (line.trim() ? `> ${line}` : '>'))
            .join('\n');
        })
        .join('\n>\n');
    },

    parseMarkdown(token, helpers) {
      const parseChildren = helpers.parseBlockChildren || helpers.parseChildren;
      return helpers.createNode('blockquote', undefined, parseChildren(token.tokens || []));
    },

    addNodeView() {
      return TeactNodeViewRenderer(RichEditorBlockquoteView);
    },

    addCommands() {
      return {
        setBlockquote:
          () =>
          ({ commands }) =>
            commands.wrapIn(this.name),
        toggleBlockquote:
          () =>
          ({ state, commands, dispatch }) => {
            return isSelectionInsideRichEditorQuote(state.selection, this.name)
              ? unsetRichEditorQuote(state, dispatch, this.name)
              : commands.wrapIn(this.name);
          },
        unsetBlockquote:
          () =>
          ({ state, dispatch }) => {
            return unsetRichEditorQuote(state, dispatch, this.name);
          },
      };
    },

    addKeyboardShortcuts() {
      return {
        'Mod-Shift-b': () => this.editor.commands.toggleBlockquote(),
        Backspace: () => handleRichEditorQuoteBackspace(this.editor, this.name),
        ArrowUp: () => handleRichEditorQuoteArrow(this.editor, this.name, -1),
        ArrowDown: () => handleRichEditorQuoteArrow(this.editor, this.name, 1),
        Enter: () => handleRichEditorQuoteEnter(this.editor, this.name),
      };
    },

    addInputRules() {
      const rule = wrappingInputRule({ find: BLOCKQUOTE_INPUT_REGEX, type: this.type });
      return [
        new InputRule({
          find: rule.find,
          handler: (props) => {
            if (!getIsRichInputExpanded() && isSelectionInsideRichEditorQuote(props.state.selection, this.name)) {
              return;
            }

            return rule.handler(props);
          },
          undoable: rule.undoable,
        }),
      ];
    },
  });
}
