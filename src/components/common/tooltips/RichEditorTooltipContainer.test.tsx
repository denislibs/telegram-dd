// Original test (not in telegram-tt): tt's container returned early from its render function; here the same checks pick
// one branch of a `<Switch>` while the props change in place (the controller writes them from outside any component).
import type { Editor } from '@tiptap/core';
import { flushSync } from 'frameact';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { setGlobal } from '../../../global';

import type { OwnProps } from './RichEditorTooltipContainer';

import { useDomHarness } from '../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';
import TeactRenderer from '../../../util/tiptap/TeactRenderer';

import RichEditorTooltipContainer from './RichEditorTooltipContainer';

type StubProps = { isOpen?: boolean; filteredUsers?: { id: string }[]; range?: { from: number; to: number } };

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

vi.mock('./MentionTooltip.async', () =>
  makeStub((props) => `mention:${props.filteredUsers?.map((user) => user.id).join(',')}`),
);
vi.mock('./EmojiTooltip.async', () => makeStub(() => 'emoji'));
vi.mock('./ChatCommandTooltip.async', () => makeStub(() => 'command'));
vi.mock('./CustomEmojiTooltip.async', () => ({ default: () => undefined }));
vi.mock('./InlineBotTooltip.async', () => ({ default: () => undefined }));
vi.mock('./StickerTooltip.async', () => ({ default: () => undefined }));
vi.mock('../../ui/textInput/TextFormatter', () =>
  makeStub((props) => `formatter:${props.range?.from}-${props.range?.to}`),
);

const { frame } = useDomHarness();
const tabId = getCurrentTabId();

const suggestion = (items: unknown[]) => ({ items, command: vi.fn(), text: '@a' }) as unknown as OwnProps['suggestion'];

function baseProps(overrides: Partial<OwnProps> = {}): OwnProps {
  return {
    editor: { isDestroyed: false } as unknown as Editor,
    // The renderer fixes the key set by the first props object, as the controller's `buildRendererProps` does
    surface: undefined,
    suggestion: undefined,
    customEmojiSuggestion: undefined,
    stickerSuggestion: undefined,
    formatter: undefined,
    isOpen: true,
    isCustomEmojiOpen: false,
    isStickerOpen: false,
    isFormatterOpen: false,
    selectedIndex: 0,
    config: { mention: { isEnabled: () => true }, getContext: () => ({ chatId: '1' }) },
    context: { chatId: '1' },
    onCloseFormatter: () => undefined,
    onFormatterDismissalChange: () => undefined,
    ...overrides,
  };
}

describe('RichEditorTooltipContainer', () => {
  beforeAll(() => {
    setGlobal(
      { ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: { ...cloneDeep(INITIAL_TAB_STATE), id: tabId } } },
      { forceOutdated: true },
    );
  });

  async function update(renderer: TeactRenderer<OwnProps>, props: OwnProps) {
    renderer.updateProps(props);
    flushSync();
    await frame();
    await frame();
  }

  it('picks the branch of the current props: nothing, mention, formatter (it wins), nothing', async () => {
    const renderer = new TeactRenderer<OwnProps>(RichEditorTooltipContainer, { props: baseProps() });
    document.body.appendChild(renderer.element);
    await frame();
    expect(renderer.element.textContent).toBe('');

    await update(renderer, baseProps({ surface: 'mention', suggestion: suggestion([{ id: 'a' }, { id: 'b' }]) }));
    expect(renderer.element.textContent).toBe('mention:a,b');

    await update(renderer, baseProps({ surface: 'mention', suggestion: suggestion([{ id: 'c' }]) }));
    expect(renderer.element.textContent).toBe('mention:c');

    await update(
      renderer,
      baseProps({
        surface: 'mention',
        suggestion: suggestion([{ id: 'c' }]),
        formatter: { range: { from: 2, to: 5 }, capabilities: 'full' },
      }),
    );
    expect(renderer.element.textContent).toBe('formatter:2-5');

    await update(renderer, baseProps({ formatter: { range: { from: 3, to: 6 }, capabilities: 'full' } }));
    expect(renderer.element.textContent).toBe('formatter:3-6');

    await update(renderer, baseProps());
    expect(renderer.element.textContent).toBe('');

    renderer.destroy();
  });

  it('renders nothing for an emoji surface without the emoji config and for a command surface without the current user', async () => {
    const renderer = new TeactRenderer<OwnProps>(RichEditorTooltipContainer, { props: baseProps() });
    document.body.appendChild(renderer.element);

    await update(renderer, baseProps({ surface: 'emoji', suggestion: suggestion([]) }));
    expect(renderer.element.textContent).toBe('');

    await update(
      renderer,
      baseProps({
        surface: 'emoji',
        suggestion: suggestion([]),
        config: { emoji: { isEnabled: () => true } as never, getContext: () => ({ chatId: '1' }) },
      }),
    );
    expect(renderer.element.textContent).toBe('emoji');

    await update(renderer, baseProps({ surface: 'command', suggestion: suggestion([]) }));
    expect(renderer.element.textContent).toBe('');

    await update(
      renderer,
      baseProps({
        surface: 'command',
        suggestion: suggestion([]),
        context: { chatId: '1', currentUser: { id: '9' } as never },
      }),
    );
    expect(renderer.element.textContent).toBe('command');

    renderer.destroy();
  });
});
