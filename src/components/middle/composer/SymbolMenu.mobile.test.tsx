// Original test (not in telegram-tt): the mobile layout of the symbol menu (a portal with the show transition classes, the
// body classes that drive the keyboard-like transforms, the close button) on the frameact runtime (jsdom).
import { createSignal } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { addActionHandler, setGlobal } from '../../../global';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { flushMicrotasks } from '../../../lib/kit/testing/micro';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';

import SymbolMenu from './SymbolMenu';

vi.mock('../../../api/gramjs', () => ({ callApi: vi.fn(() => Promise.resolve(undefined)) }));
vi.mock('../../../hooks/useAppLayout', () => ({
  default: () => ({
    isMobile: () => true,
    isTablet: () => false,
    isLandscape: () => false,
    isDesktop: () => false,
    isTouchScreen: () => true,
  }),
}));
// The emoji picker is not the subject here
vi.mock('./EmojiPicker', () => ({ default: () => undefined }));

const harness = useDomHarness();
const violations: string[] = [];
const tabId = getCurrentTabId();
addActionHandler('loadEmojiSearchGroups', () => undefined);
addActionHandler('loadEmojiStickerGroups', () => undefined);

beforeAll(() => {
  setGlobal(
    { ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: { ...cloneDeep(INITIAL_TAB_STATE), id: tabId } } },
    { forceOutdated: true },
  );
});

beforeEach(() => {
  violations.length = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  delegateEvents(['click', 'mousedown']);
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}] ${error.stack ?? ''}`));
});

afterEach(() => {
  vi.useRealTimers();
  setHandler();
  disableStrict();
  document.body.classList.remove('enable-symbol-menu-transforms', 'is-symbol-menu-open');
});

async function settle(ms = 0) {
  for (let i = 0; i < 3; i++) {
    await harness.frame();
  }
  vi.advanceTimersByTime(ms);
  await flushMicrotasks();
  for (let i = 0; i < 3; i++) {
    await harness.frame();
  }
}

it('renders in the portal with the transition classes, drives the body classes and closes through the close button', async () => {
  const root = suppressStrict(container);
  const portals = document.createElement('div');
  portals.id = 'portals';
  suppressStrict(() => document.body.append(portals));

  const [isOpen, setIsOpen] = createSignal(false);
  const onLoad = vi.fn();
  const onClose = vi.fn(() => setIsOpen(false));
  const dispose = render(
    () => (
      <SymbolMenu
        chatId="1"
        idPrefix="composer"
        isOpen={isOpen()}
        isMessageComposer
        canSendPlainText
        onLoad={onLoad}
        onClose={onClose}
        onEmojiSelect={() => undefined}
        onCustomEmojiSelect={() => undefined}
        onRemoveSymbol={() => undefined}
        addRecentEmoji={() => undefined}
        addRecentCustomEmoji={() => undefined}
      />
    ),
    root,
  );
  await settle();
  expect(onLoad).toHaveBeenCalledTimes(1);
  expect(portals.querySelector('.SymbolMenu')).toBeNull();

  setIsOpen(true);
  await settle();
  await settle(100);
  const menu = portals.querySelector<HTMLElement>('.SymbolMenu.mobile-menu')!;
  expect(menu).toBeTruthy();
  expect(menu.classList.contains('in-middle-column')).toBe(true);
  expect(menu.classList.contains('shown')).toBe(true);
  expect(menu.classList.contains('open')).toBe(true);
  expect(document.body.classList.contains('is-symbol-menu-open')).toBe(true);
  expect(document.body.classList.contains('enable-symbol-menu-transforms')).toBe(true);
  expect(menu.querySelector('.symbol-close-button')).toBeTruthy();
  expect(menu.querySelector('.SymbolMenu-footer')).toBeTruthy();

  // The close button asks the owner to close; the menu stays for its closing transition
  menu
    .querySelector<HTMLElement>('.symbol-close-button')!
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  expect(onClose).toHaveBeenCalled();
  await settle();
  expect(document.body.classList.contains('is-symbol-menu-open')).toBe(false);
  expect(portals.querySelector('.SymbolMenu')).toBeTruthy();
  expect(portals.querySelector('.SymbolMenu')!.classList.contains('closing')).toBe(true);
  await settle(400);
  expect(portals.querySelector('.SymbolMenu')).toBeNull();
  expect(document.body.classList.contains('enable-symbol-menu-transforms')).toBe(false);

  dispose();
  expect(violations).toEqual([]);
});
