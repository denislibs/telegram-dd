// Original test (not in telegram-tt): starting a reply focuses the input, as tt's effect keyed on `replyInfo` did. The
// store merges a new reply into the draft's existing record, so the record keeps its identity from one reply to the
// next: the effect must key on the fields of the reply (editor review M1).
import { createSignal, flushSync } from 'frameact';
import { delegateEvents, render } from 'frameact/dom';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { getGlobal, setGlobal } from '../../../global';

import type { ApiInputDraftReplyInfo, ApiInputRichMessage } from '../../../api/types';
import type { TabState } from '../../../global/types';
import type { RichEditor, RichEditorRoot } from './richEditorTypes';
import { MAIN_THREAD_ID } from '../../../api/types';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import { INITIAL_GLOBAL_STATE, INITIAL_TAB_STATE } from '../../../global/initialState';
import { updateThreadInfo, updateThreadLocalState } from '../../../global/reducers/threads';
import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { cloneDeep } from '../../../util/iteratees';
import { buildRichMessageFromFormatted } from '../../ui/textInput/richText';

import MessageInput from './MessageInput';

vi.mock('../../../global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../global')>()),
  getActions: () => new Proxy({}, { get: () => vi.fn() }),
}));

const CHAT_ID = '100';
const EMPTY = buildRichMessageFromFormatted();

function createFakeEditor() {
  const [value, setValue] = createSignal<ApiInputRichMessage>(EMPTY);
  return {
    get value() {
      return value();
    },
    isReady: true,
    editor: undefined,
    canUndo: false,
    canRedo: false,
    hasUnresolvedMedia: false,
    isEmpty: () => true,
    registerRoot: (_root: RichEditorRoot) => () => undefined,
    setValue: (next?: ApiInputRichMessage) => setValue(next ?? EMPTY),
    replaceRange: () => undefined,
  } as unknown as RichEditor;
}

const harness = useDomHarness();
let dispose: (() => void) | undefined;

beforeAll(() => {
  const tabId = getCurrentTabId();
  const tab: TabState = { ...cloneDeep(INITIAL_TAB_STATE), id: tabId };
  setGlobal({ ...cloneDeep(INITIAL_GLOBAL_STATE), byTabId: { [tabId]: tab } }, { forceOutdated: true });
});

beforeEach(() => {
  delegateEvents(['keydown', 'click', 'mousedown', 'focusin', 'focusout']);
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
});

const frames = async (count = 4) => {
  for (let i = 0; i < count; i++) {
    flushSync();
    await harness.frame();
  }
};

it('every new reply focuses the input again, also when only a field of the reply changes', async () => {
  // The chat's thread exists before the input mounts, as in the app.
  setGlobal(updateThreadInfo(getGlobal(), { chatId: CHAT_ID, threadId: MAIN_THREAD_ID }), { forceOutdated: true });
  const root = container();
  const other = document.createElement('button');
  document.body.append(other);
  dispose = render(
    () => (
      <MessageInput
        id="message-input-root"
        editableInputId="editable-message-text"
        chatId={CHAT_ID}
        threadId={MAIN_THREAD_ID}
        richEditor={createFakeEditor()}
        isActive
        placeholder="Message"
        canAutoFocus
        canSendPlainText
        onSend={() => undefined}
      />
    ),
    root,
  );
  await frames();
  const input = root.querySelector<HTMLElement>('#editable-message-text')!;
  const focus = vi.spyOn(HTMLElement.prototype, 'focus');
  const inputFocusCount = () => focus.mock.contexts.filter((context) => context === input).length;

  const reply = async (replyInfo: ApiInputDraftReplyInfo) => {
    other.focus();
    await frames(2);
    const before = inputFocusCount();
    setGlobal(updateThreadLocalState(getGlobal(), CHAT_ID, MAIN_THREAD_ID, { draft: { replyInfo, isLocal: true } }));
    await frames();
    return { focusCalls: inputFocusCount() - before, active: document.activeElement === input };
  };

  expect(await reply({ type: 'message', replyToMsgId: 7 })).toEqual({ focusCalls: 1, active: true });
  expect(await reply({ type: 'message', replyToMsgId: 8 })).toEqual({ focusCalls: 1, active: true });
  expect(await reply({ type: 'message', replyToMsgId: 8, quoteText: { text: 'quote' }, quoteOffset: 3 })).toEqual({
    focusCalls: 1,
    active: true,
  });
  expect(await reply({ type: 'message', replyToMsgId: 8, quoteText: { text: 'other quote' }, quoteOffset: 3 })).toEqual(
    { focusCalls: 1, active: true },
  );
  expect(await reply({ type: 'message', replyToMsgId: 8, replyToPeerId: '200' })).toEqual({
    focusCalls: 1,
    active: true,
  });
});
