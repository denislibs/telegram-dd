// Original test (not in telegram-tt): the message input renders an empty element for the rich editor and never re-creates
// it; the send shortcuts, the ArrowUp / Ctrl+Arrow shortcuts of an empty input, the editor registration and the
// max-length counter work as in tt.
import { createSignal, flushSync } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setGlobal } from '../../../global';

import type { ApiInputRichMessage } from '../../../api/types';
import type { TabState } from '../../../global/types';
import type { RichEditor, RichEditorRoot } from './richEditorTypes';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';
import { buildRichMessageFromFormatted } from '../../ui/textInput/richText';

import MessageInput from './MessageInput';

const { actions } = vi.hoisted(() => ({
  actions: {
    editLastMessage: vi.fn(),
    replyToNextMessage: vi.fn(),
    showAllowedMessageTypesNotification: vi.fn(),
    openPremiumModal: vi.fn(),
  },
}));

vi.mock('../../../global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../global')>()),
  getActions: () => actions,
}));

const EMPTY = buildRichMessageFromFormatted();

function createFakeEditor(initial: ApiInputRichMessage = EMPTY) {
  const [value, setValue] = createSignal(initial);
  const [isReady, setIsReady] = createSignal(false);
  const unregister = vi.fn();
  const registerRoot = vi.fn((_root: RichEditorRoot) => unregister);

  const richEditor = {
    get value() {
      return value();
    },
    get isReady() {
      return isReady();
    },
    editor: undefined,
    canUndo: false,
    canRedo: false,
    hasUnresolvedMedia: false,
    isEmpty: () => !value().blocks.length || JSON.stringify(value()) === JSON.stringify(EMPTY),
    registerRoot,
    setValue: (next?: ApiInputRichMessage) => setValue(next ?? EMPTY),
    replaceRange: vi.fn(),
  } as unknown as RichEditor;

  return { richEditor, setValue, setIsReady, registerRoot, unregister };
}

function press(target: Element, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('MessageInput', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;

  beforeAll(() => {
    const tabId = getCurrentTabId();
    const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
    setGlobal({ ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: tab } }, { forceOutdated: true });
  });

  beforeEach(() => {
    delegateEvents(['keydown', 'click', 'mousedown', 'focusin', 'focusout']);
    Object.values(actions).forEach((fn) => fn.mockReset());
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  const settle = async () => {
    await harness.frame();
    flushSync();
    await harness.frame();
  };

  function mount(extra: Partial<Parameters<typeof MessageInput>[0]> = {}) {
    const fake = createFakeEditor();
    const [isActive, setIsActive] = createSignal(true);
    const [canSendPlainText, setCanSendPlainText] = createSignal(true);
    const [maxLength, setMaxLength] = createSignal<number | undefined>(undefined);
    const onSend = vi.fn();
    const onRef = vi.fn();
    const root = container();

    dispose = render(
      () => (
        <MessageInput
          ref={onRef}
          id="message-input-root"
          editableInputId="editable-message-text"
          chatId="100"
          threadId={-1}
          richEditor={fake.richEditor}
          isActive={isActive()}
          placeholder="Message"
          canAutoFocus={false}
          canSendPlainText={canSendPlainText()}
          maxLength={maxLength()}
          onSend={onSend}
          {...extra}
        />
      ),
      root,
    );

    return { ...fake, root, onSend, onRef, setIsActive, setCanSendPlainText, setMaxLength };
  }

  it('renders an empty, ProseMirror-owned input inside a stricterdom-ignored wrapper and gives it to the parent', async () => {
    const t = mount();
    await settle();

    const input = t.root.querySelector<HTMLDivElement>('#editable-message-text')!;
    expect(input).toBeTruthy();
    expect(input.childNodes.length).toBe(0);
    expect(input.closest('[data-stricterdom-ignore]')).toBeTruthy();
    expect(input.getAttribute('role')).toBe('textbox');
    expect(input.classList.contains('form-control')).toBe(true);
    expect(t.onRef).toHaveBeenCalledWith(input);
    // Not ready yet: the input is not editable.
    expect(input.getAttribute('contenteditable')).toBe('false');
    expect(input.getAttribute('aria-disabled')).toBe('true');
  });

  it('registers the input with the rich editor and keeps the same element when its state changes', async () => {
    const t = mount();
    await settle();

    const input = t.root.querySelector<HTMLDivElement>('#editable-message-text')!;
    expect(t.registerRoot).toHaveBeenCalledTimes(1);
    const registered = t.registerRoot.mock.calls[0][0];
    expect(registered.element).toBe(input);
    expect(registered.getIsRichInputExpanded()).toBe(false);
    expect(registered.sharedCanvasRef?.()).toBeInstanceOf(HTMLCanvasElement);

    // The editor becomes ready: the element is now editable, and it is the same element.
    t.setIsReady(true);
    await settle();
    expect(t.root.querySelector('#editable-message-text')).toBe(input);
    expect(input.getAttribute('contenteditable')).toBe('true');
    expect(input.classList.contains('ProseMirror')).toBe(true);
    expect(input.hasAttribute('aria-disabled')).toBe(false);

    // The editor is re-registered (and the old registration released) when the input is deactivated.
    t.setIsActive(false);
    await settle();
    expect(t.unregister).toHaveBeenCalled();
    expect(t.root.querySelector('#editable-message-text')).toBe(input);
    expect(input.childNodes.length).toBe(0);
  });

  it('does not register an editor in a chat where plain text cannot be sent, and leaves the input not editable', async () => {
    const t = mount({ canSendPlainText: false });
    await settle();

    const input = t.root.querySelector<HTMLDivElement>('#editable-message-text')!;
    expect(t.registerRoot).not.toHaveBeenCalled();
    expect(input.getAttribute('contenteditable')).toBe('false');
    expect(input.classList.contains('ProseMirror')).toBe(false);
    expect(t.root.querySelector('canvas')).toBeNull();
  });

  describe('send shortcuts', () => {
    it('sends on Enter by default and stops the event, but not on Shift+Enter', async () => {
      const t = mount({ messageSendKeyCombo: 'enter' });
      t.setIsReady(true);
      await settle();
      const input = t.root.querySelector<HTMLDivElement>('#editable-message-text')!;

      const sent = press(input, { key: 'Enter' });
      expect(t.onSend).toHaveBeenCalledTimes(1);
      expect(sent.defaultPrevented).toBe(true);

      const newLine = press(input, { key: 'Enter', shiftKey: true });
      expect(t.onSend).toHaveBeenCalledTimes(1);
      expect(newLine.defaultPrevented).toBe(false);
    });

    it('needs Ctrl or Cmd with the ctrl-enter combo', async () => {
      const t = mount({ messageSendKeyCombo: 'ctrl-enter' });
      t.setIsReady(true);
      await settle();
      const input = t.root.querySelector<HTMLDivElement>('#editable-message-text')!;

      press(input, { key: 'Enter' });
      expect(t.onSend).not.toHaveBeenCalled();

      press(input, { key: 'Enter', ctrlKey: true });
      expect(t.onSend).toHaveBeenCalledTimes(1);
      press(input, { key: 'Enter', metaKey: true });
      expect(t.onSend).toHaveBeenCalledTimes(2);
    });

    it('does not send while composing', async () => {
      const t = mount({ messageSendKeyCombo: 'enter' });
      t.setIsReady(true);
      await settle();
      const input = t.root.querySelector<HTMLDivElement>('#editable-message-text')!;

      press(input, { key: 'Enter', isComposing: true });
      expect(t.onSend).not.toHaveBeenCalled();
    });
  });

  describe('shortcuts of an empty input', () => {
    it('edits the last message on ArrowUp, only when the input is empty and without modifiers', async () => {
      const t = mount();
      t.setIsReady(true);
      await settle();
      const input = t.root.querySelector<HTMLDivElement>('#editable-message-text')!;

      const up = press(input, { key: 'ArrowUp' });
      expect(actions.editLastMessage).toHaveBeenCalledTimes(1);
      expect(up.defaultPrevented).toBe(true);

      press(input, { key: 'ArrowUp', altKey: true });
      expect(actions.editLastMessage).toHaveBeenCalledTimes(1);

      t.setValue(buildRichMessageFromFormatted({ text: 'hello' }));
      press(input, { key: 'ArrowUp' });
      expect(actions.editLastMessage).toHaveBeenCalledTimes(1);
    });

    it('navigates the replies on Ctrl+ArrowUp / Ctrl+ArrowDown', async () => {
      const t = mount();
      t.setIsReady(true);
      await settle();
      const input = t.root.querySelector<HTMLDivElement>('#editable-message-text')!;

      press(input, { key: 'ArrowUp', ctrlKey: true });
      expect(actions.replyToNextMessage).toHaveBeenLastCalledWith({ targetIndexDelta: -1 });
      press(input, { key: 'ArrowDown', metaKey: true });
      expect(actions.replyToNextMessage).toHaveBeenLastCalledWith({ targetIndexDelta: 1 });
      expect(actions.editLastMessage).not.toHaveBeenCalled();
    });
  });

  it('leaves the children and the foreign attributes ProseMirror put on the input alone', async () => {
    const t = mount();
    t.setIsReady(true);
    await settle();
    const input = t.root.querySelector<HTMLDivElement>('#editable-message-text')!;

    const paragraph = document.createElement('p');
    paragraph.textContent = 'typed';
    input.append(paragraph);
    input.setAttribute('data-from-editor', '1');

    t.setIsActive(false);
    await settle();
    t.setIsActive(true);
    t.setMaxLength(50);
    await settle();

    expect(t.root.querySelector('#editable-message-text')).toBe(input);
    expect(input.firstChild).toBe(paragraph);
    expect(input.getAttribute('data-from-editor')).toBe('1');
  });

  describe('document-level key interception', () => {
    it('replays a printable key pressed outside any field onto the input', async () => {
      const t = mount();
      t.setIsReady(true);
      await settle();
      const input = t.root.querySelector<HTMLDivElement>('#editable-message-text')!;
      const received = vi.fn();
      input.addEventListener('keydown', received);

      press(document.body, { key: 'a', code: 'KeyA' });
      expect(received).toHaveBeenCalledTimes(1);
      expect((received.mock.calls[0][0] as KeyboardEvent).key).toBe('a');
    });

    it('ignores keys that must not move the focus, and does nothing when interception is off', async () => {
      const t = mount();
      t.setIsReady(true);
      await settle();
      const input = t.root.querySelector<HTMLDivElement>('#editable-message-text')!;
      const received = vi.fn();
      input.addEventListener('keydown', received);

      press(document.body, { key: 'Escape' });
      press(document.body, { key: 'ArrowDown' });
      press(document.body, { key: 'Shift', shiftKey: true });
      expect(received).not.toHaveBeenCalled();

      const field = document.createElement('input');
      document.body.append(field);
      press(field, { key: 'a', code: 'KeyA' });
      expect(received).not.toHaveBeenCalled();
      field.remove();
    });

    it('does not intercept when the input has noFocusInterception', async () => {
      const t = mount({ noFocusInterception: true });
      t.setIsReady(true);
      await settle();
      const input = t.root.querySelector<HTMLDivElement>('#editable-message-text')!;
      const received = vi.fn();
      input.addEventListener('keydown', received);

      press(document.body, { key: 'a', code: 'KeyA' });
      expect(received).not.toHaveBeenCalled();
    });
  });

  it('shows the remaining length only below the threshold and marks an overflow', async () => {
    const t = mount({ maxLength: 120 });
    t.setIsReady(true);
    await settle();
    expect(t.root.querySelector('.max-length-indicator')).toBeNull();

    t.setValue(buildRichMessageFromFormatted({ text: 'a'.repeat(30) }));
    await settle();
    const indicator = t.root.querySelector('.max-length-indicator')!;
    expect(indicator).toBeTruthy();
    expect(indicator.classList.contains('color-danger')).toBe(false);

    t.setValue(buildRichMessageFromFormatted({ text: 'a'.repeat(130) }));
    await settle();
    expect(t.root.querySelector('.max-length-indicator')!.classList.contains('color-danger')).toBe(true);
  });
});
