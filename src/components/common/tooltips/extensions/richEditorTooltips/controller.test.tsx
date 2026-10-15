// Original test (not in telegram-tt): the tooltips controller drives `RichEditorTooltipContainer` through a signal written
// from outside any component (the ProseMirror plugins). The real controller and container run over stubbed tooltips.
import type { Editor } from '@tiptap/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setGlobal } from '../../../../../global';

import type { RichEditorTooltipsConfig, RichEditorTooltipSuggestion } from '../../types';

import { useDomHarness } from '../../../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../../../global/initialState';
import { getCurrentTabId } from '../../../../../util/establishMultitabRole';
import { cloneDeep } from '../../../../../util/iteratees';
import { RichEditorTooltipsController } from './controller';

type StubProps = { isOpen: boolean; selectedIndex: number; filteredUsers?: { id: string }[]; emojis?: Emoji[] };

// A stub tooltip: one element whose text is computed from the (live getter) props.
const makeStub = vi.hoisted(() => async (getText: (props: StubProps) => string) => {
  const { createMutationEffect } = await import('frameact');
  return {
    default: (props: StubProps) => {
      const el = document.createElement('i');
      createMutationEffect(
        () => getText(props),
        (text) => {
          el.textContent = text;
        },
      );
      return el;
    },
  };
});

vi.mock('../../MentionTooltip.async', () =>
  makeStub(
    (props) =>
      `${props.isOpen ? 'open' : 'closed'}|${props.selectedIndex}|${props.filteredUsers?.map((user) => user.id).join(',')}`,
  ),
);
vi.mock('../../EmojiTooltip.async', () => makeStub((props) => `emoji|${props.emojis?.length}`));
vi.mock('../../CustomEmojiTooltip.async', () => ({ default: () => undefined }));
vi.mock('../../ChatCommandTooltip.async', () => ({ default: () => undefined }));
vi.mock('../../InlineBotTooltip.async', () => ({ default: () => undefined }));
vi.mock('../../StickerTooltip.async', () => ({ default: () => undefined }));
vi.mock('../../../../ui/textInput/TextFormatter', () => ({ default: () => undefined }));

const { frame } = useDomHarness();

const tabId = getCurrentTabId();
let boundary: HTMLElement;
let controller: RichEditorTooltipsController | undefined;

function createEditor() {
  const dom = document.createElement('div');
  boundary = document.createElement('div');
  boundary.appendChild(dom);
  document.body.appendChild(boundary);
  return { isDestroyed: false, view: { dom }, state: {} } as unknown as Editor;
}

function createSuggestion(items: unknown[], command = vi.fn()) {
  return {
    items,
    command,
    text: '@a',
    query: 'a',
    range: { from: 0, to: 2 },
  } as unknown as RichEditorTooltipSuggestion;
}

const config: RichEditorTooltipsConfig = {
  mention: { isEnabled: () => true },
  emoji: {
    isEnabled: () => true,
    addRecentEmoji: vi.fn(),
    addRecentCustomEmoji: vi.fn(),
  },
  getContext: () => ({ chatId: '1' }),
};

const hostText = () => boundary.querySelector('.rich-editor-tooltips-host')?.textContent;

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  setGlobal(
    { ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: { ...cloneDeep(INITIAL_TAB_STATE), id: tabId } } },
    { forceOutdated: true },
  );
});

beforeEach(() => {
  controller = new RichEditorTooltipsController(createEditor(), config);
});

afterEach(() => {
  controller?.destroy();
  controller = undefined;
});

describe('RichEditorTooltipsController', () => {
  it('renders nothing until a suggestion arrives, then the mention tooltip with the first item selected', async () => {
    await frame();
    expect(hostText()).toBe('');

    controller!.updateSuggestion('mention', createSuggestion([{ id: 'a' }, { id: 'b' }]));
    await frame();
    await frame();

    expect(hostText()).toBe('open|0|a,b');
    expect(boundary.querySelector('.rich-editor-tooltips-host')!.classList.contains('is-suggestion')).toBe(true);
  });

  it('arrow keys cycle the selected index, Enter selects the item', async () => {
    const command = vi.fn();
    controller!.updateSuggestion('mention', createSuggestion([{ id: 'a' }, { id: 'b' }], command));
    await frame();

    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    expect(controller!.handleSuggestionKeyDown('mention', down)).toBe(true);
    expect(down.defaultPrevented).toBe(true);
    await frame();
    await frame();
    expect(hostText()).toBe('open|1|a,b');

    // Wraps around, ArrowUp goes back
    const press = (key: string) =>
      controller!.handleSuggestionKeyDown('mention', new KeyboardEvent('keydown', { key, cancelable: true }));
    press('ArrowDown');
    await frame();
    await frame();
    expect(hostText()).toBe('open|0|a,b');
    press('ArrowUp');
    await frame();
    await frame();
    expect(hostText()).toBe('open|1|a,b');

    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    expect(controller!.handleSuggestionKeyDown('mention', enter)).toBe(true);
    await frame();
    expect(command).toHaveBeenCalledWith({ id: 'b' });
  });

  it('closing keeps the last items rendered with isOpen=false for the fade, then removes the tooltip', async () => {
    controller!.updateSuggestion('mention', createSuggestion([{ id: 'a' }]));
    await frame();
    await frame();
    expect(hostText()).toBe('open|0|a');

    controller!.removeSuggestion('mention');
    await frame();
    await frame();
    expect(hostText()).toBe('closed|0|a');
    expect(controller!.hasActiveTooltip()).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 200));
    await frame();
    await frame();
    expect(hostText()).toBe('');
  });

  it('splits the emoji suggestion into native emojis and custom emojis', async () => {
    const native = { id: 'smile', native: '🙂', names: ['smile'], image: 'x' } as unknown as Emoji;
    controller!.updateSuggestion('emoji', createSuggestion([native, { id: '5' }]));
    await frame();
    await frame();
    expect(hostText()).toBe('emoji|1');
  });
});
