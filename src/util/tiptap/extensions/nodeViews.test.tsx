// Original test (not in telegram-tt): the tiptap node views of the rich editor (math, formatted date, mention, custom
// emoji) on the frameact runtime, with a real editor in jsdom.
import { Editor, Node } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { delegateEvents } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setGlobal } from '../../../global';

import type { GlobalState, TabState } from '../../../global/types';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { addUsers } from '../../../global/reducers/users';
import { getCurrentTabId } from '../../establishMultitabRole';
import { cloneDeep } from '../../iteratees';
import { FormattedDateNode, MathInlineNode, MentionNode } from './index';

const harness = useDomHarness();

const USER_ID = '2000';

function seedUser() {
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: getCurrentTabId() };
  let global: GlobalState = { ...cloneDeep(INITIAL_GLOBAL_STATE), currentUserId: '1000', byTabId: { [tab.id]: tab } };
  global = addUsers(global, {
    [USER_ID]: { id: USER_ID, firstName: 'Ann', type: 'userTypeRegular', isMin: false, phoneNumber: '' },
  });
  setGlobal(global, { forceOutdated: true });
}
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

function createEditor(content: Parameters<typeof Editor.prototype.commands.setContent>[0], onDateClick = vi.fn()) {
  const element = suppressStrict(() => {
    const el = container();
    el.setAttribute('data-stricterdom-ignore', '');
    return el;
  });
  const editor = new Editor({
    element,
    extensions: [
      TestDocument,
      Paragraph,
      TextNode,
      MathInlineNode,
      MentionNode,
      FormattedDateNode.configure({ onClick: onDateClick }),
    ],
    content,
  });
  editors.push(editor);
  return { editor, element, onDateClick };
}

async function frames(count = 3) {
  for (let i = 0; i < count; i++) await harness.frame();
}

beforeEach(() => {
  violations.length = 0;
  delegateEvents(['click', 'mousedown']);
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}]`));
});

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  setHandler();
  disableStrict();
  expect(violations).toEqual([]);
});

describe('math node view', () => {
  it('renders the formula source in a non-editable span, and a placeholder when it is empty', async () => {
    const { element } = createEditor('<p>a<tg-math>x^2</tg-math>b<tg-math></tg-math></p>');
    await frames();

    const spans = [...element.querySelectorAll<HTMLElement>('span[contenteditable="false"]')];
    expect(spans).toHaveLength(2);
    expect(spans[0].querySelector('[data-source]')!.getAttribute('data-source')).toBe('x^2');
    expect(spans[1].querySelector('[data-source]')).toBeNull();
  });

  it('opens the editor popup when the node is selected and closes it when the selection leaves', async () => {
    const { editor, element } = createEditor('<p>a<tg-math>x^2</tg-math>b</p>');
    await frames();
    const math = element.querySelector<HTMLElement>('span[contenteditable="false"]')!;
    math.getBoundingClientRect = () => ({ left: 10, width: 20, top: 5 }) as DOMRect;

    expect(document.querySelector('input')).toBeNull();

    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 2)));
    await frames(6);
    expect(math.className).toContain('mathSelected');
    expect(document.body.querySelector('input')).not.toBeNull();

    editor.commands.setTextSelection(1);
    await frames(6);
    expect(math.className).not.toContain('mathSelected');
    expect(document.body.querySelector('input')).toBeNull();
  });
});

describe('formatted date node view', () => {
  it('renders the formatted date and reports a click with the node range', async () => {
    const { element, onDateClick } = createEditor('<p>a<tg-time unix="1700000000" format="t">noon</tg-time>b</p>');
    await frames();

    const view = element.querySelector<HTMLElement>('span[contenteditable="false"]')!;
    // FormattedDate renders the date in the requested format, not the label
    expect(view.textContent).toMatch(/\d{1,2}:\d{2}/);

    view.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await frames();
    expect(onDateClick).toHaveBeenCalledTimes(1);
    expect(onDateClick.mock.calls[0][0]).toMatchObject({ type: 'formattedDate', date: 1700000000, range: { from: 2 } });
  });
});

describe('mention node view', () => {
  it('shows the avatar of a known user and keeps the content editable', async () => {
    seedUser();
    const { editor, element } = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a' },
            { type: 'mention', attrs: { userId: USER_ID }, content: [{ type: 'text', text: 'Ann' }] },
            { type: 'text', text: 'b' },
          ],
        },
      ],
    });
    await frames();

    const mention = element.querySelector<HTMLElement>('[class*="mention"]')!;
    expect(mention).not.toBeNull();
    expect(mention.querySelector('[class*="mentionAvatar"]')!.getAttribute('contenteditable')).toBe('false');
    expect(mention.querySelector('[class*="mentionContent"]')!.textContent).toBe('Ann');
    expect(mention.querySelector('[class*="mentionContent"]')!.hasAttribute('contenteditable')).toBe(false);

    // the content element is moved by ProseMirror into the node view, and edits keep working
    editor.commands.insertContentAt(3, 'x');
    await frames();
    expect(mention.querySelector('[class*="mentionContent"]')!.textContent).toBe('xAnn');
  });

  it('is read-only when the user is unknown', async () => {
    const { element } = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'mention', attrs: { userId: '999999' }, content: [{ type: 'text', text: 'Bob' }] }],
        },
      ],
    });
    await frames();

    const content = element.querySelector('[class*="mentionContent"]')!;
    expect(content.getAttribute('contenteditable')).toBe('false');
    expect(element.querySelector('[class*="mentionAvatar"]')).toBeNull();
  });
});
