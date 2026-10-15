// Hand-finished gili primitives (Interactive / Control / Checkbox / Modal) and `useClickable`: the context values stay
// reactive, the dialog waits for its element, and stricterdom stays quiet.
import { createSignal, flushSync } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { setGlobal } from '../../global';

import { container, useDomHarness } from '../../lib/kit/testing/dom';
import { flushMicrotasks } from '../../lib/kit/testing/micro';
import { INITIAL_GLOBAL_STATE } from '../../global/initialState';

import RemoveFormattingModal from '../common/RemoveFormattingModal';
import RichEditorLinkModal from '../middle/composer/RichEditorLinkModal';
import Control, { ControlLabel } from './layout/Control';
import Interactive from './layout/Interactive';
import Modal, { ModalFooterActions, ModalHeader, ModalSubtitle, ModalTitle } from './modal/Modal';
import Checkbox from './primitives/Checkbox';

beforeAll(() => {
  setGlobal(structuredClone(INITIAL_GLOBAL_STATE));
  // jsdom has no modal dialogs
  const proto = HTMLDialogElement.prototype;
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

const { frame } = useDomHarness();
const violations: string[] = [];
const host = () => suppressStrict(container);
// A mouse click has `detail` >= 1; `HTMLElement.click()` and keyboard activation produce 0 (a synthetic click).
const mouseClick = (target: Element) => target.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));

beforeEach(() => {
  violations.length = 0;
  delegateEvents(['click', 'input', 'mousedown', 'keydown', 'keyup']);
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}]`));
});

afterEach(() => {
  vi.useRealTimers();
  setHandler();
  disableStrict();
  document.body.classList.remove('has-open-dialog');
  expect(violations).toEqual([]);
});

it('Interactive: the label/div switch, loading context reaches Checkbox and Control, click and keyboard activation', async () => {
  const el = host();
  const [loading, setLoading] = createSignal(false);
  const [disabled, setDisabled] = createSignal(false);
  const onClick = vi.fn();
  const onChange = vi.fn();
  const dispose = render(
    () => (
      <Interactive clickable loading={loading()} disabled={disabled()} onClick={onClick} className="row">
        <Control>
          <ControlLabel>Label</ControlLabel>
          <Checkbox checked={false} onChange={onChange} />
        </Control>
      </Interactive>
    ),
    el,
  );
  await flushMicrotasks();
  await frame();

  const row = el.querySelector('.row') as HTMLElement;
  expect(row.tagName).toBe('DIV');
  expect(row.getAttribute('role')).toBe('button');
  expect(row.tabIndex).toBe(0);
  expect(el.querySelector('input[type="checkbox"]')).not.toBeNull();
  // the label points at the control id
  const input = el.querySelector('input') as HTMLInputElement;
  expect(el.querySelector('label')!.getAttribute('for')).toBe(input.id);

  mouseClick(row);
  expect(onClick).toHaveBeenCalledTimes(1);

  // Enter on the element presses it (a synthetic click is let through only after a key)
  row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  expect(onClick).toHaveBeenCalledTimes(2);

  // loading: the Checkbox disappears, the Control shows a spinner, the row is not pressable
  setLoading(true);
  flushSync();
  await frame();
  expect(el.querySelector('input[type="checkbox"]')).toBeNull();
  expect(row.getAttribute('aria-disabled')).toBe('true');
  expect(row.tabIndex).toBe(-1);
  mouseClick(row);
  expect(onClick).toHaveBeenCalledTimes(2);

  setLoading(false);
  flushSync();
  await frame();
  expect(el.querySelector('input[type="checkbox"]')).not.toBeNull();

  // disabled: the input is disabled through the context
  setDisabled(true);
  flushSync();
  await frame();
  expect((el.querySelector('input') as HTMLInputElement).disabled).toBe(true);
  dispose();
});

it('Checkbox: controlled by `checked`, reports the new state, indeterminate is a property, nonInteractive blocks it', async () => {
  const el = host();
  const [checked, setChecked] = createSignal(false);
  const [indeterminate, setIndeterminate] = createSignal(true);
  const [nonInteractive, setNonInteractive] = createSignal(false);
  const onChange = vi.fn((value: boolean) => setChecked(value));
  const dispose = render(
    () => (
      <Checkbox
        checked={checked()}
        indeterminate={indeterminate()}
        nonInteractive={nonInteractive()}
        isRound
        className="cb"
        onChange={onChange}
      />
    ),
    el,
  );
  await flushMicrotasks();
  await frame();
  const input = el.querySelector('input') as HTMLInputElement;
  expect(input.classList.contains('cb')).toBe(true);
  expect(input.indeterminate).toBe(true);

  input.click();
  expect(onChange).toHaveBeenLastCalledWith(true);
  flushSync();
  expect(input.checked).toBe(true);

  setIndeterminate(false);
  flushSync();
  await frame();
  expect(input.indeterminate).toBe(false);

  setNonInteractive(true);
  flushSync();
  await frame();
  expect(input.tabIndex).toBe(-1);
  expect(input.getAttribute('aria-disabled')).toBe('true');
  input.click();
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(input.checked).toBe(true);
  dispose();
});

it('Modal: renders into the portal on open, registers title and subtitle, closes through the animation fallback', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  suppressStrict(() => {
    host().id = 'portals';
  });
  const el = suppressStrict(() => document.body.appendChild(document.createElement('div')));
  const [isOpen, setIsOpen] = createSignal(false);
  const onClose = vi.fn();
  const onCloseAnimationEnd = vi.fn();
  const dispose = render(
    () => (
      <Modal
        isOpen={isOpen()}
        header={
          <ModalHeader>
            <ModalTitle>Title</ModalTitle>
            <ModalSubtitle>Sub</ModalSubtitle>
          </ModalHeader>
        }
        stickyFooter={<span class="footer">foot</span>}
        ariaLabel="fallback"
        onClose={onClose}
        onCloseAnimationEnd={onCloseAnimationEnd}
      >
        <p class="body">content</p>
        <ModalFooterActions>
          <button class="act">go</button>
        </ModalFooterActions>
      </Modal>
    ),
    el,
  );
  await flushMicrotasks();
  await frame();
  expect(document.querySelector('dialog')).toBeNull();

  setIsOpen(true);
  await flushMicrotasks();
  await frame();
  await frame();
  const dialog = document.querySelector('dialog') as HTMLDialogElement;
  expect(dialog).not.toBeNull();
  expect(dialog.hasAttribute('open')).toBe(true); // showModal ran on the connected element
  expect(dialog.querySelector('.body')!.textContent).toBe('content');
  expect(dialog.querySelector('.footer')!.textContent).toBe('foot');
  expect(document.body.classList.contains('has-open-dialog')).toBe(true);
  // the title registered itself, so the dialog is labelled by it and described by the subtitle
  const titleId = dialog.getAttribute('aria-labelledby')!;
  expect(document.getElementById(titleId)!.textContent).toBe('Title');
  expect(dialog.getAttribute('aria-label')).toBeNull();
  expect(dialog.getAttribute('aria-describedby')).not.toBeNull();

  // a click on the dialog itself (the backdrop) asks to close
  dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
  // Escape
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  expect(onClose.mock.calls.length).toBeGreaterThanOrEqual(1);

  setIsOpen(false);
  await flushMicrotasks();
  await frame();
  await frame();
  expect(document.querySelector('dialog')).not.toBeNull(); // closing
  expect(document.querySelector('dialog')!.classList.length).toBeGreaterThan(0);
  expect(document.body.classList.contains('has-open-dialog')).toBe(true);
  vi.advanceTimersByTime(400);
  await flushMicrotasks();
  await frame();
  await frame();
  expect(onCloseAnimationEnd).toHaveBeenCalledTimes(1);
  expect(document.querySelector('dialog')).toBeNull();
  expect(document.body.classList.contains('has-open-dialog')).toBe(false);

  // reopening creates a new dialog and shows it
  setIsOpen(true);
  await flushMicrotasks();
  await frame();
  await frame();
  const again = document.querySelector('dialog') as HTMLDialogElement;
  expect(again).not.toBeNull();
  expect(again.hasAttribute('open')).toBe(true);
  dispose();
});

it('RichEditorLinkModal / RemoveFormattingModal: the title created from the header prop finds the modal context', async () => {
  suppressStrict(() => {
    host().id = 'portals';
  });
  const el = suppressStrict(() => document.body.appendChild(document.createElement('div')));
  const onSubmit = vi.fn();
  const dispose = render(
    () => (
      <>
        <RichEditorLinkModal isOpen onClose={() => undefined} onSubmit={onSubmit} />
        <RemoveFormattingModal
          isOpen
          onClose={() => undefined}
          onCloseAnimationEnd={() => undefined}
          onRemoveFormatting={() => undefined}
          onSubscribeToPremium={() => undefined}
        />
      </>
    ),
    el,
  );
  await flushMicrotasks();
  await frame();
  await frame();
  const dialogs = Array.from(document.querySelectorAll('dialog'));
  expect(dialogs.length).toBe(2);
  for (const dialog of dialogs) {
    const titleId = dialog.getAttribute('aria-labelledby')!;
    expect(titleId).toMatch(/^modal-title-/);
    expect(document.getElementById(titleId)).not.toBeNull();
    expect(dialog.hasAttribute('open')).toBe(true);
  }
  dispose();
});
