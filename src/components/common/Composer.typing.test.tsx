// Original test (not in telegram-tt): the typing status of the composer over a real throttle window, as tt sends it: the
// first change sends `typing` at once, changes within `SEND_MESSAGE_ACTION_INTERVAL` are folded into one more `typing` at
// the end of the window, nothing is sent once the input stops changing, and nothing at all while a message is edited.
import type { Editor } from '@tiptap/core';
import { flushSync } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getGlobal, setGlobal } from '../../global';

import type { ApiChat } from '../../api/types';
import type { GlobalState, TabState } from '../../global/types';
import { MAIN_THREAD_ID } from '../../api/types';

import { EDITABLE_INPUT_CSS_SELECTOR, EDITABLE_INPUT_ID, SEND_MESSAGE_ACTION_INTERVAL } from '../../config';
import { container, useDomHarness } from '../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../global/initialState';
import { addChats } from '../../global/reducers/chats';
import { addMessages } from '../../global/reducers/messages';
import { updateThreadInfo, updateThreadLocalState } from '../../global/reducers/threads';
import { addUsers } from '../../global/reducers/users';
import { getCurrentTabId } from '../../util/establishMultitabRole';
import { cloneDeep } from '../../util/iteratees';

import Composer from './Composer';

// Every action is a spy: the composer's own behaviour is what is under test, not the reducers.
const { actions } = vi.hoisted(() => {
  const fns: Record<string, ReturnType<typeof vi.fn>> = {};
  return {
    actions: new Proxy(fns, {
      get: (target, key: string) => {
        target[key] ??= vi.fn();
        return target[key];
      },
    }),
  };
});

vi.mock('../middle/composer/SymbolMenuButton', () => ({ default: () => undefined }));
vi.mock('../../global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../global')>()),
  getActions: () => actions,
}));

class ResizeObserverStub {
  observe = () => undefined;

  unobserve = () => undefined;

  disconnect = () => undefined;
}
globalThis.ResizeObserver ??= ResizeObserverStub;
HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
  this.open = false;
};
// jsdom has no layout for ranges; ProseMirror asks for them when it scrolls the selection into view
const EMPTY_RECT = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => EMPTY_RECT;

const tabId = getCurrentTabId();
const SELF_ID = '1000';
const ANN_ID = '2000';

const harness = useDomHarness();
let dispose: (() => void) | undefined;

function seed() {
  const tab: TabState = {
    ...cloneDeep(INITIAL_TAB_STATE),
    id: tabId,
    messageLists: [{ chatId: ANN_ID, threadId: MAIN_THREAD_ID, type: 'thread' }],
  };
  let global: GlobalState = { ...cloneDeep(INITIAL_GLOBAL_STATE), currentUserId: SELF_ID, byTabId: { [tabId]: tab } };
  global = addUsers(global, {
    [SELF_ID]: { id: SELF_ID, firstName: 'Me', type: 'userTypeRegular', isMin: false, phoneNumber: '' },
    [ANN_ID]: { id: ANN_ID, firstName: 'Ann', type: 'userTypeRegular', isMin: false, phoneNumber: '' },
  });
  global = addChats(global, {
    [ANN_ID]: { id: ANN_ID, title: 'Ann', type: 'chatTypePrivate', unreadCount: 0 } as ApiChat,
  });
  global = updateThreadInfo(global, { chatId: ANN_ID, threadId: MAIN_THREAD_ID });
  setGlobal(global, { forceOutdated: true });
}

beforeEach(() => {
  delegateEvents(['click', 'mousedown', 'keydown', 'focusin', 'focusout']);
  Object.values(actions).forEach((fn) => fn.mockReset());
  // The throttle of the typing status runs on `setInterval`
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.useRealTimers();
});

const frames = async (count = 4) => {
  for (let i = 0; i < count; i++) {
    flushSync();
    await harness.frame();
  }
};

async function mountComposer() {
  const root = container();
  dispose = render(
    () => (
      <div class="middle-column-footer">
        <Composer
          type="messageList"
          chatId={ANN_ID}
          threadId={MAIN_THREAD_ID}
          messageListType="thread"
          isReady
          isMobile={false}
          inputId="message-input-text"
          editableInputId={EDITABLE_INPUT_ID}
          editableInputCssSelector={EDITABLE_INPUT_CSS_SELECTOR}
        />
      </div>
    ),
    root,
  );
  // The editor bundle is a dynamic import: frames are run until tiptap has taken over the input.
  for (let i = 0; i < 200; i++) {
    const dom = root.querySelector<HTMLElement & { editor?: Editor }>('.ProseMirror');
    if (dom?.editor) {
      await frames();
      // The `cancel` of the mount opened a throttle window: let it close
      vi.advanceTimersByTime(SEND_MESSAGE_ACTION_INTERVAL * 2);
      actions.sendMessageAction.mockClear();
      return dom.editor;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    await frames(1);
  }
  throw new Error('the rich editor did not load');
}

const typingCalls = () =>
  actions.sendMessageAction.mock.calls.filter(([payload]) => payload?.action?.type === 'typing').length;

it('sends `typing` at once, then at most once per throttle window while the text changes', async () => {
  seed();
  const editor = await mountComposer();

  editor.commands.insertContent('a');
  await frames();
  expect(typingCalls()).toBe(1);
  expect(actions.sendMessageAction).toHaveBeenLastCalledWith(
    expect.objectContaining({ chatId: ANN_ID, threadId: MAIN_THREAD_ID, action: { type: 'typing' } }),
  );

  // more changes within the window: folded into one `typing` at the end of the window
  editor.commands.insertContent('b');
  await frames();
  vi.advanceTimersByTime(SEND_MESSAGE_ACTION_INTERVAL / 3);
  editor.commands.insertContent('c');
  await frames();
  expect(typingCalls()).toBe(1);
  vi.advanceTimersByTime(SEND_MESSAGE_ACTION_INTERVAL);
  expect(typingCalls()).toBe(2);

  // no change: nothing more, and the window closes
  vi.advanceTimersByTime(SEND_MESSAGE_ACTION_INTERVAL * 3);
  expect(typingCalls()).toBe(2);

  // the next change after the window is sent at once again
  editor.commands.insertContent('d');
  await frames();
  expect(typingCalls()).toBe(3);
});

it('sends no `typing` while a message is edited', async () => {
  seed();
  let global = addMessages(getGlobal(), [
    {
      id: 7,
      chatId: ANN_ID,
      date: 1_700_000_000,
      isOutgoing: true,
      senderId: SELF_ID,
      content: { text: { text: 'Old text' } },
    },
  ]);
  global = updateThreadLocalState(global, ANN_ID, MAIN_THREAD_ID, { editingId: 7 });
  setGlobal(global);
  const editor = await mountComposer();
  expect(editor.getText()).toBe('Old text');

  editor.commands.insertContent(', edited');
  await frames();
  vi.advanceTimersByTime(SEND_MESSAGE_ACTION_INTERVAL * 2);
  editor.commands.insertContent('!');
  await frames();
  vi.advanceTimersByTime(SEND_MESSAGE_ACTION_INTERVAL * 2);

  expect(typingCalls()).toBe(0);
});
