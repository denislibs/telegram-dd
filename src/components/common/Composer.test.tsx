// Original test (not in telegram-tt): the message composer of a private chat, mounted with a seeded global and the real
// rich editor (tiptap, loaded through the editor bundle): typing shows the send state of the main button and reports
// typing, the send button sends the text through `sendMessage`, and a chat switch resets the input before the content
// requested for the new chat is inserted.
import type { Editor } from '@tiptap/core';
import { createSignal, flushSync } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlobal, setGlobal } from '../../global';

import type { ApiChat, ApiUser } from '../../api/types';
import type { GlobalState, TabState } from '../../global/types';
import type { ThreadId } from '../../types';
import { MAIN_THREAD_ID } from '../../api/types';

import { EDITABLE_INPUT_CSS_SELECTOR, EDITABLE_INPUT_ID, SEND_MESSAGE_ACTION_INTERVAL } from '../../config';
import { container, useDomHarness } from '../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../global/initialState';
import { addChats } from '../../global/reducers/chats';
import { addMessages } from '../../global/reducers/messages';
import { updateTabState } from '../../global/reducers/tabs';
import { updateThreadInfo, updateThreadLocalState } from '../../global/reducers/threads';
import { addUsers } from '../../global/reducers/users';
import { getCurrentTabId } from '../../util/establishMultitabRole';
import { cloneDeep } from '../../util/iteratees';

import Composer from './Composer';

// Every action is a spy: the composer's own state is what is under test, not the reducers.
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

// The symbol menu itself has its own tests: here it is a stand-in that hands its props to the test.
const { symbolMenuButtonProps } = vi.hoisted(() => ({
  symbolMenuButtonProps: { current: undefined as undefined | { onEmojiSelect: (emoji: string) => void } },
}));
vi.mock('../middle/composer/SymbolMenuButton', () => ({
  default: (props: { onEmojiSelect: (emoji: string) => void }) => {
    symbolMenuButtonProps.current = props;
    return undefined;
  },
}));

vi.mock('../../global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../global')>()),
  getActions: () => actions,
}));

// jsdom has no ResizeObserver (the input is observed with one)
class ResizeObserverStub {
  observe = () => undefined;

  unobserve = () => undefined;

  disconnect = () => undefined;
}
globalThis.ResizeObserver ??= ResizeObserverStub;
// jsdom has no layout for ranges; ProseMirror asks for them when it scrolls the selection into view
const EMPTY_RECT = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => EMPTY_RECT;

const tabId = getCurrentTabId();
const SELF_ID = '1000';
const ANN_ID = '2000';
const BOB_ID = '3000';

const user = (id: string, firstName: string) =>
  ({ id, firstName, type: 'userTypeRegular', isMin: false, phoneNumber: '' }) as unknown as ApiUser;
const privateChat = (id: string) => ({ id, title: `Chat ${id}`, type: 'chatTypePrivate', unreadCount: 0 }) as ApiChat;

function seed(openChatId: string) {
  const tab: TabState = {
    ...cloneDeep(INITIAL_TAB_STATE),
    id: tabId,
    messageLists: [{ chatId: openChatId, threadId: MAIN_THREAD_ID, type: 'thread' }],
  };
  let global: GlobalState = { ...cloneDeep(INITIAL_GLOBAL_STATE), currentUserId: SELF_ID, byTabId: { [tabId]: tab } };
  global = addUsers(global, {
    [SELF_ID]: user(SELF_ID, 'Me'),
    [ANN_ID]: user(ANN_ID, 'Ann'),
    [BOB_ID]: user(BOB_ID, 'Bob'),
  });
  global = addChats(global, { [ANN_ID]: privateChat(ANN_ID), [BOB_ID]: privateChat(BOB_ID) });
  global = updateThreadInfo(global, { chatId: ANN_ID, threadId: MAIN_THREAD_ID });
  global = updateThreadInfo(global, { chatId: BOB_ID, threadId: MAIN_THREAD_ID });
  setGlobal(global, { forceOutdated: true });
}

function openList(chatId: string) {
  setGlobal(
    updateTabState(getGlobal(), { messageLists: [{ chatId, threadId: MAIN_THREAD_ID, type: 'thread' }] }, tabId),
  );
}

describe('Composer', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    delegateEvents(['click', 'mousedown', 'keydown', 'focusin', 'focusout', 'contextmenu']);
    Object.values(actions).forEach((fn) => fn.mockReset());
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

  // The editor bundle is a dynamic import: frames are run until tiptap has taken over the input.
  async function waitForEditor(root: HTMLElement) {
    for (let i = 0; i < 200; i++) {
      const dom =
        root.querySelector<HTMLElement & { editor?: Editor }>(`${EDITABLE_INPUT_CSS_SELECTOR} .ProseMirror`) ||
        root.querySelector<HTMLElement & { editor?: Editor }>('.ProseMirror');
      if (dom?.editor) {
        await frames();
        return dom.editor;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      await frames(1);
    }
    throw new Error('the rich editor did not load');
  }

  function mount(chatId: string, shouldSeed = true) {
    if (shouldSeed) seed(chatId);
    const [currentChatId, setCurrentChatId] = createSignal(chatId);
    const [threadId] = createSignal<ThreadId>(MAIN_THREAD_ID);
    const root = container();
    dispose = render(
      () => (
        <div class="middle-column-footer">
          <Composer
            type="messageList"
            chatId={currentChatId()}
            threadId={threadId()}
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
    return { root, setCurrentChatId };
  }

  it("renders tt's composer structure", async () => {
    const { root } = mount(ANN_ID);
    await frames();

    const composer = root.querySelector('.Composer')!;
    expect(composer.classList.contains('is-chat-composer')).toBe(true);
    expect(composer.querySelector(':scope > .composer-wrapper > .message-input-wrapper')).not.toBeNull();
    expect(composer.querySelector(':scope > .main-button')).not.toBeNull();
    expect(root.querySelector(`#${EDITABLE_INPUT_ID}`)).not.toBeNull();
  });

  it('sends the typed text with the send button', async () => {
    // The typing status goes through a throttle (`SEND_MESSAGE_ACTION_INTERVAL`) that runs on `setInterval`
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { root } = mount(ANN_ID);
    const editor = await waitForEditor(root);
    const mainButton = root.querySelector<HTMLButtonElement>('.Composer > .main-button')!;

    editor.commands.insertContent('Hello, Ann');
    await frames();

    expect(mainButton.classList.contains('send')).toBe(true);
    vi.advanceTimersByTime(SEND_MESSAGE_ACTION_INTERVAL);
    expect(actions.sendMessageAction).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: ANN_ID, threadId: MAIN_THREAD_ID, action: { type: 'typing' } }),
    );

    mainButton.click();
    await frames();
    await Promise.resolve();
    await frames();

    expect(actions.sendMessage).toHaveBeenCalledTimes(1);
    expect(actions.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageList: { chatId: ANN_ID, threadId: MAIN_THREAD_ID, type: 'thread' },
        text: 'Hello, Ann',
      }),
    );
    expect(actions.clearDraft).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: ANN_ID, threadId: MAIN_THREAD_ID, isLocalOnly: true }),
    );
    // The input is reset once the message animation started
    await frames();
    expect(editor.getText()).toBe('');
  });

  it('inserts an emoji from the symbol menu at the caret', async () => {
    const { root } = mount(ANN_ID);
    const editor = await waitForEditor(root);

    editor.commands.insertContent('ab');
    editor.commands.setTextSelection(2);
    await frames();

    symbolMenuButtonProps.current!.onEmojiSelect('😀');
    await frames();

    expect(editor.getText()).toBe('a😀b');
  });

  it('edits a message: the edited text is restored, the main button saves it through `editMessage`', async () => {
    seed(ANN_ID);
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
    const { root } = mount(ANN_ID, false);
    const editor = await waitForEditor(root);
    await frames();

    expect(editor.getText()).toBe('Old text');
    const mainButton = root.querySelector<HTMLButtonElement>('.Composer > .main-button')!;
    expect(mainButton.classList.contains('edit')).toBe(true);

    editor.commands.insertContent(', edited');
    await frames();
    mainButton.click();
    await frames();

    expect(actions.editMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Old text, edited', messageList: expect.objectContaining({ chatId: ANN_ID }) }),
    );
    expect(actions.sendMessage).not.toHaveBeenCalled();
  });

  it('resets the input on a chat switch, before the draft requested for the new chat is inserted', async () => {
    const { root, setCurrentChatId } = mount(ANN_ID);
    const editor = await waitForEditor(root);

    editor.commands.insertContent('Unsent text for Ann');
    await frames();
    expect(editor.getText()).toBe('Unsent text for Ann');

    setGlobal(
      updateTabState(getGlobal(), { requestedDraft: { chatId: BOB_ID, text: { text: 'Shared link' } } }, tabId),
    );
    openList(BOB_ID);
    setCurrentChatId(BOB_ID);
    await frames(8);

    expect(editor.getText()).toBe('Shared link');
    expect(actions.resetOpenChatWithDraft).toHaveBeenCalled();
  });

  it('restores the draft of the chat it switches to', async () => {
    const { root, setCurrentChatId } = mount(ANN_ID);
    setGlobal(
      updateThreadLocalState(getGlobal(), BOB_ID, MAIN_THREAD_ID, { draft: { text: { text: 'Draft for Bob' } } }),
    );
    const editor = await waitForEditor(root);

    editor.commands.insertContent('Unsent text for Ann');
    await frames();

    openList(BOB_ID);
    setCurrentChatId(BOB_ID);
    await frames(8);

    expect(editor.getText()).toBe('Draft for Bob');
  });

  it('resets the input on a chat switch', async () => {
    const { root, setCurrentChatId } = mount(ANN_ID);
    const editor = await waitForEditor(root);

    editor.commands.insertContent('Unsent text for Ann');
    await frames();

    openList(BOB_ID);
    setCurrentChatId(BOB_ID);
    await frames(8);

    expect(editor.getText()).toBe('');
    // The text of the chat being left is saved as its draft (`useDraft`), not lost by the reset
    expect(actions.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: ANN_ID, text: expect.objectContaining({ text: 'Unsent text for Ann' }) }),
    );
  });
});
