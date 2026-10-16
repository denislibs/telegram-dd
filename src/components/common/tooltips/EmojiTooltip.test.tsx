// Original test (not in telegram-tt): the tooltip keeps showing its last items while it fades out (`useFrozenProps` in tt),
// follows the selected index, and hands a click to `onEmojiSelect`.
import { createSignal, flushSync } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { disableStrict, enableStrict, setHandler, suppressStrict } from 'frameact/stricterdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';

import EmojiTooltip from './EmojiTooltip';

vi.mock('../../middle/composer/CustomEmojiButton', () => ({ default: () => document.createElement('b') }));

const { frame } = useDomHarness();
const violations: string[] = [];

beforeEach(() => {
  violations.length = 0;
  enableStrict();
  setHandler((error) => violations.push(`${error.kind} ${error.detail} [${error.phase}]`));
});
afterEach(() => {
  setHandler();
  disableStrict();
  expect(violations).toEqual([]);
});

const emoji = (id: string, native: string) => ({ id, native, names: [id], image: id }) as unknown as Emoji;

describe('EmojiTooltip', () => {
  let dispose: (() => void) | undefined;
  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it('freezes its items while closed, follows the selection and reports a click', async () => {
    delegateEvents(['mousedown']);
    const [isOpen, setIsOpen] = createSignal(true);
    const [emojis, setEmojis] = createSignal([emoji('a', '😀'), emoji('b', '😁')]);
    const [selectedIndex, setSelectedIndex] = createSignal(0);
    const onEmojiSelect = vi.fn();

    const el = suppressStrict(container);
    dispose = render(
      () => (
        <EmojiTooltip
          isOpen={isOpen()}
          selectedIndex={selectedIndex()}
          emojis={emojis()}
          customEmojis={[]}
          onEmojiSelect={onEmojiSelect}
          onCustomEmojiSelect={() => undefined}
        />
      ),
      el,
    );
    await frame();
    await frame();

    const buttons = () => Array.from(el.querySelectorAll<HTMLElement>('.EmojiButton'));
    expect(buttons().map((button) => button.title)).toEqual([':a:', ':b:']);
    expect(buttons().map((button) => button.classList.contains('focus'))).toEqual([true, false]);

    setSelectedIndex(1);
    flushSync();
    await frame();
    expect(buttons().map((button) => button.classList.contains('focus'))).toEqual([false, true]);

    buttons()[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(onEmojiSelect).toHaveBeenCalledWith('😀');

    // Closing: the new (empty) items must not replace the ones that are fading out
    setIsOpen(false);
    setEmojis([]);
    flushSync();
    await frame();
    await frame();
    expect(buttons().map((button) => button.title)).toEqual([':a:', ':b:']);
  });
});
