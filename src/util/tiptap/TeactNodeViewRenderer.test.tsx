// Original test (not in telegram-tt): the bridge between ProseMirror node views and frameact `render()` (TeactRenderer,
// TeactNodeViewRenderer, NodeViewContent) with a real tiptap editor in jsdom.
import { Editor, Node } from '@tiptap/core';
import { createMemo } from 'frameact';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { container, useDomHarness } from '../../lib/kit/testing/dom';

import NodeViewContent from './NodeViewContent';
import TeactNodeViewRenderer, { type TeactNodeViewComponentProps } from './TeactNodeViewRenderer';

const harness = useDomHarness();
const violations: string[] = [];
const editors: Editor[] = [];

const TestDocument = Node.create({ name: 'doc', topNode: true, content: 'block+' });

const TextNode = Node.create({ name: 'text', group: 'inline' });

const Paragraph = Node.create({
  name: 'paragraph',
  group: 'block',
  content: 'inline*',
  parseHTML: () => [{ tag: 'p' }],
  renderHTML: () => ['p', 0],
});

const Atom = Node.create({
  name: 'atom',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({ label: { default: 'a' } }),
  parseHTML: () => [{ tag: 'span[data-atom]' }],
  renderHTML: () => ['span', { 'data-atom': '' }],
  addNodeView() {
    return TeactNodeViewRenderer(AtomView, { as: 'span', className: 'atom-root' });
  },
});

const Wrapper = Node.create({
  name: 'wrapper',
  group: 'inline',
  inline: true,
  content: 'text*',
  parseHTML: () => [{ tag: 'span[data-wrapper]' }],
  renderHTML: () => ['span', { 'data-wrapper': '' }, 0],
  addNodeView() {
    return TeactNodeViewRenderer(WrapperView, { as: 'span', contentDOMElementTag: 'span' });
  },
});

function AtomView(props: TeactNodeViewComponentProps) {
  const label = createMemo(() => String(props.node.attrs.label));
  return (
    <b class={props.selected ? 'selected' : 'idle'} data-testid="atom">
      {label()}
    </b>
  );
}

function WrapperView(props: TeactNodeViewComponentProps) {
  return (
    <>
      <i data-testid="prefix">{props.node.textContent ? 'full' : 'empty'}</i>
      <NodeViewContent as="span" className="content" contentEditable={props.node.textContent ? undefined : false} />
    </>
  );
}

function createEditor(content: string) {
  const element = suppressStrict(() => {
    const el = container();
    // ProseMirror owns this subtree (the app marks the editor element the same way)
    el.setAttribute('data-stricterdom-ignore', '');
    return el;
  });
  const editor = new Editor({
    element,
    extensions: [TestDocument, Paragraph, TextNode, Atom, Wrapper],
    content,
  });
  editors.push(editor);
  return { editor, element };
}

beforeEach(() => {
  violations.length = 0;
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}]`));
});

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  setHandler();
  disableStrict();
  expect(violations).toEqual([]);
});

describe('TeactNodeViewRenderer', () => {
  it('renders a node view component into the node view element', async () => {
    const { element } = createEditor('<p>x<span data-atom></span>y</p>');
    await harness.frame();

    const root = element.querySelector('.atom-root')!;
    expect(root.tagName).toBe('SPAN');
    expect(root.querySelector('[data-testid="atom"]')!.textContent).toBe('a');
    expect(root.querySelector('[data-testid="atom"]')!.className).toBe('idle');
  });

  it('feeds new props to the component: attributes and selection update the bindings that read them', async () => {
    const { editor, element } = createEditor('<p>x<span data-atom></span>y</p>');
    await harness.frame();

    const atomPos = 2;
    const atom = element.querySelector('[data-testid="atom"]');
    editor.view.dispatch(editor.state.tr.setNodeMarkup(atomPos, undefined, { label: 'changed' }));
    await harness.frame();
    await harness.frame();
    expect(element.querySelector('[data-testid="atom"]')!.textContent).toBe('changed');

    editor.commands.setNodeSelection(atomPos);
    await harness.frame();
    await harness.frame();
    expect(element.querySelector('[data-testid="atom"]')!.className).toBe('selected');
    // The component runs once: an update must not re-create its elements
    expect(element.querySelector('[data-testid="atom"]')).toBe(atom);
  });

  it('shows an update dispatched from an event in the next frame, as tt did (editor review L1)', async () => {
    const { editor, element } = createEditor('<p>x<span data-atom></span>y</p>');
    await harness.frame();

    editor.view.dispatch(editor.state.tr.setNodeMarkup(2, undefined, { label: 'changed' }));
    await harness.frame();
    expect(element.querySelector('[data-testid="atom"]')!.textContent).toBe('changed');

    editor.commands.setNodeSelection(2);
    await harness.frame();
    expect(element.querySelector('[data-testid="atom"]')!.className).toBe('selected');
  });

  it('puts the ProseMirror content element into NodeViewContent and writes contenteditable as a string', async () => {
    const { editor, element } = createEditor('<p>x<span data-wrapper></span>y</p>');
    await harness.frame();

    const content = element.querySelector<HTMLElement>('.content')!;
    expect(content.hasAttribute('data-node-view-content')).toBe(true);
    // `contentEditable={false}` must reach the DOM as contenteditable="false" (a boolean false would drop the attribute)
    expect(content.getAttribute('contenteditable')).toBe('false');
    expect(content.querySelector('[data-node-view-content]')).not.toBeNull();
    expect(element.querySelector('[data-testid="prefix"]')!.textContent).toBe('empty');

    editor.commands.insertContentAt(3, 'typed');
    await harness.frame();
    await harness.frame();
    expect(element.querySelector('[data-testid="prefix"]')!.textContent).toBe('full');
    // The component runs once: an update must not re-create its elements
    expect(element.querySelector('.content')).toBe(content);
    expect(content.hasAttribute('contenteditable')).toBe(false);
    expect(content.textContent).toBe('typed');
  });

  it('disposes the component with the node view', async () => {
    const { editor, element } = createEditor('<p>x<span data-atom></span>y</p>');
    await harness.frame();
    expect(element.querySelector('.atom-root')).not.toBeNull();

    editor.commands.deleteRange({ from: 2, to: 3 });
    await harness.frame();
    expect(element.querySelector('.atom-root')).toBeNull();
  });
});
