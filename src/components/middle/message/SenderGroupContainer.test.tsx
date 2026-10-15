// Original test (not in telegram-tt): the avatar of a sender group is rendered only when the list asks for it, appears after
// its appearance delay, and the group keeps the message elements it wraps.
import { delegateEvents, render } from 'frameact/dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setGlobal } from '../../../global';

import type { ApiMessage, ApiUser } from '../../../api/types';
import type { GlobalState, TabState } from '../../../global/types';

import { MESSAGE_APPEARANCE_DELAY } from '../../../config';
import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';

import SenderGroupContainer from './SenderGroupContainer';

const actions = vi.hoisted(() => {
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};
  const proxy = new Proxy(calls, {
    get(target, name: string) {
      return (target[name] ??= vi.fn());
    },
  });
  return { calls, proxy };
});

vi.mock('../../../global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../global')>()),
  getActions: () => actions.proxy,
}));

const tabId = getCurrentTabId();

const USER = {
  id: '200',
  isMin: false,
  type: 'userTypeRegular',
  firstName: 'Grace',
  phoneNumber: '',
} as unknown as ApiUser;

const MESSAGE: ApiMessage = {
  id: 3,
  chatId: '500',
  senderId: '200',
  date: 1,
  isOutgoing: false,
  content: { text: { text: 'hi' } },
};

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

describe('SenderGroupContainer', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;

  beforeAll(() => {
    const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
    const global: GlobalState = {
      ...cloneDeep(INITIAL_GLOBAL_STATE),
      byTabId: { [tabId]: tab },
      users: { ...INITIAL_GLOBAL_STATE.users, byId: { [USER.id]: USER } },
    };
    setGlobal(global, { forceOutdated: true });
  });

  beforeEach(() => {
    delegateEvents(['click', 'mousedown', 'contextmenu']);
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  async function mount(props: { withAvatar?: boolean; appearanceOrder?: number }) {
    const el = container();
    dispose = render(
      () => (
        <SenderGroupContainer
          id="group-1"
          message={MESSAGE}
          withAvatar={props.withAvatar}
          appearanceOrder={props.appearanceOrder ?? 0}
        >
          <div class="wrapped-message">message</div>
        </SenderGroupContainer>
      ),
      el,
    );
    await harness.frame();
    await harness.frame();
    return el;
  }

  it('wraps the messages of the group in an element with the id and the group class', async () => {
    const el = await mount({ withAvatar: false });

    const root = el.querySelector<HTMLElement>('#group-1')!;
    expect(root).not.toBeNull();
    expect(root.classList.contains('sender-group-container')).toBe(true);
    expect(root.querySelector('.wrapped-message')!.textContent).toBe('message');
  });

  it('renders the avatar of the sender next to the messages when it is asked for', async () => {
    const el = await mount({ withAvatar: true });

    const avatar = el.querySelector('#group-1 .Avatar');
    expect(avatar).not.toBeNull();
    expect(avatar!.getAttribute('data-peer-id')).toBe('200');
    // the avatar comes before the messages
    expect(el.querySelector('#group-1')!.firstElementChild!.contains(avatar)).toBe(true);
  });

  it('renders no avatar when the list does not ask for it', async () => {
    const el = await mount({ withAvatar: false });

    expect(el.querySelector('.Avatar')).toBeNull();
  });

  it('shows the avatar of a group that appears later only after its delay', async () => {
    const el = await mount({ withAvatar: true, appearanceOrder: 3 });
    expect(el.querySelector('.Avatar')).toBeNull();

    await wait(3 * MESSAGE_APPEARANCE_DELAY + 30);
    await harness.frame();
    await harness.frame();
    expect(el.querySelector('.Avatar')).not.toBeNull();
  });

  it('opens the chat of the sender on a click on the avatar', async () => {
    const el = await mount({ withAvatar: true });

    // outside touch environments an avatar reacts to mousedown (tt's fast click)
    el.querySelector<HTMLElement>('.Avatar')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(actions.calls.openChat).toHaveBeenCalledWith({ id: '200' });
  });
});
