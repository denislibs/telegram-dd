// Original test (not in telegram-tt): the reactions of a message are shown with their counts and chosen state, and a click
// runs the action of tt (`toggleReaction`, `addLocalPaidReaction`, the saved tag filter) with the right payload.
import { createSignal } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setGlobal } from '../../../../global';

import type { ApiMessage, ApiReactionCount } from '../../../../api/types';
import type { TabState } from '../../../../global/types';

import { container, useDomHarness } from '../../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../../global/initialState';
import { getCurrentTabId } from '../../../../util/establishMultitabRole';
import { cloneDeep } from '../../../../util/iteratees';

import Reactions from './Reactions';

const actions = vi.hoisted(() => {
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};
  const proxy = new Proxy(calls, {
    get(target, name: string) {
      return (target[name] ??= vi.fn());
    },
  });
  return { calls, proxy };
});

vi.mock('../../../../global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../global')>()),
  getActions: () => actions.proxy,
}));

const tabId = getCurrentTabId();

const THUMBS_UP = { type: 'emoji', emoticon: '👍' } as const;
const HEART = { type: 'emoji', emoticon: '❤' } as const;

function buildMessage(results: ApiReactionCount[], extra?: Partial<ApiMessage['reactions']>): ApiMessage {
  return {
    id: 9,
    chatId: '100',
    date: 1,
    isOutgoing: false,
    content: {},
    reactions: { results, ...extra },
  };
}

function buttonCounters(el: HTMLElement) {
  return Array.from(el.querySelectorAll('.message-reaction')).map((button) => ({
    text: button.textContent,
    chosen: button.classList.contains('chosen'),
  }));
}

function press(el: Element) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
}

describe('Reactions', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;

  beforeAll(() => {
    const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
    setGlobal({ ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: tab } }, { forceOutdated: true });
  });

  beforeEach(() => {
    delegateEvents(['click', 'mousedown', 'mouseup', 'contextmenu']);
    Object.values(actions.calls).forEach((fn) => fn.mockClear());
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  async function mount(message: () => ApiMessage, props: Partial<Parameters<typeof Reactions>[0]> = {}) {
    const el = container();
    dispose = render(() => <Reactions message={message()} {...props} />, el);
    await harness.frame();
    await harness.frame();
    return el;
  }

  it('renders a button per reaction with its count and the chosen state', async () => {
    const message = buildMessage([
      { reaction: THUMBS_UP, count: 2, chosenOrder: 0 },
      { reaction: HEART, count: 15 },
    ]);
    const el = await mount(() => message);

    expect(el.querySelector('.Reactions')).not.toBeNull();
    expect(buttonCounters(el)).toEqual([
      { text: '2', chosen: true },
      { text: '15', chosen: false },
    ]);
  });

  it('marks the reactions of a message that can be reacted to as service reactions', async () => {
    const message = { ...buildMessage([{ reaction: HEART, count: 1 }]), areReactionsPossible: true as const };
    const el = await mount(() => message);

    expect(el.querySelector('.Reactions')!.classList.contains('is-service')).toBe(true);
    expect(el.querySelector('.Reactions')!.classList.contains('is-outside')).toBe(false);
  });

  it('toggles the clicked reaction with the chat, the message and the reaction', async () => {
    const message = buildMessage([
      { reaction: THUMBS_UP, count: 2, chosenOrder: 0 },
      { reaction: HEART, count: 1 },
    ]);
    const el = await mount(() => message);

    const buttons = el.querySelectorAll('.message-reaction');
    press(buttons[1]);
    expect(actions.calls.toggleReaction).toHaveBeenCalledTimes(1);
    expect(actions.calls.toggleReaction).toHaveBeenLastCalledWith({ chatId: '100', messageId: 9, reaction: HEART });

    // A chosen reaction is toggled off by the same action
    press(buttons[0]);
    expect(actions.calls.toggleReaction).toHaveBeenCalledTimes(2);
    expect(actions.calls.toggleReaction).toHaveBeenLastCalledWith({ chatId: '100', messageId: 9, reaction: THUMBS_UP });
  });

  it('opens the frozen account modal instead of reacting', async () => {
    const message = buildMessage([{ reaction: HEART, count: 1 }]);
    const el = await mount(() => message, { isAccountFrozen: true });

    press(el.querySelector('.message-reaction')!);
    expect(actions.calls.toggleReaction).not.toHaveBeenCalled();
    expect(actions.calls.openFrozenAccountModal).toHaveBeenCalledTimes(1);
  });

  it('sends a paid reaction as a local star count', async () => {
    const message = buildMessage([{ reaction: { type: 'paid' }, count: 4 }]);
    const el = await mount(() => message);

    press(el.querySelector('.message-reaction')!);
    expect(actions.calls.addLocalPaidReaction).toHaveBeenCalledWith({ chatId: '100', messageId: 9, count: 1 });
    expect(actions.calls.toggleReaction).not.toHaveBeenCalled();
  });

  it('asks a user without premium to get it before filtering by a saved tag', async () => {
    const message = buildMessage([{ reaction: HEART, count: 1 }], { areTags: true });
    const el = await mount(() => message, { tags: {}, isCurrentUserPremium: false });

    press(el.querySelector('.message-reaction')!);
    expect(actions.calls.openPremiumModal).toHaveBeenCalledWith({ initialSection: 'saved_tags' });
    expect(actions.calls.toggleReaction).not.toHaveBeenCalled();
  });

  it('filters the search by a saved tag for a premium user', async () => {
    const message = buildMessage([{ reaction: HEART, count: 1 }], { areTags: true });
    const el = await mount(() => message, { tags: {}, isCurrentUserPremium: true, threadId: 5 });

    press(el.querySelector('.message-reaction')!);
    expect(actions.calls.updateMiddleSearch).toHaveBeenCalledWith({
      chatId: '100',
      threadId: 5,
      update: { savedTag: HEART },
    });
    expect(actions.calls.performMiddleSearch).toHaveBeenCalledWith({ chatId: '100', threadId: 5 });
    expect(actions.calls.toggleReaction).not.toHaveBeenCalled();
  });

  it('follows the counts of the same message and adds a button for a new reaction', async () => {
    const [message, setMessage] = createSignal(buildMessage([{ reaction: HEART, count: 1 }]));
    const el = await mount(message);
    expect(buttonCounters(el).map((b) => b.text)).toEqual(['1']);
    const firstButton = el.querySelector('.message-reaction');

    setMessage(
      buildMessage([
        { reaction: HEART, count: 2 },
        { reaction: THUMBS_UP, count: 7 },
      ]),
    );
    await harness.frame();
    await harness.frame();

    // The counter animates the change of a digit (it renders both digits while it runs): only the new count is checked
    const counters = buttonCounters(el).map((b) => b.text);
    expect(counters).toHaveLength(2);
    expect(counters[0]).toContain('2');
    expect(counters[1]).toBe('7');
    // The row of an existing reaction is kept (keyed by the reaction)
    expect(el.querySelector('.message-reaction')).toBe(firstButton);
  });

  it('puts the reactions of a message as children after the meta of the parent', async () => {
    const message = buildMessage([{ reaction: HEART, count: 1 }]);
    const el = await mount(() => message, { metaChildren: <span class="meta-child" /> });

    const reactions = el.querySelector('.Reactions')!;
    expect(reactions.lastElementChild!.classList.contains('meta-child')).toBe(true);
  });

  it('resets the local paid reactions when it is removed', async () => {
    const message = buildMessage([{ reaction: HEART, count: 1 }]);
    await mount(() => message);

    dispose?.();
    dispose = undefined;
    expect(actions.calls.resetLocalPaidReactions).toHaveBeenCalledWith({ chatId: '100', messageId: 9 });
  });
});
