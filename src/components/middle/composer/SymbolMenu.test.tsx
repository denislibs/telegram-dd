// Original test (not in telegram-tt): the symbol menu button and the menu on the frameact runtime (jsdom): open/close
// (the menu keeps its closing animation), the tabs, recent emoji sent when the menu closes, hover opening.
import { createSignal } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { addActionHandler, setGlobal } from '../../../global';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { flushMicrotasks } from '../../../lib/kit/testing/micro';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { ensureEmojiData } from '../../../util/emoji/emojiSearch';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';

import SymbolMenuButton from './SymbolMenuButton';

vi.mock('../../../api/gramjs', () => ({ callApi: vi.fn(() => Promise.resolve(undefined)) }));
// The async wrapper loads the `extra` bundle (all lazy components of tt); the test's bundle holds the menu only.
vi.mock('../../../bundles/extra', async () => ({ SymbolMenu: (await import('./SymbolMenu')).default }));

const harness = useDomHarness();
const violations: string[] = [];
const tabId = getCurrentTabId();
const recentEmojiCalls: unknown[] = [];
addActionHandler('addRecentEmoji', (global, actions, payload) => {
  recentEmojiCalls.push(payload);
});
// The handlers of tt (global/actions/api/symbols.ts) are not loaded
addActionHandler('loadEmojiSearchGroups', () => undefined);
addActionHandler('loadEmojiStickerGroups', () => undefined);

beforeAll(async () => {
  setGlobal(
    { ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: { ...cloneDeep(INITIAL_TAB_STATE), id: tabId } } },
    { forceOutdated: true },
  );
  await ensureEmojiData();
});

beforeEach(() => {
  violations.length = 0;
  recentEmojiCalls.length = 0;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        queueMicrotask(() =>
          this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as never),
        );
      }
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  delegateEvents(['click', 'input', 'mousedown', 'focusin']);
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}] ${error.stack ?? ''}`));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setHandler();
  disableStrict();
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

describe('SymbolMenuButton + SymbolMenu', () => {
  it('opens the menu, selects an emoji, keeps the closing animation and reports the recent emoji after closing', async () => {
    const root = suppressStrict(container);
    const portals = document.createElement('div');
    portals.id = 'portals';
    suppressStrict(() => document.body.append(portals));

    const [isOpen, setIsOpen] = createSignal(false);
    const selected: string[] = [];
    const dispose = render(
      () => (
        <SymbolMenuButton
          chatId="1"
          idPrefix="composer"
          isReady
          isMessageComposer
          canSendPlainText
          isSymbolMenuOpen={isOpen()}
          openSymbolMenu={() => setIsOpen(true)}
          closeSymbolMenu={() => setIsOpen(false)}
          onEmojiSelect={(emoji) => selected.push(emoji)}
          onCustomEmojiSelect={() => undefined}
          onRemoveSymbol={() => undefined}
        />
      ),
      root,
    );
    await settle();
    // Not opened yet: no menu, only the button
    expect(portals.querySelector('.SymbolMenu')).toBeNull();
    const button = root.querySelector<HTMLElement>('.symbol-menu-button')!;
    expect(button).toBeTruthy();

    // A click opens the menu
    // (Button activates on mousedown)
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    expect(isOpen()).toBe(true);
    await settle();
    await vi.dynamicImportSettled();
    await settle();
    await settle(500);
    await settle(500);
    const menu = root.querySelector('.SymbolMenu') ?? portals.querySelector('.SymbolMenu');
    expect(menu).toBeTruthy();
    expect(menu!.querySelector('.SymbolMenu-footer')).toBeTruthy();
    expect(menu!.querySelectorAll('.symbol-tab-button')).toHaveLength(3);
    expect(menu!.querySelector('.EmojiPicker-inner')).toBeTruthy();

    menu!
      .querySelector<HTMLElement>('.EmojiPicker .symbol-set .EmojiButton')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(selected).toHaveLength(1);
    // The emoji is remembered while the menu is open
    expect(recentEmojiCalls).toEqual([]);

    // Closing: the menu stays for its closing animation, the recent emoji is reported
    setIsOpen(false);
    await settle();
    expect(recentEmojiCalls).toHaveLength(1);
    expect(recentEmojiCalls[0]).toMatchObject({ emoji: expect.any(String) });
    await settle(1000);
    await settle(1000);

    dispose();
    expect(violations).toEqual([]);
  });

  it('opens on hover (desktop) and switches the tabs of the menu', async () => {
    const root = suppressStrict(container);
    const [isOpen, setIsOpen] = createSignal(false);
    const dispose = render(
      () => (
        <SymbolMenuButton
          chatId="1"
          idPrefix="composer"
          isReady
          isMessageComposer
          canSendPlainText
          isSymbolMenuOpen={isOpen()}
          openSymbolMenu={() => setIsOpen(true)}
          closeSymbolMenu={() => setIsOpen(false)}
          onEmojiSelect={() => undefined}
          onCustomEmojiSelect={() => undefined}
          onRemoveSymbol={() => undefined}
        />
      ),
      root,
    );
    await settle();

    // The first hover activates at once (it counters the delay of the lazy module)
    root.querySelector('.symbol-menu-button')!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    expect(isOpen()).toBe(true);
    await settle();
    await vi.dynamicImportSettled();
    await settle(500);
    await settle(500);

    const menu = root.querySelector('.SymbolMenu')!;
    expect(menu).toBeTruthy();
    expect(menu.querySelector('.symbol-delete-button')).toBeTruthy();
    const tabs = menu.querySelectorAll<HTMLElement>('.symbol-tab-button');
    tabs[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    await settle(500);
    await settle(1200);
    expect(menu.querySelectorAll('.symbol-tab-button')[1].classList.contains('activated')).toBe(true);
    expect(menu.querySelector('.symbol-delete-button')).toBeNull();
    expect(menu.querySelectorAll('.SymbolMenu-main > .Transition > .Transition_slide').length).toBe(2);

    dispose();
    expect(violations).toEqual([]);
  });
});
