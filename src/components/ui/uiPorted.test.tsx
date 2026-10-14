// Hand-finished ui components (Transition / Portal adapters, Button, InputText, Modal, Menu, DropdownMenu): render,
// react and stay stricterdom-clean under jsdom.
import { createSignal, flushSync } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { setGlobal } from '../../global';

import { container, useDomHarness } from '../../lib/kit/testing/dom';
import { flushMicrotasks } from '../../lib/kit/testing/micro';
import { INITIAL_GLOBAL_STATE } from '../../global/initialState';

import Button from './Button';
import DropdownMenu from './DropdownMenu';
import InputText from './InputText';
import Menu from './Menu';
import MenuItem from './MenuItem';
import Modal from './Modal';
import Portal from './Portal';
import Transition from './Transition';

beforeAll(() => {
  setGlobal(structuredClone(INITIAL_GLOBAL_STATE));
});

const { frame } = useDomHarness();
const violations: string[] = [];
const host = () => suppressStrict(container);
const portalsHost = () => {
  const el = host();
  suppressStrict(() => {
    el.id = 'portals';
  });
  return el;
};

beforeEach(() => {
  violations.length = 0;
  delegateEvents(['click', 'input', 'mousedown', 'keydown']);
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

const classes = (el: Element) => Array.from(el.classList).join(' ');

it('Transition: tt props map onto the kit (className, slideClassName, render function, class contract)', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const el = host();
  const [key, setKey] = createSignal(0);
  const dispose = render(
    () => (
      <Transition
        activeKey={key()}
        name="slide"
        className="my-transition"
        slideClassName="my-slide"
        id="tr"
        // `animationend` never fires in jsdom, so the end arrives through the fallback timer
        renderCount={2}
      >
        {(slide) => <b>{`${slide.key}:${slide.isActive() ? 'active' : 'idle'}`}</b>}
      </Transition>
    ),
    el,
  );
  const root = el.firstElementChild as HTMLDivElement;
  expect(root.id).toBe('tr');
  expect(root.classList.contains('Transition')).toBe(true);
  expect(root.classList.contains('my-transition')).toBe(true);
  const slides = () => Array.from(root.querySelectorAll<HTMLElement>('.Transition_slide'));
  expect(slides().map(classes)).toEqual(['Transition_slide my-slide Transition_slide-active']);
  expect(root.textContent).toBe('0:active');

  setKey(1);
  await frame();
  expect(classes(root)).toContain('Transition-slide');
  expect(slides().map((s) => s.textContent)).toEqual(['0:idle', '1:active']);
  expect(classes(slides()[0])).toContain('Transition_slide-from');
  expect(classes(slides()[1])).toContain('Transition_slide-to');
  dispose();
});

it('Transition: name "none" switches without animating', async () => {
  const el = host();
  const [key, setKey] = createSignal(0);
  const onStart = vi.fn();
  const dispose = render(
    () => (
      <Transition activeKey={key()} name="none" renderCount={2} onStart={onStart}>
        {(slide) => <i>{slide.key}</i>}
      </Transition>
    ),
    el,
  );
  setKey(1);
  await frame();
  const slides = Array.from(el.querySelectorAll<HTMLElement>('.Transition_slide'));
  expect(classes(slides[0])).toContain('Transition_slide-inactive');
  expect(classes(slides[1])).toContain('Transition_slide-active');
  expect(onStart).not.toHaveBeenCalled();
  dispose();
});

it('Portal: a wrapper div with the class in #portals, removed with the component', async () => {
  const portals = portalsHost();
  const el = host();
  const [on, setOn] = createSignal(true);
  const dispose = render(
    () => (
      <>
        {on() && (
          <Portal className="my-portal">
            <span class="inside">hi</span>
          </Portal>
        )}
      </>
    ),
    el,
  );
  await frame();
  const wrapper = portals.querySelector('.my-portal')!;
  expect(wrapper).not.toBeNull();
  expect(wrapper.querySelector('.inside')!.textContent).toBe('hi');
  setOn(false);
  await frame();
  expect(portals.querySelector('.my-portal')).toBeNull();
  dispose();
});

it('Button: classes, click, disabled, callback ref', () => {
  const el = host();
  const onClick = vi.fn();
  let ref: HTMLElement | undefined;
  const [disabled, setDisabled] = createSignal(false);
  const dispose = render(
    () => (
      <Button
        ref={(node) => {
          ref = node;
        }}
        className="extra"
        color="danger"
        round
        disabled={disabled()}
        onClick={onClick}
      >
        Go
      </Button>
    ),
    el,
  );
  const button = el.firstElementChild as HTMLButtonElement;
  expect(ref).toBe(button);
  expect(button.classList.contains('Button')).toBe(true);
  expect(button.classList.contains('extra')).toBe(true);
  expect(button.classList.contains('round')).toBe(true);
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(onClick).toHaveBeenCalledTimes(1);
  setDisabled(true);
  flushSync();
  expect(button.classList.contains('disabled')).toBe(true);
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(onClick).toHaveBeenCalledTimes(1);
  dispose();
});

it('InputText: one input event calls onChange and onInput once each; the value follows the prop', () => {
  const el = host();
  const [value, setValue] = createSignal('a');
  const onChange = vi.fn((e: Event) => setValue((e.target as HTMLInputElement).value));
  const onInput = vi.fn();
  const dispose = render(() => <InputText value={value()} label="Name" onChange={onChange} onInput={onInput} />, el);
  const input = el.querySelector('input')!;
  expect(input.value).toBe('a');
  expect(el.querySelector('label')!.textContent).toBe('Name');
  input.value = 'ab';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onInput).toHaveBeenCalledTimes(1);
  expect(input.value).toBe('ab');
  setValue('xyz');
  flushSync();
  expect(input.value).toBe('xyz');
  dispose();
});

it('Modal: renders into the portal while open, keeps the dialog for the close transition, then removes it', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  portalsHost();
  const el = host();
  const [isOpen, setIsOpen] = createSignal(false);
  const onClose = vi.fn();
  const dispose = render(
    () => (
      <Modal isOpen={isOpen()} title="Hello" hasCloseButton className="mine" onClose={onClose}>
        <p class="body">content</p>
      </Modal>
    ),
    el,
  );
  await flushMicrotasks();
  await frame();
  expect(document.querySelector('.Modal')).toBeNull();

  setIsOpen(true);
  await flushMicrotasks();
  await frame();
  await frame();
  const modal = document.querySelector('.Modal')!;
  expect(modal).not.toBeNull();
  expect(modal.classList.contains('mine')).toBe(true);
  expect(modal.querySelector('.modal-title')!.textContent).toBe('Hello');
  expect(modal.querySelector('.body')!.textContent).toBe('content');
  expect(document.body.classList.contains('has-open-dialog')).toBe(true);
  expect(modal.classList.contains('open')).toBe(true);
  // trapFocus is on the modal element (the effect found it after the portal content was created)
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(tab);
  expect(tab.defaultPrevented).toBe(true);

  (modal.querySelector('.modal-backdrop') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(onClose).toHaveBeenCalledTimes(1);

  setIsOpen(false);
  await flushMicrotasks();
  await frame();
  expect(document.querySelector('.Modal')).not.toBeNull(); // closing
  expect(document.querySelector('.Modal .modal-title')!.textContent).toBe('Hello'); // frozen title
  expect(document.body.classList.contains('has-open-dialog')).toBe(false);
  const tabAfter = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(tabAfter);
  expect(tabAfter.defaultPrevented).toBe(false);
  vi.advanceTimersByTime(400);
  await flushMicrotasks();
  await frame();
  expect(document.querySelector('.Modal')).toBeNull();
  dispose();
});

it('Menu: static position, items, autoClose closes on a click', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const el = host();
  const [isOpen, setIsOpen] = createSignal(true);
  const onClose = vi.fn(() => setIsOpen(false));
  const onItem = vi.fn();
  const dispose = render(
    () => (
      <Menu isOpen={isOpen()} autoClose positionX="right" onClose={onClose}>
        <MenuItem onClick={onItem} icon="add">
          Item
        </MenuItem>
      </Menu>
    ),
    el,
  );
  await flushMicrotasks();
  await frame();
  await frame();
  await frame();
  const menu = el.querySelector('.Menu')!;
  expect(menu).not.toBeNull();
  expect(menu.querySelector('.bubble')!.classList.contains('open')).toBe(true);
  const item = menu.querySelector('.MenuItem') as HTMLElement;
  expect(item.textContent).toContain('Item');
  item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(onItem).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
  flushSync();
  expect(menu.querySelector('.bubble')!.classList.contains('open')).toBe(false);
  dispose();
});

it('DropdownMenu: the default trigger opens the menu; a custom trigger is a component of reactive props', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const el = host();
  const dispose = render(
    () => (
      <DropdownMenu
        trigger={(props) => (
          <button type="button" class="custom-trigger" onClick={props.onTrigger}>
            {props.isOpen ? 'open' : 'closed'}
          </button>
        )}
      >
        <MenuItem>One</MenuItem>
      </DropdownMenu>
    ),
    el,
  );
  await flushMicrotasks();
  await frame();
  const trigger = el.querySelector('.custom-trigger') as HTMLButtonElement;
  expect(trigger.textContent).toBe('closed');
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  flushSync();
  // the trigger element survives the state change (no re-creation)
  expect(el.querySelector('.custom-trigger')).toBe(trigger);
  expect(trigger.textContent).toBe('open');
  await frame();
  expect(el.querySelector('.Menu .bubble')!.classList.contains('open')).toBe(true);
  dispose();
});

it('DropdownMenu: onOpen fires when the trigger opens the menu, onClose when it closes it (tt reads the value before the toggle)', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const el = host();
  const calls: string[] = [];
  const dispose = render(
    () => (
      <DropdownMenu
        onOpen={() => calls.push('open')}
        onClose={() => calls.push('close')}
        trigger={(props) => (
          <button type="button" class="custom-trigger" onClick={props.onTrigger}>
            t
          </button>
        )}
      >
        <MenuItem>One</MenuItem>
      </DropdownMenu>
    ),
    el,
  );
  await flushMicrotasks();
  await frame();
  const trigger = el.querySelector('.custom-trigger') as HTMLButtonElement;
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  flushSync();
  expect(calls).toEqual(['open']);
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  flushSync();
  expect(calls).toEqual(['open', 'close']);
  dispose();
});

it('DropdownMenu withPortal: the dynamic position options reach the menu (anchor + element getters)', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const portals = portalsHost();
  const el = host();
  const dispose = render(
    () => (
      <DropdownMenu withPortal>
        <MenuItem>One</MenuItem>
      </DropdownMenu>
    ),
    el,
  );
  await flushMicrotasks();
  await frame();
  // outside touch environments a Button reacts to mousedown (tt's fast click)
  (el.querySelector('.Button') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  flushSync();
  await flushMicrotasks();
  await frame();
  await frame();
  await frame();
  const menu = portals.querySelector('.Menu.in-portal')!;
  expect(menu).not.toBeNull();
  expect(menu.querySelector('.bubble')!.classList.contains('open')).toBe(true);
  dispose();
});
