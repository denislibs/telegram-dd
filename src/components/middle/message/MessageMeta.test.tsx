// Original test (not in telegram-tt): the time, status and counters of a message.
import { createSignal } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setGlobal } from '../../../global';

import type { ApiMessage, ApiMessageOutgoingStatus } from '../../../api/types';
import type { TabState } from '../../../global/types';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';

import MessageMeta from './MessageMeta';

const tabId = getCurrentTabId();
const noop = () => {};

function buildMessage(extra?: Partial<ApiMessage>): ApiMessage {
  return { id: 1, chatId: '100', date: 1_700_000_000, isOutgoing: true, content: {}, ...extra };
}

describe('MessageMeta', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;

  beforeAll(() => {
    const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
    setGlobal({ ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: tab } }, { forceOutdated: true });
  });

  // The harness clears the delegated events after each test.
  beforeEach(() => {
    delegateEvents(['click', 'mouseover']);
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  async function mount(message: ApiMessage, props: Partial<Parameters<typeof MessageMeta>[0]> = {}) {
    const el = container();
    dispose = render(
      () => (
        <MessageMeta
          message={message}
          isMessagePrimaryEditedDateEnabled={false}
          onClick={noop}
          onTranslationClick={noop}
          onEffectClick={noop}
          onOpenThread={noop}
          {...props}
        />
      ),
      el,
    );
    await harness.frame();
    await harness.frame();
    return el;
  }

  it('shows the time of the message and nothing else for a plain message', async () => {
    const el = await mount(buildMessage());

    const root = el.querySelector<HTMLElement>('.MessageMeta')!;
    expect(root).not.toBeNull();
    expect(el.querySelector('.message-time')!.textContent.trim()).toMatch(/^\d{1,2}:\d{2}/);
    expect(el.querySelector('.message-views')).toBeNull();
    expect(el.querySelector('.message-replies')).toBeNull();
    expect(el.querySelector('.message-pinned')).toBeNull();
    expect(el.querySelector('.MessageOutgoingStatus')).toBeNull();
    expect(root.classList.contains('reactions-offset')).toBe(false);
  });

  it('marks an edited message with the edited label before the time', async () => {
    const el = await mount(buildMessage({ isEdited: true, editDate: 1_700_000_100 }));

    const text = el.querySelector('.message-time')!.textContent;
    expect(text).toContain('MessageMetaEdited');
    expect(text.indexOf('MessageMetaEdited')).toBeLessThan(text.search(/\d{1,2}:\d{2}/));
  });

  it('shows the edit date instead of the label when the primary edited date is enabled', async () => {
    const el = await mount(buildMessage({ isEdited: true, editDate: 1_700_000_100 }), {
      isMessagePrimaryEditedDateEnabled: true,
    });

    const text = el.querySelector('.message-time')!.textContent;
    expect(text).toContain('MessageMetaEditedAtTime');
  });

  it('shows the views count with the eye icon', async () => {
    const el = await mount(buildMessage({ viewsCount: 1234 }));

    expect(el.querySelector('.message-views')!.textContent).toBe('1.2K');
    expect(el.querySelector('.icon-eye')).not.toBeNull();
  });

  it('gives the views and the forwards count in the tooltip once the time is hovered', async () => {
    const el = await mount(buildMessage({ viewsCount: 5, forwardsCount: 3 }));
    const views = el.querySelector<HTMLElement>('.message-views')!;
    expect(views.getAttribute('title')).toBe('MessageTooltipViews\nMessageTooltipForwards');

    const withoutForwards = await mount(buildMessage({ viewsCount: 5 }));
    expect(withoutForwards.querySelector('.message-views')!.getAttribute('title')).toBe('MessageTooltipViews');
  });

  it('shows the date and the forward date in the title of the time after the pointer entered it', async () => {
    const el = await mount(buildMessage({ forwardInfo: { date: 1_600_000_000 } as ApiMessage['forwardInfo'] }));
    const time = el.querySelector<HTMLElement>('.message-time')!;
    expect(time.getAttribute('title')).toBeNull();

    time.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    time.dispatchEvent(new MouseEvent('mouseenter'));
    await harness.frame();

    expect(time.getAttribute('title')).toContain('MessageTooltipForwardedDate');
  });

  it('shows the replies counter and opens the thread on a click without reaching the message', async () => {
    const calls: string[] = [];
    const el = await mount(buildMessage(), {
      repliesThreadInfo: { messagesCount: 12 } as never,
      onOpenThread: () => calls.push('thread'),
      onClick: () => calls.push('meta'),
    });

    expect(el.querySelector('.message-replies')!.textContent).toBe('12');
    el.querySelector<HTMLElement>('.message-replies-wrapper')!.click();
    expect(calls).toEqual(['thread']);
  });

  it('hides the replies counter when replies are not wanted', async () => {
    const el = await mount(buildMessage(), { repliesThreadInfo: { messagesCount: 12 } as never, noReplies: true });

    expect(el.querySelector('.message-replies')).toBeNull();
  });

  it('shows the pin, the signature and the reactions offset class', async () => {
    const el = await mount(buildMessage(), { isPinned: true, signature: 'Author', withReactionOffset: true });

    expect(el.querySelector('.message-pinned')).not.toBeNull();
    expect(el.querySelector('.message-signature')!.textContent).toBe('Author');
    expect(el.querySelector('.MessageMeta')!.classList.contains('reactions-offset')).toBe(true);
  });

  it.each<ApiMessageOutgoingStatus>(['pending', 'succeeded', 'read', 'failed'])(
    'shows the %s outgoing status',
    async (status) => {
      const el = await mount(buildMessage(), { outgoingStatus: status });

      expect(el.querySelector('.MessageOutgoingStatus')).not.toBeNull();
      const expectedIcon =
        status === 'failed' ? 'icon-message-failed' : status === 'succeeded' ? 'icon-check' : `icon-message-${status}`;
      expect(el.querySelector(`.MessageOutgoingStatus .${expectedIcon}`)).not.toBeNull();
    },
  );

  it('follows a change of the status and of the views of the same message', async () => {
    const [status, setStatus] = createSignal<ApiMessageOutgoingStatus>('pending');
    const el = container();
    dispose = render(
      () => (
        <MessageMeta
          message={buildMessage({ viewsCount: 10 })}
          outgoingStatus={status()}
          isMessagePrimaryEditedDateEnabled={false}
          onClick={noop}
          onTranslationClick={noop}
          onEffectClick={noop}
          onOpenThread={noop}
        />
      ),
      el,
    );
    await harness.frame();
    expect(el.querySelector('.MessageOutgoingStatus .icon-message-pending')).not.toBeNull();

    setStatus('read');
    await harness.frame();
    await harness.frame();
    expect(el.querySelector('.MessageOutgoingStatus .icon-message-read')).not.toBeNull();
  });

  it('renders the quick reaction button the parent gives', async () => {
    const el = await mount(buildMessage(), {
      renderQuickReactionButton: () => <button class="quick-reaction-test" />,
    });

    expect(el.querySelector('.MessageMeta .quick-reaction-test')).not.toBeNull();
  });

  it('shows the translated and the effect marks and calls their handlers', async () => {
    const calls: string[] = [];
    const el = await mount(buildMessage(), {
      isTranslated: true,
      effectEmoji: '🔥',
      onTranslationClick: () => calls.push('translation'),
      onEffectClick: () => calls.push('effect'),
      onClick: () => calls.push('meta'),
    });

    el.querySelector<HTMLElement>('.message-translated')!.click();
    el.querySelector<HTMLElement>('.message-effect-icon')!.click();
    expect(calls.filter((call) => call !== 'meta')).toEqual(['translation', 'effect']);
  });
});
