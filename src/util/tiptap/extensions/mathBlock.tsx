import {
  InputRule, Node as TiptapNode, nodeInputRule,
} from '@tiptap/core';
import { NodeSelection, Selection } from '@tiptap/pm/state';
import {
  createEffect, createMemo, createSignal, requestMeasure,
} from 'frameact';
import { Show } from 'frameact/dom';

import type { IAnchorPosition } from '../../../types';
import type { TeactNodeViewComponentProps } from '../TeactNodeViewRenderer';

import buildClassName from '../../buildClassName';
import { MATH_BLOCK_NODE_NAME, MATH_INLINE_NODE_NAME } from '../constants';
import { escapeRichMarkdownHtml, RE_RICH_MARKDOWN_INLINE_MATH } from '../richMarkdown';

import useLang from '../../../hooks/useLang';

import Latex from '../../../components/iv/Latex';
import Portal from '../../../components/ui/Portal';
import TextFormatterInput from '../../../components/ui/textInput/TextFormatterInput';
import TeactNodeViewRenderer from '../TeactNodeViewRenderer';

import textFormatterStyles from '../../../components/ui/textInput/TextFormatter.module.scss';
import styles from '../styling.module.scss';

const MATH_BLOCK_INPUT_REGEX = /^\$\$(?=\S).*\S\$\$$/;
const MATH_BLOCK_TOKEN_REGEX = /^\$\$\s*([\s\S]*?)\s*\$\$(?:\n|$)/;
const MATH_FENCE_TOKEN_REGEX = /^```math[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```(?:\r?\n|$)/;
const MATH_FENCE_INPUT_REGEX = /^```math[\s\n]$/;
const MATH_INLINE_INPUT_REGEX = new RegExp(`${RE_RICH_MARKDOWN_INLINE_MATH.source}$`);
const MATH_INLINE_TOKEN_REGEX = new RegExp(`^${RE_RICH_MARKDOWN_INLINE_MATH.source}`);

const MathNode = TiptapNode.create({
  name: 'math',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      source: {
        default: '',
        parseHTML: (element: HTMLElement) => element.dataset.source || element.textContent || '',
      },
    };
  },

  renderText({ node }) {
    return node.attrs.source;
  },

  addNodeView() {
    const isInline = this.name === MATH_INLINE_NODE_NAME;

    return TeactNodeViewRenderer(EditableMath, {
      as: isInline ? 'span' : undefined,
      className: styles.mathNode,
    });
  },
});

export const MathBlockNode = MathNode.extend({
  name: MATH_BLOCK_NODE_NAME,
  group: 'block',
  priority: 101,

  parseHTML() {
    return [
      { tag: 'tg-math-block' },
      { tag: 'div[data-rich-block-type="math"]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['tg-math-block', HTMLAttributes.source];
  },

  renderMarkdown(node) {
    const source = String(node.attrs?.source || '');
    return source.includes('$$')
      ? `<tg-math-block>${escapeRichMarkdownHtml(source)}</tg-math-block>`
      : `$$${source}$$`;
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode(MATH_BLOCK_NODE_NAME, { source: token.text || '' });
  },

  markdownTokenizer: {
    name: MATH_BLOCK_NODE_NAME,
    level: 'block',
    start: (source) => source.search(/^(?:\$\$|```math)/m),
    tokenize: (source) => {
      const match = MATH_BLOCK_TOKEN_REGEX.exec(source) || MATH_FENCE_TOKEN_REGEX.exec(source);
      if (!match) {
        return undefined;
      }

      return {
        type: MATH_BLOCK_NODE_NAME,
        raw: match[0],
        text: match[1],
      };
    },
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: MATH_BLOCK_INPUT_REGEX,
        type: this.type,
        getAttributes: (match) => ({ source: match[0].slice(2, -2) }),
      }),
      nodeInputRule({
        find: MATH_FENCE_INPUT_REGEX,
        type: this.type,
      }),
    ];
  },
});

export const MathInlineNode = MathNode.extend({
  name: MATH_INLINE_NODE_NAME,
  group: 'inline',
  inline: true,

  parseHTML() {
    return [
      { tag: 'span[data-rich-text-type="math"]' },
      { tag: 'tg-math' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['tg-math', HTMLAttributes.source];
  },

  renderMarkdown(node) {
    const source = String(node.attrs?.source || '');
    return source.includes('$') || source.includes('\n')
      ? `<tg-math>${escapeRichMarkdownHtml(source)}</tg-math>`
      : `$${source}$`;
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode(MATH_INLINE_NODE_NAME, { source: token.text || '' });
  },

  markdownTokenizer: {
    name: MATH_INLINE_NODE_NAME,
    level: 'inline',
    start: (source) => source.indexOf('$'),
    tokenize: (source) => {
      const match = MATH_INLINE_TOKEN_REGEX.exec(source);
      if (!match) {
        return undefined;
      }

      return {
        type: MATH_INLINE_NODE_NAME,
        raw: match[0],
        text: match[1],
      };
    },
  },

  addInputRules() {
    return [new InputRule({
      find: MATH_INLINE_INPUT_REGEX,
      handler: ({ state, range, match }) => {
        state.tr.replaceWith(range.from, range.to, this.type.create({ source: match[1] }));
      },
    })];
  },
});

function EditableMath(props: TeactNodeViewComponentProps) {
  let mathRef!: HTMLSpanElement;
  let editorRef: HTMLDivElement | undefined;
  const lang = useLang();

  const isInline = () => props.node.type.name === MATH_INLINE_NODE_NAME;
  // Deviation: tt re-evaluated this on every render. The node view props are getters over one signal that is written by
  // every `updateProps`, so reading `props.node` / `props.selected` here re-runs the memo exactly when tt re-rendered.
  const isMathNodeSelected = createMemo(() => {
    void props.node;
    const nodePosition = props.getPos();
    return props.selected
      && typeof nodePosition === 'number'
      && props.editor.state.selection instanceof NodeSelection
      && props.editor.state.selection.from === nodePosition;
  });
  const [isEditorOpen, setIsEditorOpen] = createSignal(isMathNodeSelected());
  const [editorAnchor, setEditorAnchor] = createSignal<IAnchorPosition | undefined>(undefined);

  const source = createMemo(() => (typeof props.node.attrs.source === 'string' ? props.node.attrs.source : ''));
  const hasSource = createMemo(() => Boolean(source().trim()));
  const canToggleDisplayMode = createMemo(() => Boolean(buildDisplayModeTransaction(props.editor, props.node, props.getPos)));

  function updateEditorAnchor() {
    requestMeasure(() => {
      if (!mathRef) {
        return;
      }

      const rect = mathRef.getBoundingClientRect();
      setEditorAnchor({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    });
  }

  createEffect(isMathNodeSelected, (isSelected) => {
    setIsEditorOpen(isSelected);
  });

  createEffect(isEditorOpen, (isOpen) => {
    if (!isOpen) {
      setEditorAnchor(undefined);
      return undefined;
    }

    updateEditorAnchor();
    window.addEventListener('resize', updateEditorAnchor);
    document.addEventListener('scroll', updateEditorAnchor, true);

    return () => {
      window.removeEventListener('resize', updateEditorAnchor);
      document.removeEventListener('scroll', updateEditorAnchor, true);
    };
  });

  createEffect(isEditorOpen, (isOpen) => {
    if (!isOpen) {
      return undefined;
    }

    function handleDocumentMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (mathRef?.contains(target) || editorRef?.contains(target)) {
        return;
      }

      setIsEditorOpen(false);
    }

    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown);
  });

  function handleMathMouseDown() {
    setIsEditorOpen(true);
  }

  function handleSourceChange(value: string) {
    const position = props.getPos();
    if (typeof position !== 'number') {
      return;
    }

    const currentNode = props.editor.state.doc.nodeAt(position);
    if (currentNode?.type !== props.node.type) {
      return;
    }

    const transaction = props.editor.state.tr.setNodeMarkup(position, undefined, {
      ...currentNode.attrs,
      source: value,
    });
    transaction.setSelection(NodeSelection.create(transaction.doc, position));
    props.editor.view.dispatch(transaction);
  }

  function deleteMath() {
    const position = props.getPos();
    if (typeof position !== 'number') {
      return;
    }

    props.editor.chain().focus().deleteRange({
      from: position,
      to: position + props.node.nodeSize,
    }).run();
  }

  function toggleDisplayMode() {
    const transaction = buildDisplayModeTransaction(props.editor, props.node, props.getPos);
    if (!transaction) {
      return;
    }

    props.editor.view.dispatch(transaction);
    props.editor.commands.focus();
  }

  function handleEditorMouseDown(e: MouseEvent) {
    e.stopPropagation();
  }

  function closeEditor() {
    setIsEditorOpen(false);
    props.editor.commands.focus();
  }

  function submitEditor() {
    setIsEditorOpen(false);

    const position = props.getPos();
    if (typeof position !== 'number') {
      return;
    }

    const nextSelection = Selection.near(props.editor.state.doc.resolve(position + props.node.nodeSize));
    props.editor.view.dispatch(props.editor.state.tr.setSelection(nextSelection));
    props.editor.commands.focus();
  }

  const editorStyle = () => {
    const anchor = editorAnchor();
    return anchor ? `left: ${anchor.x}px; top: ${anchor.y}px;` : undefined;
  };

  return (
    <>
      <span
        ref={mathRef}
        class={buildClassName(isInline() ? styles.mathInline : styles.mathBlock, props.selected && styles.mathSelected)}
        // Deviation: `contenteditable` is an attribute with a string value; `contentEditable={false}` writes no attribute.
        contenteditable="false"
        onMouseDown={handleMathMouseDown}
      >
        <Show
          when={hasSource()}
          fallback={<span class={styles.mathPlaceholder}>{lang('RichEditorFormulaPrompt')}</span>}
        >
          <Latex source={source()} isBlock={isInline() ? undefined : true} />
        </Show>
      </span>
      <Show when={isEditorOpen() && editorAnchor()}>
        <Portal>
          <div
            ref={editorRef}
            class={buildClassName(textFormatterStyles.inputPopup, styles.mathEditor)}
            style={editorStyle()}
            contenteditable="false"
            onMouseDown={handleEditorMouseDown}
          >
            <TextFormatterInput
              value={source()}
              placeholder={lang('RichEditorFormulaPrompt')}
              ariaLabel={lang('RichEditorFormula')}
              isActive
              leadingButtonIconName={canToggleDisplayMode()
                ? (!isInline() ? 'table-merge-horizontal' : 'table-split-horizontal')
                : undefined}
              leadingButtonAriaLabel={canToggleDisplayMode()
                ? lang(isInline() ? 'RichEditorFormulaToBlock' : 'RichEditorFormulaToInline')
                : undefined}
              shouldSpellCheck={false}
              dir="ltr"
              onChange={handleSourceChange}
              onSubmit={submitEditor}
              onEscape={closeEditor}
              onDeleteEmpty={deleteMath}
              onLeadingButtonClick={canToggleDisplayMode() ? toggleDisplayMode : undefined}
            />
          </div>
        </Portal>
      </Show>
    </>
  );
}

function buildDisplayModeTransaction(
  editor: TeactNodeViewComponentProps['editor'],
  node: TeactNodeViewComponentProps['node'],
  getPos: TeactNodeViewComponentProps['getPos'],
) {
  const position = getPos();
  if (typeof position !== 'number' || editor.state.doc.nodeAt(position)?.type !== node.type) {
    return undefined;
  }

  const targetTypeName = node.isInline ? MATH_BLOCK_NODE_NAME : MATH_INLINE_NODE_NAME;
  const targetType = editor.schema.nodes[targetTypeName];
  const targetNode = targetType.create(node.attrs);
  const $position = editor.state.doc.resolve(position);
  const transaction = editor.state.tr;
  let canReplaceParent = false;
  if (node.isInline && $position.parent.childCount === 1) {
    const parentIndex = $position.index($position.depth - 1);
    canReplaceParent = $position.node($position.depth - 1).canReplaceWith(
      parentIndex,
      parentIndex + 1,
      targetType,
    );
  }
  const targetPosition = canReplaceParent ? $position.before() : position + 1;

  if (canReplaceParent) {
    transaction.replaceRangeWith($position.before(), $position.after(), targetNode);
  } else {
    transaction.replaceWith(position, position + node.nodeSize, targetNode);
  }

  if (transaction.doc.nodeAt(targetPosition) !== targetNode) {
    return undefined;
  }

  transaction.setSelection(NodeSelection.create(transaction.doc, targetPosition));
  return transaction;
}
