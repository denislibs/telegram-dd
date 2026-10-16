// Original test (not in telegram-tt): engine gap 9. tt's teact wrote "true" / "false" for boolean `aria-*` attributes and
// for `contentEditable` / `draggable` / `spellcheck`; frameact removes an attribute set to `false` and writes `""` for
// `true`. These components must write tt's strings (src/util/booleanAttributes.test.ts guards the sources).
// @vitest-environment jsdom
import type { Editor, JSONContent } from '@tiptap/core';
import { flushSync } from 'frameact';
import { render } from 'frameact/dom';
import { afterEach, expect, it, vi } from 'vitest';

import { __createRichEditor as createRichEditor } from './middle/composer/helpers/richEditor';

// The lazy chunk behind `MessageInput.async` is loaded here, while jsdom is up: imported lazily from a test, its modules (the
// editor bundle, `CodeOverlay`'s event delegation) finished evaluating after the environment was torn down (`window is not defined`).
import './middle/composer/MessageInput';
import MessageInputAsync from './middle/composer/MessageInput.async';
import Button from './ui/Button';
import ListItem from './ui/ListItem';
import TextFormatterInput from './ui/textInput/TextFormatterInput';
import Toggle from './ui/Toggle';

const disposers: (() => void)[] = [];
const editors: Editor[] = [];

function mount(view: () => JSX.Element) {
  const host = document.createElement('div');
  document.body.append(host);
  disposers.push(render(view, host));
  flushSync();
  return host;
}

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.textContent = '';
  vi.unstubAllGlobals();
});

it('Toggle is hidden from assistive technology with aria-hidden="true"', () => {
  const host = mount(() => <Toggle value="mid" />);
  expect(host.querySelector('.Toggle')?.getAttribute('aria-hidden')).toBe('true');
});

it('ListItem: aria-disabled="true" when disabled, no attribute otherwise', () => {
  const host = mount(() => (
    <>
      <ListItem disabled>a</ListItem>
      <ListItem>b</ListItem>
    </>
  ));
  const buttons = host.querySelectorAll('.ListItem-button');
  expect(buttons[0].getAttribute('aria-disabled')).toBe('true');
  expect(buttons[1].hasAttribute('aria-disabled')).toBe(false);
});

it('Button writes aria-selected / aria-haspopup as "true" / "false"', () => {
  const host = mount(() => (
    <>
      <Button ariaSelected={false} hasPopup>
        a
      </Button>
      <Button ariaSelected>b</Button>
      <Button>c</Button>
    </>
  ));
  const [first, second, third] = host.querySelectorAll('button');
  expect(first.getAttribute('aria-selected')).toBe('false');
  expect(first.getAttribute('aria-haspopup')).toBe('true');
  expect(second.getAttribute('aria-selected')).toBe('true');
  expect(third.hasAttribute('aria-selected')).toBe(false);
  expect(third.hasAttribute('aria-haspopup')).toBe(false);
});

it('TextFormatterInput: spellcheck="false" when shouldSpellCheck is false', () => {
  const host = mount(() => (
    <TextFormatterInput
      value=""
      placeholder=""
      ariaLabel="LaTeX"
      shouldSpellCheck={false}
      onChange={() => undefined}
      onSubmit={() => undefined}
    />
  ));
  expect(host.querySelector('input')?.getAttribute('spellcheck')).toBe('false');
});

it('MessageInput placeholder: aria-busy="true" and aria-disabled="true" while the editor bundle loads', () => {
  const host = mount(() => (
    <MessageInputAsync
      id="message-input"
      chatId="1"
      threadId={-1}
      isAttachmentModalInput={false}
      editableInputId="editable-message-text"
      placeholder="Message"
      onUpdate={() => undefined}
      onSend={() => undefined}
    />
  ));
  expect(host.querySelector('#message-input')?.getAttribute('aria-busy')).toBe('true');
  expect(host.querySelector('#editable-message-text')?.getAttribute('aria-disabled')).toBe('true');
});

it('EditableListItem: the checkbox wrapper of a task item is contenteditable="false"', async () => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  const element = document.createElement('div');
  document.body.append(element);
  const content: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        attrs: { checklist: true },
        content: [
          {
            type: 'listItem',
            attrs: { checkbox: true, checked: false },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'task' }] }],
          },
        ],
      },
    ],
  };
  editors.push(
    createRichEditor({
      element,
      content,
      getIsRichInputExpanded: () => false,
      getCanInsertMedia: () => true,
      onUpdate: () => undefined,
      onDateClick: () => undefined,
      onMediaEdit: () => undefined,
      onMediaFiles: () => undefined,
    }),
  );
  await new Promise<void>((resolve) => setTimeout(resolve, 80));
  const checkbox = element.querySelector('li input[type="checkbox"]');
  expect(checkbox).not.toBeNull();
  // The outermost span around the checkbox: the node view's non-content wrapper.
  let wrapper = checkbox!.closest('span');
  while (wrapper?.parentElement?.closest('span')) wrapper = wrapper.parentElement.closest('span');
  expect(wrapper?.getAttribute('contenteditable')).toBe('false');
});
